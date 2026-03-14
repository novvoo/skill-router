
import { ContextNode, ContextType, ContextLevel, RetrievalOptions, RetrievalResult } from "./types.js";
import { VirtualFileSystem } from "./vfs.js";

// Mock embedding function interface
export interface EmbeddingFunction {
  (text: string): Promise<number[]>;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// Simple keyword overlap score (0.0 - 1.0)
function keywordScore(query: string, text: string): number {
    const qTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    if (!qTerms.length) return 0;
    
    const target = text.toLowerCase();
    let matches = 0;
    for (const term of qTerms) {
        if (target.includes(term)) matches++;
    }
    return matches / qTerms.length;
}

export class ContextRetriever {
  private vfs: VirtualFileSystem;
  private embed: EmbeddingFunction;
  private nodeEmbeddings: Map<string, number[]> = new Map();

  constructor(vfs: VirtualFileSystem, embed: EmbeddingFunction) {
    this.vfs = vfs;
    this.embed = embed;
  }

  // Pre-calculate embeddings for nodes
  public async indexNode(node: ContextNode): Promise<void> {
    const content = node.content || node.summary || node.path;
    if (content) {
      const vec = await this.embed(content);
      this.nodeEmbeddings.set(node.path, vec);
    }
  }

  public removeNode(path: string): void {
    this.nodeEmbeddings.delete(path);
  }

  public async retrieve(options: RetrievalOptions): Promise<RetrievalResult> {
    const queryVec = await this.embed(options.query);
    const trajectory: string[] = [];
    const candidates: ContextNode[] = [];

    trajectory.push(`Start retrieval for query: "${options.query}"`);

    const targets = options.targetDirectories || ["/"];
    const now = Date.now();
    
    for (const target of targets) {
        trajectory.push(`Scanning directory: ${target}`);
        this.vfs.traverse((node) => {
            // Skip directory nodes for semantic search, only index content nodes
            if (node.type === ContextType.Directory) {
                 trajectory.push(`Visiting directory: ${node.path}`);
                 return;
            }

            const vec = this.nodeEmbeddings.get(node.path);
            let score = 0;
            let semanticScore = 0;
            let keywordBonus = 0;
            let recencyBonus = 0;

            if (vec) {
                semanticScore = cosineSimilarity(queryVec, vec);
            }
            
            // Keyword matching (Hybrid Search)
            // Especially important when using Mock Embeddings
            const content = node.content || node.summary || "";
            keywordBonus = keywordScore(options.query, content);

            // Recency Bonus for Sessions
            // If the query asks for "last", "previous", "recent", etc., boost recent sessions significantly
            if (node.type === ContextType.Session && node.metadata?.created) {
                const created = new Date(node.metadata.created).getTime();
                const ageMs = now - created;
                // Boost sessions created within last 24 hours
                // Decay factor: 1.0 at 0ms, 0.5 at 24h
                const dayMs = 24 * 60 * 60 * 1000;
                const recency = Math.max(0, 1 - (ageMs / dayMs));
                
                // If query implies temporal context, boost heavily
                const temporalTerms = ["最近", "上一个", "last", "previous", "latest", "recent", "任务"];
                if (temporalTerms.some(t => options.query.includes(t))) {
                    recencyBonus = recency * 0.8; // Huge boost for recent sessions
                } else {
                    recencyBonus = recency * 0.2; // Small boost otherwise
                }
            }

            // Weighted sum
            // If semantic score is very low (mock embedding), rely on keyword + recency
            score = (semanticScore * 0.4) + (keywordBonus * 0.4) + recencyBonus;

            trajectory.push(`Checked node: ${node.path}, Score: ${score.toFixed(4)} (Sem: ${semanticScore.toFixed(2)}, Key: ${keywordBonus.toFixed(2)}, Rec: ${recencyBonus.toFixed(2)})`);
            
            // Lower threshold because Mock embeddings might give near-zero semantic scores
            // But we want to capture nodes with high Keyword or Recency scores
            if (score >= 0.1) {
                candidates.push({ ...node, score });
            }
        }, target);
    }

    // Sort by score
    candidates.sort((a, b) => (b.score || 0) - (a.score || 0));

    const final = candidates.slice(0, options.maxResults || 5);
    trajectory.push(`Selected top ${final.length} candidates.`);

    return {
      nodes: final,
      trajectory,
    };
  }
}
