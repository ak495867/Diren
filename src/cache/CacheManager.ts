import sqlite3 from 'sqlite3';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { SemanticScorer, SemanticVector, SemanticScore } from '../intelligence/SemanticScorer';
import { FastMemoryStore, SearchResult } from '../intelligence/FastMemoryStore';

export interface CacheEntry {
  id: string;
  provider: string;
  requestHash: string;
  contextHash: string;
  semanticHash: string;
  request: string;
  response: string;
  compressedResponse?: string;
  tokens: number;
  cost: number;
  createdAt: Date;
  lastUsed: Date;
  useCount: number;
  compressionRatio?: number;
  semanticVector?: SemanticVector;
  qualityScore?: number;
}

export interface SmartCacheResult {
  entry: CacheEntry;
  source: 'exact' | 'semantic' | 'contextual' | 'memory';
  similarity: number;
  confidence: number;
  retrievalTimeMs: number;
}

export class CacheManager {
  private db: sqlite3.Database | null = null;
  private dbPath: string;
  private compressionEnabled: boolean = true;
  private semanticSimilarityThreshold: number = 0.7;
  private semanticScorer: SemanticScorer;
  private fastMemory: FastMemoryStore;

  constructor() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const direnDir = path.join(homeDir, '.diren');

    if (!fs.existsSync(direnDir)) {
      fs.mkdirSync(direnDir, { recursive: true });
    }

    this.dbPath = path.join(direnDir, 'cache.db');
    this.semanticScorer = SemanticScorer.getInstance();
    this.fastMemory = FastMemoryStore.getInstance();
  }

  public async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }

        this.createTables().then(resolve).catch(reject);
      });
    });
  }

  private async createTables(): Promise<void> {
    return new Promise((resolve, reject) => {
      // First create the table (if it doesn't exist)
      const createTableSql = `
        CREATE TABLE IF NOT EXISTS cache_entries (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          request_hash TEXT NOT NULL,
          context_hash TEXT NOT NULL,
          semantic_hash TEXT NOT NULL,
          request TEXT NOT NULL,
          response TEXT,
          compressed_response BLOB,
          tokens INTEGER DEFAULT 0,
          cost REAL DEFAULT 0,
          compression_ratio REAL DEFAULT 0,
          quality_score REAL DEFAULT 0,
          semantic_vector BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_used DATETIME DEFAULT CURRENT_TIMESTAMP,
          use_count INTEGER DEFAULT 1
        );
      `;

      this.db!.exec(createTableSql, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Check if semantic_vector column exists by trying to query it
        const checkColumnSql = `SELECT semantic_vector FROM cache_entries LIMIT 1`;

        this.db!.get(checkColumnSql, [], (err, row) => {
          if (err && err.message && err.message.includes('no such column: semantic_vector')) {
            // Column doesn't exist - add it with ALTER TABLE
            const alterSql = `ALTER TABLE cache_entries ADD COLUMN semantic_vector BLOB`;

            this.db!.exec(alterSql, (err2) => {
              if (err2) {
                reject(err2);
                return;
              }

              // Now create the indexes
              this.createIndexes().then(resolve).catch(reject);
            });
          } else {
            // Column exists or table is empty, just create indexes
            this.createIndexes().then(resolve).catch(reject);
          }
        });
      });
    });
  }

  private createIndexes(): Promise<void> {
    return new Promise((resolve, reject) => {
      const indexesSql = `
        CREATE INDEX IF NOT EXISTS idx_request_hash ON cache_entries(request_hash);
        CREATE INDEX IF NOT EXISTS idx_context_hash ON cache_entries(context_hash);
        CREATE INDEX IF NOT EXISTS idx_semantic_hash ON cache_entries(semantic_hash);
        CREATE INDEX IF NOT EXISTS idx_provider ON cache_entries(provider);
        CREATE INDEX IF NOT EXISTS idx_last_used ON cache_entries(last_used);
        CREATE INDEX IF NOT EXISTS idx_quality_score ON cache_entries(quality_score DESC);
        CREATE INDEX IF NOT EXISTS idx_quality_use_count ON cache_entries(quality_score DESC, use_count DESC);
      `;

      this.db!.exec(indexesSql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public generateContextHash(request: any): string {
    const contextData = {
      messages: this.normalizeMessages(request.messages || []),
      model: request.model,
      temperature: request.temperature || 0.7,
      max_tokens: request.max_tokens,
      system: request.system || ''
    };

    return crypto.createHash('sha256').update(JSON.stringify(contextData)).digest('hex');
  }

  public generateSemanticHash(request: any): string {
    const messages = request.messages || [];
    const lastMessage = messages[messages.length - 1];
    const semanticContent = {
      intent: this.extractIntent(lastMessage?.content || ''),
      context: messages.slice(-3),
      model_type: this.getModelType(request.model)
    };

    return crypto.createHash('sha256').update(JSON.stringify(semanticContent)).digest('hex');
  }

  private normalizeMessages(messages: any[]): any[] {
    return messages.map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string'
        ? msg.content.trim().toLowerCase()
        : msg.content
    }));
  }

  private extractIntent(content: string): string {
    const lowercaseContent = content.toLowerCase();

    const intents = [
      { pattern: /explain|describe|what is/g, intent: 'explain' },
      { pattern: /how to|tutorial|guide/g, intent: 'howto' },
      { pattern: /fix|debug|error|problem/g, intent: 'debug' },
      { pattern: /write|create|generate/g, intent: 'generate' },
      { pattern: /review|analyze|check/g, intent: 'analyze' },
      { pattern: /translate|convert/g, intent: 'transform' }
    ];

    for (const { pattern, intent } of intents) {
      if (pattern.test(lowercaseContent)) {
        return intent;
      }
    }

    return 'general';
  }

  private getModelType(model: string): string {
    if (!model) return 'unknown';

    const modelTypes: { [key: string]: string } = {
      'gpt-4': 'large',
      'gpt-3.5': 'medium',
      'claude-3-opus': 'large',
      'claude-3-sonnet': 'medium',
      'claude-3-haiku': 'small',
      'gemini-pro': 'large',
      'llama': 'open'
    };

    for (const [key, type] of Object.entries(modelTypes)) {
      if (model.includes(key)) return type;
    }

    return 'unknown';
  }

  public generateRequestHash(request: any): string {
    return crypto.createHash('sha256').update(JSON.stringify(request)).digest('hex');
  }

  private compressData(data: string): { compressed: Buffer, ratio: number } {
    const original = Buffer.from(data, 'utf8');
    const compressed = zlib.gzipSync(original, { level: 9 });
    const ratio = compressed.length / original.length;

    return { compressed, ratio };
  }

  private decompressData(compressedData: Buffer): string {
    return zlib.gunzipSync(compressedData).toString('utf8');
  }

  public async findCachedResponse(
    requestHash: string,
    contextHash: string,
    semanticHash: string,
    requestText?: string
  ): Promise<SmartCacheResult | null> {
    const startTime = Date.now();

    // Level 1: Exact match (fastest)
    const exactMatch = await this.findExactMatch(requestHash);
    if (exactMatch) {
      return {
        entry: exactMatch,
        source: 'exact',
        similarity: 1.0,
        confidence: 0.99,
        retrievalTimeMs: Date.now() - startTime
      };
    }

    // Level 2: Fast memory search (very fast, semantic)
    if (requestText) {
      const memoryResults = this.fastMemory.fastSearch(requestText, {
        limit: 3,
        minSimilarity: this.semanticSimilarityThreshold
      });

      if (memoryResults.length > 0) {
        const bestResult = memoryResults[0];
        const cacheEntry = await this.convertMemoryToCache(bestResult);

        if (cacheEntry) {
          return {
            entry: cacheEntry,
            source: 'memory',
            similarity: bestResult.score.similarity,
            confidence: bestResult.score.confidence,
            retrievalTimeMs: Date.now() - startTime
          };
        }
      }
    }

    // Level 3: Context match (fast)
    const contextMatch = await this.findContextMatch(contextHash);
    if (contextMatch) {
      return {
        entry: contextMatch,
        source: 'contextual',
        similarity: 0.85,
        confidence: 0.8,
        retrievalTimeMs: Date.now() - startTime
      };
    }

    // Level 4: Semantic database search (slower, but thorough)
    if (requestText) {
      const semanticMatch = await this.findSemanticMatch(requestText, semanticHash);
      if (semanticMatch) {
        return {
          entry: semanticMatch.entry,
          source: 'semantic',
          similarity: semanticMatch.similarity,
          confidence: semanticMatch.confidence,
          retrievalTimeMs: Date.now() - startTime
        };
      }
    }

    return null;
  }

  public async saveResponse(
    provider: string,
    requestHash: string,
    contextHash: string,
    semanticHash: string,
    request: any,
    response: any,
    tokens: number = 0,
    cost: number = 0,
    requestText?: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const responseStr = JSON.stringify(response);

      let compressedResponse: Buffer | null = null;
      let compressionRatio = 0;
      let finalResponse: string | null = null;

      if (this.compressionEnabled && responseStr.length > 1000) {
        const { compressed, ratio } = this.compressData(responseStr);
        compressedResponse = compressed;
        compressionRatio = ratio;

        if (ratio < 0.7) {
          finalResponse = null;
        } else {
          finalResponse = responseStr;
          compressedResponse = null;
        }
      } else {
        finalResponse = responseStr;
      }

      const qualityScore = this.calculateResponseQuality(response, tokens, cost);
      let semanticVector: SemanticVector | undefined = undefined;

      // Extract semantic vector for potential semantic matching
      let semanticText = requestText;
      if (!semanticText) {
        semanticText = this.extractTextFromRequest(request);
      }
      if (semanticText) {
        semanticVector = this.semanticScorer.extractSemanticVector(semanticText);
      }

      // Convert semantic vector to JSON for storage
      const semanticVectorJson = semanticVector ? JSON.stringify(semanticVector) : null;

      const sql = `
        INSERT INTO cache_entries
        (id, provider, request_hash, context_hash, semantic_hash, request, response, compressed_response, tokens, cost, compression_ratio, quality_score, semantic_vector)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      this.db!.run(sql, [
        id,
        provider,
        requestHash,
        contextHash,
        semanticHash,
        JSON.stringify(request),
        finalResponse,
        compressedResponse,
        tokens,
        cost,
        compressionRatio,
        qualityScore,
        semanticVectorJson
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public async updateUsage(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE cache_entries
        SET last_used = CURRENT_TIMESTAMP, use_count = use_count + 1
        WHERE id = ?
      `;

      this.db!.run(sql, [id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public async getStats(): Promise<any> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT
          COUNT(*) as total_entries,
          SUM(use_count) as total_uses,
          SUM(tokens) as total_tokens,
          SUM(cost) as total_cost,
          AVG(use_count) as avg_use_count,
          AVG(compression_ratio) as avg_compression_ratio,
          SUM(CASE WHEN compressed_response IS NOT NULL THEN 1 ELSE 0 END) as compressed_entries
        FROM cache_entries
      `;

      this.db!.get(sql, [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  public async cleanupOldEntries(maxAge: number = 30): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        DELETE FROM cache_entries
        WHERE created_at < datetime('now', '-' || ? || ' days')
          AND use_count < 2
      `;

      this.db!.run(sql, [maxAge], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  private async findExactMatch(requestHash: string): Promise<CacheEntry | null> {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM cache_entries WHERE request_hash = ? LIMIT 1`;

      this.db!.get(sql, [requestHash], (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(row ? this.rowToCacheEntry(row) : null);
      });
    });
  }

  private async findContextMatch(contextHash: string): Promise<CacheEntry | null> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM cache_entries
        WHERE context_hash = ?
        ORDER BY quality_score DESC, use_count DESC
        LIMIT 1
      `;

      this.db!.get(sql, [contextHash], (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(row ? this.rowToCacheEntry(row) : null);
      });
    });
  }

  private async findSemanticMatch(
    requestText: string,
    semanticHash: string
  ): Promise<{ entry: CacheEntry; similarity: number; confidence: number } | null> {
    const queryVector = this.semanticScorer.extractSemanticVector(requestText);

    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM cache_entries
        WHERE semantic_hash = ?
        ORDER BY quality_score DESC, use_count DESC
        LIMIT 5
      `;

      this.db!.all(sql, [semanticHash], async (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        let bestMatch: { entry: CacheEntry; similarity: number; confidence: number } | null = null;

        for (const row of rows) {
          const entry = this.rowToCacheEntry(row);
          if (!entry.semanticVector) continue; // This will always be true since semantic_vector column doesn't exist

          const score = this.semanticScorer.calculateSimilarity(queryVector, entry.semanticVector);

          if (score.similarity >= this.semanticSimilarityThreshold &&
              (!bestMatch || score.similarity > bestMatch.similarity)) {
            bestMatch = {
              entry,
              similarity: score.similarity,
              confidence: score.confidence
            };
          }
        }

        resolve(bestMatch);
      });
    });
  }

  private async convertMemoryToCache(memoryResult: SearchResult): Promise<CacheEntry | null> {
    const memoryEntry = memoryResult.entry;

    return {
      id: memoryEntry.id,
      provider: memoryEntry.metadata.provider,
      requestHash: '',
      contextHash: '',
      semanticHash: '',
      request: JSON.stringify(memoryEntry.data.request || {}),
      response: JSON.stringify(memoryEntry.data.response || {}),
      tokens: memoryEntry.metadata.tokens,
      cost: memoryEntry.metadata.cost,
      createdAt: new Date(memoryEntry.metadata.timestamp),
      lastUsed: new Date(memoryEntry.metadata.lastAccessed),
      useCount: memoryEntry.metadata.accessCount,
      semanticVector: memoryEntry.vector
    };
  }

  private extractTextFromRequest(request: any): string {
    if (request.messages && Array.isArray(request.messages)) {
      return request.messages
        .map((msg: any) => msg.content || '')
        .join(' ');
    }

    return request.prompt || request.input || JSON.stringify(request);
  }

  private calculateResponseQuality(response: any, tokens: number, cost: number): number {
    let quality = 0.5;

    if (tokens > 100) quality += 0.1;
    if (tokens > 500) quality += 0.1;

    const responseText = JSON.stringify(response);
    if (responseText.includes('```')) quality += 0.1;
    if (responseText.includes('\n')) quality += 0.05;

    if (cost > 0.01) quality += 0.1;

    return Math.min(1.0, quality);
  }

  private rowToCacheEntry(row: any): CacheEntry {
    let response = row.response;
    if (row.compressed_response && !response) {
      response = this.decompressData(row.compressed_response);
    }

    let semanticVector: SemanticVector | undefined;
    try {
      semanticVector = row.semantic_vector ? JSON.parse(row.semantic_vector) : undefined;
    } catch {
      // Ignore parsing errors
    }

    return {
      id: row.id,
      provider: row.provider,
      requestHash: row.request_hash,
      contextHash: row.context_hash,
      semanticHash: row.semantic_hash,
      request: row.request,
      response: response,
      tokens: row.tokens,
      cost: row.cost,
      createdAt: new Date(row.created_at),
      lastUsed: new Date(row.last_used),
      useCount: row.use_count,
      compressionRatio: row.compression_ratio,
      semanticVector,
      qualityScore: row.quality_score
    };
  }
}