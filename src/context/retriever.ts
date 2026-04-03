
import { ContextNode, ContextType, ContextLevel, RetrievalOptions, RetrievalResult } from "./types.js";
import { VirtualFileSystem } from "./vfs.js";

// Mock embedding function interface
export interface EmbeddingFunction {
  (text: string): Promise<number[]>;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  if (a.length === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA <= 0 || magB <= 0) return 0;
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  const score = dot / denom;
  return Number.isFinite(score) ? score : 0;
}

// Simple keyword overlap score (0.0 - 1.0)
function keywordScore(query: string, text: string, caseSensitive: boolean = false, phraseSearch: boolean = false): number {
    if (phraseSearch) {
        // Exact phrase matching
        const targetText = caseSensitive ? text : text.toLowerCase();
        const searchQuery = caseSensitive ? query : query.toLowerCase();
        return targetText.includes(searchQuery) ? 1.0 : 0.0;
    }
    
    const qTerms = (caseSensitive ? query : query.toLowerCase()).split(/\s+/).filter(t => t.length > 1);
    if (!qTerms.length) return 0;
    
    const target = caseSensitive ? text : text.toLowerCase();
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
    const raw = node.summary || node.content || node.path;
    const content = String(raw || "").slice(0, 8000);
    if (content.trim()) {
      const vec = await this.embed(content);
      this.nodeEmbeddings.set(node.path, vec);
    }
  }

  public removeNode(path: string): void {
    this.nodeEmbeddings.delete(path);
  }

  public async retrieve(options: RetrievalOptions): Promise<RetrievalResult> {
    const hasSemanticIndex = this.nodeEmbeddings.size > 0;
    const queryVec = hasSemanticIndex ? await this.embed(options.query) : [];
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

            // Check if node should be excluded
            if (options.excludePaths && options.excludePaths.some(exclude => node.path.startsWith(exclude))) {
                trajectory.push(`Excluded node: ${node.path}`);
                return;
            }

            // Check file type filter
            if (options.fileTypes && options.fileTypes.length > 0) {
                const fileName = node.path.split('/').pop() || '';
                const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
                if (!options.fileTypes.some(type => type.toLowerCase() === fileExtension)) {
                    trajectory.push(`Filtered out node ${node.path} by file type`);
                    return;
                }
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
            keywordBonus = keywordScore(options.query, content, options.caseSensitive, options.phraseSearch);

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
            if (score >= (options.minScore || 0.1)) {
                candidates.push({ ...node, score });
            }
        }, target);
    }

    // Sort results based on sortBy option
    if (options.sortBy === 'date') {
        candidates.sort((a, b) => {
            const dateA = a.metadata?.mtime ? new Date(a.metadata.mtime).getTime() : 0;
            const dateB = b.metadata?.mtime ? new Date(b.metadata.mtime).getTime() : 0;
            return dateB - dateA;
        });
    } else if (options.sortBy === 'name') {
        candidates.sort((a, b) => {
            const nameA = a.path.split('/').pop() || '';
            const nameB = b.path.split('/').pop() || '';
            return nameA.localeCompare(nameB);
        });
    } else {
        // Default: sort by relevance
        candidates.sort((a, b) => (b.score || 0) - (a.score || 0));
    }

    const final = candidates.slice(0, options.maxResults || 5);
    trajectory.push(`Selected top ${final.length} candidates.`);

    return {
      nodes: final,
      trajectory,
    };
  }
}
