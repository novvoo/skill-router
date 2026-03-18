
import { VirtualFileSystem } from "./vfs.js";
import { MemoryManager } from "./memory.js";
import { ContextRetriever } from "./retriever.js";
import { RetrievalOptions, RetrievalResult, ContextNode, ContextType, ContextLevel } from "./types.js";
import { OpenAIConfig } from "../handler.js";
import { createEmbeddings } from "./embeddings.js";
import { saveSession } from "./session.js";

export class ContextManager {
  private vfs: VirtualFileSystem;
  private memoryManager: MemoryManager;
  private retriever: ContextRetriever;
  private loaded: boolean = false;
  private indexed: boolean = false;
  private indexingPromise: Promise<void> | null = null;
  private reporter: ((e: { stage: string; message: string; data?: any }) => void) | null = null;
  private config: OpenAIConfig;
  private sessionId: string | undefined;

  constructor(config: OpenAIConfig, sessionId?: string) {
    this.config = config;
    this.sessionId = sessionId;
    this.vfs = new VirtualFileSystem();
    this.memoryManager = new MemoryManager(this.vfs, sessionId);
    
    // Create an embedding function wrapper
    const embedFn = async (text: string) => {
      const result = await createEmbeddings(config, [text]);
      return result[0];
    };
    
    this.retriever = new ContextRetriever(this.vfs, embedFn);
  }

  public setReporter(fn: ((e: { stage: string; message: string; data?: any }) => void) | null) {
    this.reporter = fn;
  }

  public async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await this.memoryManager.loadAll();
    this.loaded = true;
  }

  public async ensureIndexed(): Promise<void> {
    if (this.indexed) return;
    if (this.indexingPromise) return this.indexingPromise;
    this.indexingPromise = (async () => {
      await this.ensureLoaded();
      const nodesAll: ContextNode[] = [];
      this.vfs.traverse((node) => {
        if (node.type !== ContextType.Directory && (node.content || node.summary)) {
          nodesAll.push(node);
        }
      });

      const includeSessions = String(process.env.MEMORY_INDEX_INCLUDE_SESSIONS || "").trim() === "1";
      const maxSessions = readEnvInt("MEMORY_INDEX_MAX_SESSIONS", 30);
      const includeSkills = String(process.env.MEMORY_INDEX_INCLUDE_SKILLS || "").trim() === "1";
      const nodes = (() => {
        const base = nodesAll.filter((n) => includeSkills || n.type !== ContextType.Skill);
        if (includeSessions) {
          const sessions = base
            .filter((n) => n.type === ContextType.Session)
            .sort((a, b) => {
              const ta = a.metadata?.mtime ? new Date(a.metadata.mtime).getTime() : a.metadata?.created ? new Date(a.metadata.created).getTime() : 0;
              const tb = b.metadata?.mtime ? new Date(b.metadata.mtime).getTime() : b.metadata?.created ? new Date(b.metadata.created).getTime() : 0;
              return tb - ta;
            })
            .slice(0, Math.max(0, maxSessions));
          const others = base.filter((n) => n.type !== ContextType.Session);
          return [...others, ...sessions];
        }
        return base.filter((n) => n.type !== ContextType.Session);
      })();

      const concurrency = readEnvInt("MEMORY_INDEX_CONCURRENCY", 4);
      const itemTimeoutMs = readEnvInt("MEMORY_INDEX_ITEM_TIMEOUT_MS", 20_000);
      const heartbeatMs = readEnvInt("MEMORY_INDEX_HEARTBEAT_MS", 2000);
      const startedAt = Date.now();
      let done = 0;
      let failed = 0;
      let lastPath = "";
      let heartbeat: any = null;
      if (heartbeatMs > 0) {
        heartbeat = setInterval(() => {
          this.reporter?.({
            stage: "memory_index_heartbeat",
            message: "索引上下文中",
            data: {
              total: nodes.length,
              done,
              failed,
              last_path: lastPath || null,
              elapsed_ms: Date.now() - startedAt,
              concurrency,
              item_timeout_ms: itemTimeoutMs,
            },
          });
        }, heartbeatMs);
      }

      this.reporter?.({
        stage: "memory_index_start",
        message: "开始索引上下文",
        data: {
          total: nodes.length,
          concurrency,
          item_timeout_ms: itemTimeoutMs,
          include_sessions: includeSessions,
          max_sessions: includeSessions ? maxSessions : 0,
          include_skills: includeSkills,
        },
      });

      let next = 0;
      const workers = new Array(concurrency).fill(0).map(async () => {
        while (true) {
          const i = next++;
          if (i >= nodes.length) break;
          const node = nodes[i];
          try {
            lastPath = node.path;
            await withTimeout(this.retriever.indexNode(node), itemTimeoutMs, `indexNode(${node.path})`);
            done++;
          } catch {
            failed++;
          }
        }
      });

      await Promise.all(workers).finally(() => {
        if (heartbeat) clearInterval(heartbeat);
      });

      this.reporter?.({
        stage: "memory_index_done",
        message: "上下文索引完成",
        data: { total: nodes.length, done, failed, elapsed_ms: Date.now() - startedAt },
      });
      this.indexed = true;
    })().finally(() => {
      if (!this.indexed) this.indexingPromise = null;
    });
    return this.indexingPromise;
  }

  public async init(): Promise<void> {
    await this.ensureIndexed();
  }

  public async search(query: string, options: Partial<RetrievalOptions> = {}): Promise<RetrievalResult> {
    await this.ensureIndexed();
    
    return this.retriever.retrieve({
      query,
      maxResults: options.maxResults || 5,
      minScore: options.minScore || 0.5,
      targetDirectories: options.targetDirectories || ["/user"],
    });
  }

  public getContextNode(path: string): ContextNode | null {
    return this.vfs.resolve(path);
  }

  public async addMemory(path: string, content: string, summary?: string): Promise<void> {
    await this.ensureLoaded();
    const node: ContextNode = {
      path,
      type: ContextType.Memory,
      metadata: { created: new Date().toISOString() },
      content,
      summary: summary || content.slice(0, 100),
      level: ContextLevel.L2,
    };
    
    this.vfs.mount(path, node);
    if (this.indexed) await this.retriever.indexNode(node);
    
    // TODO: Persist to disk via MemoryManager (not implemented yet)
  }

  public async persistSession(messages: Array<{ role: string; content: string }>, summary?: string): Promise<void> {
    await this.ensureLoaded();
    const filePath = await saveSession(messages, summary, this.sessionId);
    const filename = filePath.split(/[\\/]/).pop()!;
    const vfsPath = `/user/sessions/${filename}`;
    
    const content = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    const node: ContextNode = {
      path: vfsPath,
      type: ContextType.Session,
      metadata: { fsPath: filePath, created: new Date().toISOString() },
      content,
      summary: summary || content.slice(0, 100),
      level: ContextLevel.L2,
    };
    
    this.vfs.mount(vfsPath, node);
    if (this.indexed) await this.retriever.indexNode(node);
  }

  public async deleteMemory(path: string): Promise<boolean> {
      await this.ensureLoaded();
      const deleted = this.vfs.delete(path);
      if (deleted) {
          this.retriever.removeNode(path);
      }
      return deleted;
  }
  
  public list(path: string = "/"): ContextNode[] {
      const node = this.vfs.resolve(path);
      return node ? node.children || [] : [];
  }

  public getTree(): any {
      return this.vfs.toJSON();
  }
}

function readEnvInt(name: string, fallback: number): number {
  const raw = String(process.env[name] || "").trim();
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  const timeoutMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
  if (!timeoutMs) return p;
  let t: any;
  const timeout = new Promise<T>((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (t) clearTimeout(t);
  });
}
