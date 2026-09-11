import crypto from 'crypto';

export interface SemanticScore {
  similarity: number;
  confidence: number;
  matchType: 'exact' | 'semantic' | 'contextual' | 'intent';
  features: string[];
}

export interface SemanticVector {
  tokens: string[];
  embeddings: number[];
  intent: string;
  entities: string[];
  keywords: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  complexity: number;
}

export class SemanticScorer {
  private static instance: SemanticScorer;
  private vocabMap: Map<string, number> = new Map();
  private idfScores: Map<string, number> = new Map();
  private documentFrequency: Map<string, number> = new Map();
  private totalDocuments: number = 0;

  private constructor() {
    this.initializeVocabulary();
  }

  public static getInstance(): SemanticScorer {
    if (!SemanticScorer.instance) {
      SemanticScorer.instance = new SemanticScorer();
    }
    return SemanticScorer.instance;
  }

  private initializeVocabulary(): void {
    // Initialize with common programming and AI-related terms
    const commonTerms = [
      'function', 'class', 'method', 'variable', 'array', 'object', 'string', 'number',
      'boolean', 'promise', 'async', 'await', 'return', 'import', 'export', 'const',
      'let', 'var', 'if', 'else', 'for', 'while', 'loop', 'iterate', 'map', 'filter',
      'reduce', 'foreach', 'api', 'request', 'response', 'http', 'json', 'xml',
      'database', 'sql', 'query', 'select', 'insert', 'update', 'delete', 'join',
      'algorithm', 'data', 'structure', 'performance', 'optimization', 'cache',
      'error', 'exception', 'debug', 'test', 'unit', 'integration', 'deploy',
      'code', 'program', 'software', 'development', 'framework', 'library',
      'typescript', 'javascript', 'python', 'java', 'cpp', 'rust', 'go', 'react',
      'vue', 'angular', 'node', 'express', 'fastapi', 'django', 'flask', 'spring'
    ];

    commonTerms.forEach((term, index) => {
      this.vocabMap.set(term, index);
      this.idfScores.set(term, Math.log(1000 / (index + 1))); // Simulated IDF scores
    });
  }

  public extractSemanticVector(text: string): SemanticVector {
    const normalizedText = text.toLowerCase().trim();
    const tokens = this.tokenize(normalizedText);
    
    return {
      tokens,
      embeddings: this.generateSimpleEmbedding(tokens),
      intent: this.extractIntent(normalizedText),
      entities: this.extractEntities(normalizedText),
      keywords: this.extractKeywords(tokens),
      sentiment: this.analyzeSentiment(normalizedText),
      complexity: this.calculateComplexity(normalizedText)
    };
  }

  public calculateSimilarity(vector1: SemanticVector, vector2: SemanticVector): SemanticScore {
    // Multi-layered similarity calculation
    const embeddingSimilarity = this.cosineSimilarity(vector1.embeddings, vector2.embeddings);
    const tokenSimilarity = this.jaccardSimilarity(vector1.tokens, vector2.tokens);
    const intentMatch = vector1.intent === vector2.intent ? 1.0 : 0.0;
    const entityOverlap = this.calculateOverlap(vector1.entities, vector2.entities);
    const keywordOverlap = this.calculateOverlap(vector1.keywords, vector2.keywords);
    
    // Weighted combination
    const weights = {
      embedding: 0.3,
      token: 0.2,
      intent: 0.25,
      entity: 0.15,
      keyword: 0.1
    };
    
    const overallSimilarity = 
      embeddingSimilarity * weights.embedding +
      tokenSimilarity * weights.token +
      intentMatch * weights.intent +
      entityOverlap * weights.entity +
      keywordOverlap * weights.keyword;
    
    // Determine match type and confidence
    let matchType: SemanticScore['matchType'];
    let confidence: number;
    
    if (overallSimilarity >= 0.95) {
      matchType = 'exact';
      confidence = 0.99;
    } else if (overallSimilarity >= 0.8) {
      matchType = 'semantic';
      confidence = 0.85;
    } else if (overallSimilarity >= 0.6) {
      matchType = 'contextual';
      confidence = 0.7;
    } else {
      matchType = 'intent';
      confidence = overallSimilarity;
    }

    const features = this.identifyMatchingFeatures(vector1, vector2);

    return {
      similarity: overallSimilarity,
      confidence,
      matchType,
      features
    };
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2);
  }

  private generateSimpleEmbedding(tokens: string[]): number[] {
    // Simple TF-IDF based embedding (in production, use proper embeddings like sentence-transformers)
    const embedding = new Array(100).fill(0);
    
    tokens.forEach(token => {
      if (this.vocabMap.has(token)) {
        const index = this.vocabMap.get(token)! % 100;
        const tfidf = this.calculateTFIDF(token, tokens);
        embedding[index] += tfidf;
      } else {
        // Hash unknown tokens to embedding space
        const hash = this.hashToIndex(token, 100);
        embedding[hash] += 0.1;
      }
    });
    
    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? embedding.map(val => val / magnitude) : embedding;
  }

  private calculateTFIDF(term: string, tokens: string[]): number {
    const tf = tokens.filter(t => t === term).length / tokens.length;
    const idf = this.idfScores.get(term) || Math.log(1000);
    return tf * idf;
  }

  private hashToIndex(str: string, size: number): number {
    const hash = crypto.createHash('md5').update(str).digest('hex');
    return parseInt(hash.substring(0, 8), 16) % size;
  }

  private extractIntent(text: string): string {
    const intentPatterns = [
      { pattern: /(?:explain|describe|what is|tell me about)/i, intent: 'explain' },
      { pattern: /(?:how to|how do|tutorial|guide|steps)/i, intent: 'howto' },
      { pattern: /(?:fix|debug|error|problem|issue|broken)/i, intent: 'debug' },
      { pattern: /(?:write|create|generate|make|build)/i, intent: 'generate' },
      { pattern: /(?:review|analyze|check|evaluate|assess)/i, intent: 'analyze' },
      { pattern: /(?:translate|convert|transform|change)/i, intent: 'transform' },
      { pattern: /(?:optimize|improve|enhance|better)/i, intent: 'optimize' },
      { pattern: /(?:compare|difference|versus|vs)/i, intent: 'compare' },
      { pattern: /(?:list|show|display|enumerate)/i, intent: 'list' },
      { pattern: /(?:test|verify|validate|confirm)/i, intent: 'test' }
    ];

    for (const { pattern, intent } of intentPatterns) {
      if (pattern.test(text)) {
        return intent;
      }
    }

    return 'general';
  }

  private extractEntities(text: string): string[] {
    const entities: string[] = [];
    
    // Programming languages
    const languages = ['javascript', 'typescript', 'python', 'java', 'cpp', 'c++', 'rust', 'go', 'php', 'ruby'];
    languages.forEach(lang => {
      if (text.includes(lang)) entities.push(`lang:${lang}`);
    });
    
    // Frameworks
    const frameworks = ['react', 'vue', 'angular', 'express', 'fastapi', 'django', 'spring', 'laravel'];
    frameworks.forEach(fw => {
      if (text.includes(fw)) entities.push(`framework:${fw}`);
    });
    
    // File extensions
    const fileExtensions = text.match(/\.\w{2,4}\b/g) || [];
    fileExtensions.forEach(ext => entities.push(`file:${ext}`));
    
    // URLs
    const urls = text.match(/https?:\/\/[^\s]+/g) || [];
    urls.forEach(url => entities.push(`url:${url}`));
    
    return [...new Set(entities)];
  }

  private extractKeywords(tokens: string[]): string[] {
    // Extract important keywords based on frequency and IDF scores
    const tokenCounts = new Map<string, number>();
    tokens.forEach(token => {
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
    });

    return Array.from(tokenCounts.entries())
      .filter(([token]) => this.vocabMap.has(token) || token.length > 4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([token]) => token);
  }

  private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'perfect', 'love', 'best', 'awesome'];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'worst', 'broken', 'error', 'problem'];
    
    const words = text.toLowerCase().split(/\s+/);
    let score = 0;
    
    words.forEach(word => {
      if (positiveWords.includes(word)) score++;
      if (negativeWords.includes(word)) score--;
    });
    
    if (score > 0) return 'positive';
    if (score < 0) return 'negative';
    return 'neutral';
  }

  private calculateComplexity(text: string): number {
    const factors = {
      length: Math.log(text.length + 1) / 10,
      words: text.split(/\s+/).length / 100,
      sentences: (text.match(/[.!?]+/g) || []).length / 10,
      codeBlocks: (text.match(/```[\s\S]*?```/g) || []).length * 0.5,
      specialChars: (text.match(/[{}[\]()]/g) || []).length / text.length
    };
    
    return Math.min(1.0, Object.values(factors).reduce((sum, val) => sum + val, 0));
  }

  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0;
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  private jaccardSimilarity(set1: string[], set2: string[]): number {
    const s1 = new Set(set1);
    const s2 = new Set(set2);
    const intersection = new Set([...s1].filter(x => s2.has(x)));
    const union = new Set([...s1, ...s2]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  private calculateOverlap(arr1: string[], arr2: string[]): number {
    const set1 = new Set(arr1);
    const set2 = new Set(arr2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const maxSize = Math.max(set1.size, set2.size);
    
    return maxSize === 0 ? 0 : intersection.size / maxSize;
  }

  private identifyMatchingFeatures(vector1: SemanticVector, vector2: SemanticVector): string[] {
    const features: string[] = [];
    
    if (vector1.intent === vector2.intent) {
      features.push(`intent:${vector1.intent}`);
    }
    
    const commonTokens = vector1.tokens.filter(token => vector2.tokens.includes(token));
    if (commonTokens.length > 0) {
      features.push(`tokens:${commonTokens.slice(0, 3).join(',')}`);
    }
    
    const commonEntities = vector1.entities.filter(entity => vector2.entities.includes(entity));
    if (commonEntities.length > 0) {
      features.push(`entities:${commonEntities.slice(0, 2).join(',')}`);
    }
    
    if (vector1.sentiment === vector2.sentiment) {
      features.push(`sentiment:${vector1.sentiment}`);
    }
    
    return features;
  }

  // Update vocabulary with new terms (for learning)
  public updateVocabulary(text: string): void {
    const tokens = this.tokenize(text);
    this.totalDocuments++;
    
    tokens.forEach(token => {
      if (!this.vocabMap.has(token)) {
        const newIndex = this.vocabMap.size;
        this.vocabMap.set(token, newIndex);
        this.documentFrequency.set(token, 1);
        this.idfScores.set(token, Math.log(this.totalDocuments / 1));
      } else {
        const freq = this.documentFrequency.get(token) || 0;
        this.documentFrequency.set(token, freq + 1);
        this.idfScores.set(token, Math.log(this.totalDocuments / (freq + 1)));
      }
    });
  }
}