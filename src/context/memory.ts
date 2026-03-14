
import { readdir, readFile, stat } from "fs/promises";
import { join, resolve } from "path";
import { ContextNode, ContextType, ContextLevel } from "./types.js";
import { VirtualFileSystem } from "./vfs.js";

const USER_MEMORIES_DIR = resolve(process.cwd(), "user/memories");
const USER_SESSIONS_DIR = resolve(process.cwd(), "user/sessions");
const AGENT_MEMORIES_DIR = resolve(process.cwd(), "agent/memories");
const AGENT_SKILLS_DIR = resolve(process.cwd(), "agent/skills");

export class MemoryManager {
  private vfs: VirtualFileSystem;
  private sessionId: string | undefined;

  constructor(vfs: VirtualFileSystem, sessionId?: string) {
    this.vfs = vfs;
    this.sessionId = sessionId;
  }

  public async loadAll(): Promise<void> {
    const userMemories = this.sessionId ? `user/${this.sessionId}/memories` : "user/memories";
    const userSessions = this.sessionId ? `user/${this.sessionId}/sessions` : "user/sessions";
    const userMemoriesPath = resolve(process.cwd(), userMemories);
    const userSessionsPath = resolve(process.cwd(), userSessions);
    
    await this.loadDirectory(userMemoriesPath, "/user/memories", ContextType.Memory);
    await this.loadDirectory(userSessionsPath, "/user/sessions", ContextType.Session);
    await this.loadDirectory(AGENT_MEMORIES_DIR, "/agent/memories", ContextType.Memory);
    await this.loadDirectory(AGENT_SKILLS_DIR, "/agent/skills", ContextType.Skill);
  }

  private async loadDirectory(fsPath: string, vfsPath: string, type: ContextType): Promise<void> {
    try {
      const entries = await readdir(fsPath);
      for (const entry of entries) {
        if (entry.startsWith(".")) continue;
        const fullPath = join(fsPath, entry);
        const stats = await stat(fullPath);

        if (stats.isDirectory()) {
          // Recursive load
          await this.loadDirectory(fullPath, `${vfsPath}/${entry}`, type);
        } else if (stats.isFile() && entry.endsWith(".md")) {
          // Load file content (L1 level initially - just summary/metadata)
          // For now, we load full content as L2 because files are small.
          // But to demonstrate L0/L1/L2, let's just load metadata first.
          
          const content = await readFile(fullPath, "utf-8");
          const summary = content.slice(0, 200) + "..."; // Simple summary
          
          const node: ContextNode = {
            path: `${vfsPath}/${entry}`,
            type: type,
            metadata: {
              fsPath: fullPath,
              size: stats.size,
              mtime: stats.mtime,
            },
            summary: summary,
            content: content, // Pre-load content for now, but in real L2 we'd load on demand
            level: ContextLevel.L2,
          };
          
          this.vfs.mount(node.path, node);
        }
      }
    } catch (error) {
      console.error(`Failed to load directory ${fsPath}:`, error);
    }
  }

  public async getContextNode(path: string, level: ContextLevel): Promise<ContextNode | null> {
    const node = this.vfs.resolve(path);
    if (!node) return null;

    if (node.level === level || level === ContextLevel.L0) {
      return node;
    }

    // Upgrade level logic if needed (e.g., fetch from DB or FS if not loaded)
    // Since we pre-loaded content in loadDirectory, we are good for now.
    
    return node;
  }
}
