import { EventEmitter } from 'events';
import { SemanticVector, SemanticScore, SemanticScorer } from './SemanticScorer';

export interface MemoryEntry {
  id: string;
  vector: SemanticVector;
  data: any;
  metadata: {
    provider: string;
    model: string;
    timestamp: number;
    accessCount: number;
    lastAccessed: number;
    tags: string[];
    cost: number;
    tokens: number;
  };
}

export interface SearchResult {
  entry: MemoryEntry;
  score: SemanticScore;
  retrievalTime: number;
}

export class FastMemoryStore extends EventEmitter {
  private static instance: FastMemoryStore;
  private memory: Map<string, MemoryEntry> = new Map();
  private indexedVectors: Map<string, Set<string>> = new Map(); // keyword -> entry IDs
  private intentIndex: Map<string, Set<string>> = new Map(); // intent -> entry IDs
  private providerIndex: Map<string, Set<string>> = new Map(); // provider -> entry IDs
  private recentlyAccessed: string[] = []; // LRU cache
  private semanticScorer: SemanticScorer;
  private maxMemorySize: number = 10000;
  private maxRecentSize: number = 1000;

  private constructor() {
    super();
    this.semanticScorer = SemanticScorer.getInstance();
    this.startPeriodicCleanup();
  }

  public static getInstance(): FastMemoryStore {
    if (!FastMemoryStore.instance) {
      FastMemoryStore.instance = new FastMemoryStore();
    }
    return FastMemoryStore.instance;
  }

  public store(
    id: string, 
    text: string, 
    data: any, 
    metadata: Omit<MemoryEntry['metadata'], 'timestamp' | 'accessCount' | 'lastAccessed'>
  ): void {
    const vector = this.semanticScorer.extractSemanticVector(text);
    
    const entry: MemoryEntry = {
      id,
      vector,
      data,
      metadata: {
        ...metadata,
        timestamp: Date.now(),
        accessCount: 0,
        lastAccessed: Date.now()
      }
    };

    // Store entry
    this.memory.set(id, entry);

    // Update indexes
    this.updateIndexes(id, vector, metadata.provider);

    // Update vocabulary for learning
    this.semanticScorer.updateVocabulary(text);

    // Manage memory size
    this.enforceMemoryLimits();

    this.emit('stored', { id, vector, metadata });
  }

  public fastSearch(
    queryText: string, 
    options: {
      limit?: number;
      minSimilarity?: number;
      provider?: string;
      intent?: string;
      maxAge?: number;
    } = {}
  ): SearchResult[] {
    const startTime = Date.now();
    const {
      limit = 10,
      minSimilarity = 0.5,
      provider,
      intent,
      maxAge = 24 * 60 * 60 * 1000 // 24 hours
    } = options;

    const queryVector = this.semanticScorer.extractSemanticVector(queryText);
    const candidateIds = this.getCandidateIds(queryVector, provider, intent);
    const results: SearchResult[] = [];
    const now = Date.now();

    for (const id of candidateIds) {
      const entry = this.memory.get(id);
      if (!entry) continue;

      // Age filter
      if (maxAge > 0 && now - entry.metadata.timestamp > maxAge) {
        continue;
      }

      const score = this.semanticScorer.calculateSimilarity(queryVector, entry.vector);
      
      if (score.similarity >= minSimilarity) {
        const retrievalTime = Date.now() - startTime;
        results.push({ entry, score, retrievalTime });

        // Update access patterns
        this.updateAccess(id);
      }

      // Early termination for performance
      if (results.length >= limit * 2) break;
    }

    // Sort by similarity and confidence
    results.sort((a, b) => {
      const scoreA = a.score.similarity * a.score.confidence;
      const scoreB = b.score.similarity * b.score.confidence;
      return scoreB - scoreA;
    });

    const finalResults = results.slice(0, limit);
    
    this.emit('searched', {
      query: queryText,
      candidatesScanned: candidateIds.size,
      resultsFound: finalResults.length,
      searchTime: Date.now() - startTime
    });

    return finalResults;
  }

  public getById(id: string): MemoryEntry | null {
    const entry = this.memory.get(id);
    if (entry) {
      this.updateAccess(id);
    }
    return entry || null;
  }

  public remove(id: string): boolean {
    const entry = this.memory.get(id);
    if (!entry) return false;

    // Remove from main memory
    this.memory.delete(id);

    // Remove from indexes
    this.removeFromIndexes(id, entry.vector, entry.metadata.provider);

    // Remove from recent access
    this.recentlyAccessed = this.recentlyAccessed.filter(recentId => recentId !== id);

    this.emit('removed', { id });
    return true;
  }

  public getStats(): any {
    const now = Date.now();
    const entries = Array.from(this.memory.values());
    
    return {
      totalEntries: this.memory.size,
      indexedKeywords: this.indexedVectors.size,
      indexedIntents: this.intentIndex.size,
      indexedProviders: this.providerIndex.size,
      averageAccessCount: entries.reduce((sum, e) => sum + e.metadata.accessCount, 0) / entries.length || 0,
      recentlyAccessedCount: this.recentlyAccessed.length,
      memoryUsage: {
        current: this.memory.size,
        limit: this.maxMemorySize,
        utilizationPercent: (this.memory.size / this.maxMemorySize * 100).toFixed(1)
      },
      ageDistribution: {
        lastHour: entries.filter(e => now - e.metadata.timestamp < 60 * 60 * 1000).length,
        lastDay: entries.filter(e => now - e.metadata.timestamp < 24 * 60 * 60 * 1000).length,
        lastWeek: entries.filter(e => now - e.metadata.timestamp < 7 * 24 * 60 * 60 * 1000).length,
        older: entries.filter(e => now - e.metadata.timestamp >= 7 * 24 * 60 * 60 * 1000).length
      }
    };
  }

  public clear(): void {
    this.memory.clear();
    this.indexedVectors.clear();
    this.intentIndex.clear();
    this.providerIndex.clear();
    this.recentlyAccessed = [];
    this.emit('cleared');
  }

  public exportMemory(): any {
    return {
      entries: Array.from(this.memory.entries()),
      indexes: {
        vectors: Array.from(this.indexedVectors.entries()),
        intents: Array.from(this.intentIndex.entries()),
        providers: Array.from(this.providerIndex.entries())
      },
      recentlyAccessed: this.recentlyAccessed,
      timestamp: Date.now()
    };
  }

  public importMemory(data: any): void {
    this.clear();
    
    if (data.entries) {
      data.entries.forEach(([id, entry]: [string, MemoryEntry]) => {
        this.memory.set(id, entry);
      });
    }
    
    if (data.indexes) {
      if (data.indexes.vectors) {
        data.indexes.vectors.forEach(([key, ids]: [string, string[]]) => {
          this.indexedVectors.set(key, new Set(ids));
        });
      }
      
      if (data.indexes.intents) {
        data.indexes.intents.forEach(([key, ids]: [string, string[]]) => {
          this.intentIndex.set(key, new Set(ids));
        });
      }
      
      if (data.indexes.providers) {
        data.indexes.providers.forEach(([key, ids]: [string, string[]]) => {
          this.providerIndex.set(key, new Set(ids));
        });
      }
    }
    
    if (data.recentlyAccessed) {
      this.recentlyAccessed = data.recentlyAccessed;
    }
    
    this.emit('imported', { entriesCount: this.memory.size });
  }

  private updateIndexes(id: string, vector: SemanticVector, provider: string): void {
    // Index by keywords
    vector.keywords.forEach(keyword => {
      if (!this.indexedVectors.has(keyword)) {
        this.indexedVectors.set(keyword, new Set());
      }
      this.indexedVectors.get(keyword)!.add(id);
    });

    // Index by intent
    if (!this.intentIndex.has(vector.intent)) {
      this.intentIndex.set(vector.intent, new Set());
    }
    this.intentIndex.get(vector.intent)!.add(id);

    // Index by provider
    if (!this.providerIndex.has(provider)) {
      this.providerIndex.set(provider, new Set());
    }
    this.providerIndex.get(provider)!.add(id);

    // Index by entities
    vector.entities.forEach(entity => {
      if (!this.indexedVectors.has(entity)) {
        this.indexedVectors.set(entity, new Set());
      }
      this.indexedVectors.get(entity)!.add(id);
    });
  }

  private removeFromIndexes(id: string, vector: SemanticVector, provider: string): void {
    // Remove from keyword indexes
    vector.keywords.forEach(keyword => {
      this.indexedVectors.get(keyword)?.delete(id);
      if (this.indexedVectors.get(keyword)?.size === 0) {
        this.indexedVectors.delete(keyword);
      }
    });

    // Remove from intent index
    this.intentIndex.get(vector.intent)?.delete(id);
    if (this.intentIndex.get(vector.intent)?.size === 0) {
      this.intentIndex.delete(vector.intent);
    }

    // Remove from provider index
    this.providerIndex.get(provider)?.delete(id);
    if (this.providerIndex.get(provider)?.size === 0) {
      this.providerIndex.delete(provider);
    }

    // Remove from entity indexes
    vector.entities.forEach(entity => {
      this.indexedVectors.get(entity)?.delete(id);
      if (this.indexedVectors.get(entity)?.size === 0) {
        this.indexedVectors.delete(entity);
      }
    });
  }

  private getCandidateIds(
    queryVector: SemanticVector, 
    provider?: string, 
    intent?: string
  ): Set<string> {
    const candidates = new Set<string>();

    // Get candidates by intent (highest priority)
    const targetIntent = intent || queryVector.intent;
    const intentCandidates = this.intentIndex.get(targetIntent);
    if (intentCandidates) {
      intentCandidates.forEach(id => candidates.add(id));
    }

    // Get candidates by keywords
    queryVector.keywords.forEach(keyword => {
      const keywordCandidates = this.indexedVectors.get(keyword);
      if (keywordCandidates) {
        keywordCandidates.forEach(id => candidates.add(id));
      }
    });

    // Get candidates by entities
    queryVector.entities.forEach(entity => {
      const entityCandidates = this.indexedVectors.get(entity);
      if (entityCandidates) {
        entityCandidates.forEach(id => candidates.add(id));
      }
    });

    // Filter by provider if specified
    if (provider) {
      const providerCandidates = this.providerIndex.get(provider);
      if (providerCandidates) {
        const filteredCandidates = new Set<string>();
        candidates.forEach(id => {
          if (providerCandidates.has(id)) {
            filteredCandidates.add(id);
          }
        });
        return filteredCandidates;
      } else {
        return new Set(); // No candidates for this provider
      }
    }

    // If no indexed candidates, fall back to recently accessed
    if (candidates.size === 0) {
      this.recentlyAccessed.slice(-100).forEach(id => {
        if (this.memory.has(id)) {
          candidates.add(id);
        }
      });
    }

    return candidates;
  }

  private updateAccess(id: string): void {
    const entry = this.memory.get(id);
    if (!entry) return;

    // Update access metadata
    entry.metadata.accessCount++;
    entry.metadata.lastAccessed = Date.now();

    // Update recently accessed list (LRU)
    const existingIndex = this.recentlyAccessed.indexOf(id);
    if (existingIndex > -1) {
      this.recentlyAccessed.splice(existingIndex, 1);
    }
    this.recentlyAccessed.push(id);

    // Maintain recent list size
    if (this.recentlyAccessed.length > this.maxRecentSize) {
      this.recentlyAccessed = this.recentlyAccessed.slice(-this.maxRecentSize);
    }
  }

  private enforceMemoryLimits(): void {
    if (this.memory.size <= this.maxMemorySize) return;

    // Sort entries by access patterns and age for eviction
    const entries = Array.from(this.memory.entries());
    const now = Date.now();
    
    entries.sort(([, a], [, b]) => {
      // Score based on access count, recency, and age
      const scoreA = a.metadata.accessCount * 0.4 + 
                    Math.max(0, 1 - (now - a.metadata.lastAccessed) / (24 * 60 * 60 * 1000)) * 0.6;
      const scoreB = b.metadata.accessCount * 0.4 + 
                    Math.max(0, 1 - (now - b.metadata.lastAccessed) / (24 * 60 * 60 * 1000)) * 0.6;
      return scoreA - scoreB; // Lower score = more likely to be evicted
    });

    // Remove least valuable entries
    const toRemove = entries.slice(0, this.memory.size - this.maxMemorySize + 100); // Remove extra for buffer
    toRemove.forEach(([id]) => this.remove(id));

    this.emit('evicted', { count: toRemove.length, remainingSize: this.memory.size });
  }

  private startPeriodicCleanup(): void {
    // Clean up old entries every 5 minutes
    setInterval(() => {
      const now = Date.now();
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      const toRemove: string[] = [];

      for (const [id, entry] of this.memory.entries()) {
        if (now - entry.metadata.timestamp > maxAge && entry.metadata.accessCount < 2) {
          toRemove.push(id);
        }
      }

      toRemove.forEach(id => this.remove(id));
      
      if (toRemove.length > 0) {
        this.emit('periodicCleanup', { removedCount: toRemove.length });
      }
    }, 5 * 60 * 1000);
  }
}