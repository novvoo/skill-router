
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
  private initialized: boolean = false;
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

  public async init(): Promise<void> {
    if (this.initialized) return;
    
    // Load memories into VFS
    await this.memoryManager.loadAll();
    
    // Index content for retrieval
    // We only index nodes with content or summary
    const indexPromises: Promise<void>[] = [];
    this.vfs.traverse((node) => {
      if (node.type !== ContextType.Directory && (node.content || node.summary)) {
        indexPromises.push(this.retriever.indexNode(node));
      }
    });
    
    await Promise.all(indexPromises);
    this.initialized = true;
  }

  public async search(query: string, options: Partial<RetrievalOptions> = {}): Promise<RetrievalResult> {
    if (!this.initialized) await this.init();
    
    return this.retriever.retrieve({
      query,
      maxResults: options.maxResults || 5,
      minScore: options.minScore || 0.5,
      targetDirectories: options.targetDirectories || ["/"],
    });
  }

  public getContextNode(path: string): ContextNode | null {
    return this.vfs.resolve(path);
  }

  public async addMemory(path: string, content: string, summary?: string): Promise<void> {
    const node: ContextNode = {
      path,
      type: ContextType.Memory,
      metadata: { created: new Date().toISOString() },
      content,
      summary: summary || content.slice(0, 100),
      level: ContextLevel.L2,
    };
    
    this.vfs.mount(path, node);
    await this.retriever.indexNode(node);
    
    // TODO: Persist to disk via MemoryManager (not implemented yet)
  }

  public async persistSession(messages: Array<{ role: string; content: string }>, summary?: string): Promise<void> {
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
    await this.retriever.indexNode(node);
  }

  public async deleteMemory(path: string): Promise<boolean> {
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
