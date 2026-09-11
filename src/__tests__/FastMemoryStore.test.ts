import { FastMemoryStore, MemoryEntry } from '../intelligence/FastMemoryStore';
import { SemanticScorer } from '../intelligence/SemanticScorer';
import { delay } from './setup';

describe('FastMemoryStore', () => {
  let memoryStore: FastMemoryStore;
  let semanticScorer: SemanticScorer;

  beforeEach(() => {
    memoryStore = FastMemoryStore.getInstance();
    semanticScorer = SemanticScorer.getInstance();
    memoryStore.clear(); // Start with clean memory for each test
  });

  afterEach(() => {
    memoryStore.clear();
  });

  describe('store and retrieve', () => {
    it('should store and retrieve entries', () => {
      const id = 'test-entry-1';
      const text = 'Write a Python function to sort arrays';
      const data = { request: { content: text }, response: { result: 'sorted' } };
      const metadata = {
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        tags: ['python', 'sorting'],
        cost: 0.001,
        tokens: 25
      };

      memoryStore.store(id, text, data, metadata);

      const retrieved = memoryStore.getById(id);
      expect(retrieved).toBeTruthy();
      expect(retrieved!.id).toBe(id);
      expect(retrieved!.data).toEqual(data);
      expect(retrieved!.metadata.provider).toBe('openai');
      expect(retrieved!.metadata.cost).toBe(0.001);
    });

    it('should update access patterns on retrieval', () => {
      const id = 'test-entry-access';
      memoryStore.store(id, 'Test content', { test: true }, {
        provider: 'test',
        model: 'test-model',
        tags: [],
        cost: 0,
        tokens: 10
      });

      const initial = memoryStore.getById(id)!;
      const initialAccessCount = initial.metadata.accessCount;

      memoryStore.getById(id);
      
      const updated = memoryStore.getById(id)!;
      expect(updated.metadata.accessCount).toBe(initialAccessCount + 1);
      expect(updated.metadata.lastAccessed).toBeGreaterThan(initial.metadata.lastAccessed);
    });

    it('should return null for non-existent entries', () => {
      const result = memoryStore.getById('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('semantic search', () => {
    beforeEach(async () => {
      // Populate memory with test data
      const testEntries = [
        {
          id: 'python-sort-1',
          text: 'Write a Python function to sort arrays',
          data: { type: 'code', language: 'python' },
          metadata: {
            provider: 'openai',
            model: 'gpt-3.5-turbo',
            tags: ['python', 'sorting', 'arrays'],
            cost: 0.001,
            tokens: 25
          }
        },
        {
          id: 'python-sort-2',
          text: 'Create a sorting algorithm in Python',
          data: { type: 'code', language: 'python' },
          metadata: {
            provider: 'anthropic',
            model: 'claude-3-haiku',
            tags: ['python', 'algorithm', 'sorting'],
            cost: 0.0005,
            tokens: 30
          }
        },
        {
          id: 'js-function',
          text: 'JavaScript function for data processing',
          data: { type: 'code', language: 'javascript' },
          metadata: {
            provider: 'openai',
            model: 'gpt-3.5-turbo',
            tags: ['javascript', 'data', 'processing'],
            cost: 0.0012,
            tokens: 20
          }
        },
        {
          id: 'ml-explanation',
          text: 'Explain machine learning algorithms',
          data: { type: 'explanation', domain: 'ml' },
          metadata: {
            provider: 'anthropic',
            model: 'claude-3-sonnet',
            tags: ['machine-learning', 'explanation', 'algorithms'],
            cost: 0.003,
            tokens: 50
          }
        }
      ];

      testEntries.forEach(entry => {
        memoryStore.store(entry.id, entry.text, entry.data, entry.metadata);
      });

      // Allow time for indexing
      await delay(100);
    });

    it('should find exact matches', () => {
      const results = memoryStore.fastSearch('Write a Python function to sort arrays', {
        limit: 5,
        minSimilarity: 0.9
      });

      expect(results).toHaveLength(1);
      expect(results[0].entry.id).toBe('python-sort-1');
      expect(results[0].score.similarity).toBeCloseTo(1.0, 1);
      expect(results[0].score.matchType).toBe('exact');
    });

    it('should find semantic matches', () => {
      const results = memoryStore.fastSearch('Python sorting function implementation', {
        limit: 5,
        minSimilarity: 0.6
      });

      expect(results.length).toBeGreaterThan(0);
      
      const pythonResults = results.filter(r => r.entry.id.includes('python-sort'));
      expect(pythonResults.length).toBeGreaterThan(0);
      
      pythonResults.forEach(result => {
        expect(result.score.similarity).toBeGreaterThan(0.6);
        expect(result.score.matchType).toBeOneOf(['exact', 'semantic', 'contextual']);
      });
    });

    it('should filter by provider', () => {
      const results = memoryStore.fastSearch('Python function', {
        provider: 'anthropic',
        limit: 10,
        minSimilarity: 0.3
      });

      results.forEach(result => {
        expect(result.entry.metadata.provider).toBe('anthropic');
      });
    });

    it('should filter by intent', () => {
      const results = memoryStore.fastSearch('machine learning', {
        intent: 'explain',
        limit: 10,
        minSimilarity: 0.3
      });

      results.forEach(result => {
        expect(result.entry.vector.intent).toBe('explain');
      });
    });

    it('should respect similarity threshold', () => {
      const highThreshold = memoryStore.fastSearch('completely unrelated quantum physics', {
        minSimilarity: 0.8
      });

      const lowThreshold = memoryStore.fastSearch('completely unrelated quantum physics', {
        minSimilarity: 0.1
      });

      expect(highThreshold.length).toBeLessThanOrEqual(lowThreshold.length);
    });

    it('should limit results correctly', () => {
      const results = memoryStore.fastSearch('function', {
        limit: 2,
        minSimilarity: 0.1
      });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should sort results by similarity and confidence', () => {
      const results = memoryStore.fastSearch('Python sorting', {
        limit: 5,
        minSimilarity: 0.3
      });

      for (let i = 1; i < results.length; i++) {
        const prevScore = results[i-1].score.similarity * results[i-1].score.confidence;
        const currentScore = results[i].score.similarity * results[i].score.confidence;
        expect(prevScore).toBeGreaterThanOrEqual(currentScore);
      }
    });

    it('should handle age filtering', () => {
      const results = memoryStore.fastSearch('Python function', {
        maxAge: 1, // 1ms - should filter out everything
        limit: 10
      });

      expect(results.length).toBe(0);
    });
  });

  describe('performance', () => {
    beforeEach(() => {
      // Populate with many entries for performance testing
      for (let i = 0; i < 1000; i++) {
        memoryStore.store(
          `perf-test-${i}`,
          `Test entry ${i} with various content about programming and algorithms`,
          { index: i },
          {
            provider: i % 2 === 0 ? 'openai' : 'anthropic',
            model: 'test-model',
            tags: ['performance', 'test', i % 3 === 0 ? 'python' : 'javascript'],
            cost: Math.random() * 0.01,
            tokens: Math.floor(Math.random() * 100) + 10
          }
        );
      }
    });

    it('should search quickly with many entries', async () => {
      const start = Date.now();
      
      for (let i = 0; i < 10; i++) {
        memoryStore.fastSearch('programming algorithms', {
          limit: 5,
          minSimilarity: 0.5
        });
      }
      
      const end = Date.now();
      const avgTime = (end - start) / 10;
      
      expect(avgTime).toBeLessThan(50); // Less than 50ms per search
    });

    it('should retrieve by ID quickly', () => {
      const start = Date.now();
      
      for (let i = 0; i < 100; i++) {
        memoryStore.getById(`perf-test-${i * 10}`);
      }
      
      const end = Date.now();
      const avgTime = (end - start) / 100;
      
      expect(avgTime).toBeLessThan(1); // Less than 1ms per ID lookup
    });
  });

  describe('memory management', () => {
    it('should enforce memory limits', () => {
      const originalLimit = memoryStore['maxMemorySize'];
      memoryStore['maxMemorySize'] = 10; // Set low limit for testing

      // Add entries beyond the limit
      for (let i = 0; i < 20; i++) {
        memoryStore.store(
          `limit-test-${i}`,
          `Content ${i}`,
          { index: i },
          {
            provider: 'test',
            model: 'test',
            tags: [],
            cost: 0.001,
            tokens: 10
          }
        );
      }

      const stats = memoryStore.getStats();
      expect(stats.totalEntries).toBeLessThanOrEqual(15); // Should evict old entries

      // Restore original limit
      memoryStore['maxMemorySize'] = originalLimit;
    });

    it('should evict least valuable entries first', async () => {
      memoryStore['maxMemorySize'] = 5;

      // Add high-value entry (accessed multiple times)
      memoryStore.store('high-value', 'Important content', {}, {
        provider: 'test', model: 'test', tags: [], cost: 0.01, tokens: 100
      });
      
      // Access it multiple times
      for (let i = 0; i < 5; i++) {
        memoryStore.getById('high-value');
        await delay(10);
      }

      // Add low-value entries that should trigger eviction
      for (let i = 0; i < 10; i++) {
        memoryStore.store(`low-value-${i}`, `Content ${i}`, {}, {
          provider: 'test', model: 'test', tags: [], cost: 0.0001, tokens: 5
        });
      }

      // High-value entry should still exist
      expect(memoryStore.getById('high-value')).toBeTruthy();
    });

    it('should handle memory export and import', () => {
      // Add test data
      memoryStore.store('export-test', 'Export content', { test: true }, {
        provider: 'test', model: 'test', tags: ['export'], cost: 0.001, tokens: 10
      });

      // Export memory
      const exported = memoryStore.exportMemory();
      expect(exported.entries).toBeDefined();
      expect(exported.timestamp).toBeDefined();

      // Clear and import
      memoryStore.clear();
      expect(memoryStore.getById('export-test')).toBeNull();
      
      memoryStore.importMemory(exported);
      expect(memoryStore.getById('export-test')).toBeTruthy();
    });
  });

  describe('statistics and monitoring', () => {
    beforeEach(() => {
      // Add test data for statistics
      for (let i = 0; i < 50; i++) {
        memoryStore.store(`stats-test-${i}`, `Content ${i}`, {}, {
          provider: i % 3 === 0 ? 'openai' : i % 3 === 1 ? 'anthropic' : 'groq',
          model: 'test-model',
          tags: ['stats', 'test'],
          cost: Math.random() * 0.01,
          tokens: Math.floor(Math.random() * 50) + 10
        });

        // Access some entries to create usage patterns
        if (i % 5 === 0) {
          memoryStore.getById(`stats-test-${i}`);
        }
      }
    });

    it('should provide accurate statistics', () => {
      const stats = memoryStore.getStats();

      expect(stats.totalEntries).toBe(50);
      expect(stats.indexedKeywords).toBeGreaterThan(0);
      expect(stats.indexedIntents).toBeGreaterThan(0);
      expect(stats.indexedProviders).toBe(3); // openai, anthropic, groq
      expect(stats.averageAccessCount).toBeGreaterThan(0);
      expect(stats.memoryUsage.current).toBe(50);
      expect(stats.memoryUsage.utilizationPercent).toMatch(/^\d+\.\d$/);
    });

    it('should track age distribution', () => {
      const stats = memoryStore.getStats();

      expect(stats.ageDistribution.lastHour).toBe(50); // All entries are recent
      expect(stats.ageDistribution.lastDay).toBe(50);
      expect(stats.ageDistribution.lastWeek).toBe(50);
      expect(stats.ageDistribution.older).toBe(0);
    });

    it('should provide memory utilization metrics', () => {
      const stats = memoryStore.getStats();
      
      expect(stats.memoryUsage).toBeDefined();
      expect(stats.memoryUsage.current).toBeGreaterThan(0);
      expect(stats.memoryUsage.limit).toBeGreaterThan(0);
      expect(parseFloat(stats.memoryUsage.utilizationPercent)).toBeGreaterThan(0);
    });
  });

  describe('event handling', () => {
    it('should emit events on store operations', (done) => {
      let eventCount = 0;
      
      memoryStore.on('stored', (event) => {
        expect(event.id).toBe('event-test');
        expect(event.vector).toBeDefined();
        expect(event.metadata).toBeDefined();
        eventCount++;
        
        if (eventCount === 1) done();
      });

      memoryStore.store('event-test', 'Event test content', {}, {
        provider: 'test', model: 'test', tags: [], cost: 0, tokens: 10
      });
    });

    it('should emit events on search operations', (done) => {
      memoryStore.on('searched', (event) => {
        expect(event.candidatesScanned).toBeGreaterThanOrEqual(0);
        expect(event.resultsFound).toBeGreaterThanOrEqual(0);
        expect(event.searchTime).toBeGreaterThan(0);
        done();
      });

      memoryStore.fastSearch('test search', { limit: 1 });
    });

    it('should emit events on eviction', async () => {
      memoryStore['maxMemorySize'] = 2;
      let evictionEmitted = false;

      memoryStore.on('evicted', (event) => {
        expect(event.count).toBeGreaterThan(0);
        expect(event.remainingSize).toBeLessThanOrEqual(2);
        evictionEmitted = true;
      });

      // Add entries to trigger eviction
      for (let i = 0; i < 5; i++) {
        memoryStore.store(`evict-test-${i}`, `Content ${i}`, {}, {
          provider: 'test', model: 'test', tags: [], cost: 0.001, tokens: 10
        });
      }

      expect(evictionEmitted).toBe(true);
    });
  });
});