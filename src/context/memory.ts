
import { readdir, readFile, stat, writeFile, mkdir } from "fs/promises";
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
    } catch (error: any) {
      if (error?.code === "ENOENT") {
        // Directory doesn't exist, which is fine for new sessions
        return;
      }
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

  public async saveFile(node: ContextNode): Promise<boolean> {
    try {
      // Determine the filesystem path based on the virtual path
      let fsPath: string;
      
      if (node.path.startsWith('/user/memories')) {
        const relativePath = node.path.replace('/user/memories', '');
        fsPath = resolve(process.cwd(), 'user/memories' + relativePath);
      } else if (node.path.startsWith('/user/sessions')) {
        const relativePath = node.path.replace('/user/sessions', '');
        fsPath = resolve(process.cwd(), 'user/sessions' + relativePath);
      } else if (node.path.startsWith('/agent/memories')) {
        const relativePath = node.path.replace('/agent/memories', '');
        fsPath = resolve(process.cwd(), 'agent/memories' + relativePath);
      } else {
        // Default to user memories for new files
        fsPath = resolve(process.cwd(), 'user/memories' + node.path);
      }

      // Ensure the directory exists
      const dirPath = fsPath.substring(0, fsPath.lastIndexOf('/'));
      await this.ensureDirectory(dirPath);

      // Write the file content
      await writeFile(fsPath, node.content || '', 'utf-8');

      // Update the node's filesystem path metadata
      node.metadata.fsPath = fsPath;
      node.metadata.mtime = new Date().toISOString();

      return true;
    } catch (error) {
      console.error(`Failed to save file ${node.path}:`, error);
      return false;
    }
  }

  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await mkdir(dirPath, { recursive: true });
    } catch (error: any) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }
    }
  }
}
