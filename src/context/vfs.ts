
import { ContextNode, ContextType, ContextLevel } from "./types.js";

export class VirtualFileSystem {
  private root: ContextNode;

  constructor() {
    this.root = {
      path: "/",
      type: ContextType.Directory,
      metadata: {},
      level: ContextLevel.L0,
      children: [],
    };
  }

  public mount(path: string, node: ContextNode): void {
    const parts = path.split("/").filter(Boolean);
    let current = this.root;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current.children) {
        current.children = [];
      }
      let next = current.children.find((c) => c.path.endsWith("/" + part));
      if (!next) {
        next = {
          path: current.path === "/" ? `/${part}` : `${current.path}/${part}`,
          type: ContextType.Directory,
          metadata: {},
          level: ContextLevel.L0,
          children: [],
        };
        current.children.push(next);
      }
      current = next;
    }

    const leafName = parts[parts.length - 1];
    if (leafName) {
      if (!current.children) {
        current.children = [];
      }
      // Ensure the node has the correct full path
      node.path = current.path === "/" ? `/${leafName}` : `${current.path}/${leafName}`;
      
      // If node exists, update it, otherwise push
      const existingIndex = current.children.findIndex(c => c.path === node.path);
      if (existingIndex >= 0) {
        current.children[existingIndex] = node;
      } else {
        current.children.push(node);
      }
    }
  }

  public resolve(path: string): ContextNode | null {
    if (path === "/") return this.root;
    const parts = path.split("/").filter(Boolean);
    let current = this.root;

    for (const part of parts) {
      if (!current.children) return null;
      const next = current.children.find((c) => c.path.endsWith("/" + part));
      if (!next) return null;
      current = next;
    }

    return current;
  }

  public list(path: string): ContextNode[] {
    const node = this.resolve(path);
    return node?.children || [];
  }

  public traverse(visitor: (node: ContextNode) => void, startPath: string = "/"): void {
    const startNode = this.resolve(startPath);
    if (!startNode) return;

    const stack = [startNode];
    while (stack.length > 0) {
      const current = stack.pop()!;
      visitor(current);
      if (current.children) {
        // Push children in reverse order to process them in original order
        for (let i = current.children.length - 1; i >= 0; i--) {
          stack.push(current.children[i]);
        }
      }
    }
  }

  public delete(path: string): boolean {
    const parts = path.split("/").filter(Boolean);
    if (parts.length === 0) return false; // Cannot delete root

    const leafName = parts[parts.length - 1];
    const parentPath = "/" + parts.slice(0, parts.length - 1).join("/");
    const parent = this.resolve(parentPath);

    if (!parent || !parent.children) return false;

    const index = parent.children.findIndex((c) => c.path === path);
    if (index === -1) return false;

    parent.children.splice(index, 1);
    return true;
  }
  
  public toJSON(): any {
      return this.root;
  }
}
