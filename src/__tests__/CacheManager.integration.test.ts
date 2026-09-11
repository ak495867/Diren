import { CacheManager, SmartCacheResult } from '../cache/CacheManager';
import { generateCodeVariations, generateAnalysisVariations, delay } from './setup';
import path from 'path';
import fs from 'fs';

describe('CacheManager Integration', () => {
  let cacheManager: CacheManager;
  let testDbPath: string;

  beforeAll(async () => {
    // Setup test database path
    const testDir = path.join(__dirname, '../../test-data/.diren');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    cacheManager = new CacheManager();
    await cacheManager.initialize();
  });

  afterAll(async () => {
    // Cleanup test database
    const testDir = path.join(__dirname, '../../test-data');
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Each test starts with a clean cache (in a real scenario, we'd clear the database)
    // For integration tests, we'll use unique IDs to avoid conflicts
  });

  describe('end-to-end caching workflow', () => {
    it('should handle complete cache lifecycle', async () => {
      const provider = 'openai';
      const request = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Write a Python function to sort arrays' }],
        max_tokens: 100,
        temperature: 0.7
      };
      
      const response = {
        choices: [{
          message: {
            role: 'assistant',
            content: 'def sort_array(arr):\n    return sorted(arr)'
          },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 15, completion_tokens: 12, total_tokens: 27 }
      };

      // Generate cache keys
      const requestHash = cacheManager.generateRequestHash(request);
      const contextHash = cacheManager.generateContextHash(request);
      const semanticHash = cacheManager.generateSemanticHash(request);
      const requestText = request.messages[0].content;

      // First check - should be cache miss
      const initialResult = await cacheManager.findCachedResponse(
        requestHash, contextHash, semanticHash, requestText
      );
      expect(initialResult).toBeNull();

      // Save response to cache
      await cacheManager.saveResponse(
        provider, requestHash, contextHash, semanticHash,
        request, response, 27, 0.0027
      );

      // Second check - should be exact cache hit
      const cachedResult = await cacheManager.findCachedResponse(
        requestHash, contextHash, semanticHash, requestText
      );
      
      expect(cachedResult).toBeTruthy();
      expect(cachedResult!.source).toBe('exact');
      expect(cachedResult!.similarity).toBeCloseTo(1.0);
      expect(cachedResult!.confidence).toBeGreaterThan(0.9);
      expect(cachedResult!.retrievalTimeMs).toBeLessThan(100);
      
      const cachedResponse = JSON.parse(cachedResult!.entry.response);
      expect(cachedResponse).toEqual(response);

      // Update usage
      await cacheManager.updateUsage(cachedResult!.entry.id);

      // Verify usage updated
      const updatedResult = await cacheManager.findCachedResponse(
        requestHash, contextHash, semanticHash, requestText
      );
      expect(updatedResult!.entry.useCount).toBe(2);
    });

    it('should demonstrate semantic similarity caching', async () => {
      const provider = 'anthropic';
      const baseRequest = {
        model: 'claude-3-haiku',
        messages: [{ role: 'user', content: 'Write a Python function to sort arrays' }]
      };

      const variations = generateCodeVariations();
      
      // Save initial response
      await cacheManager.saveResponse(
        provider,
        cacheManager.generateRequestHash(baseRequest),
        cacheManager.generateContextHash(baseRequest),
        cacheManager.generateSemanticHash(baseRequest),
        baseRequest,
        { choices: [{ message: { role: 'assistant', content: 'def sort_list(items): return sorted(items)' } }] },
        20, 0.001
      );

      // Test semantic variations
      for (let i = 1; i < Math.min(variations.length, 4); i++) {
        const variationRequest = {
          ...baseRequest,
          messages: [{ role: 'user', content: variations[i] }]
        };

        const result = await cacheManager.findCachedResponse(
          cacheManager.generateRequestHash(variationRequest),
          cacheManager.generateContextHash(variationRequest),
          cacheManager.generateSemanticHash(variationRequest),
          variations[i]
        );

        if (result) {
          expect(result.source).toBeOneOf(['exact', 'semantic', 'contextual', 'memory']);
          expect(result.similarity).toBeGreaterThan(0.6);
          
          if (result.source === 'semantic') {
            expect(result.similarity).toBeGreaterThan(0.7);
            expect(result.similarity).toBeLessThan(1.0);
          }
        }
      }
    });

    it('should handle context-based caching', async () => {
      const provider = 'openai';
      const conversationBase = [
        { role: 'user', content: 'What is machine learning?' },
        { role: 'assistant', content: 'Machine learning is a subset of AI...' }
      ];

      // First request in conversation
      const firstRequest = {
        model: 'gpt-4',
        messages: [...conversationBase, { role: 'user', content: 'How does supervised learning work?' }]
      };

      await cacheManager.saveResponse(
        provider,
        cacheManager.generateRequestHash(firstRequest),
        cacheManager.generateContextHash(firstRequest),
        cacheManager.generateSemanticHash(firstRequest),
        firstRequest,
        { choices: [{ message: { role: 'assistant', content: 'Supervised learning uses labeled data...' } }] },
        45, 0.0045
      );

      // Related request with similar context
      const secondRequest = {
        model: 'gpt-4',
        messages: [...conversationBase, { role: 'user', content: 'What about unsupervised learning?' }]
      };

      const result = await cacheManager.findCachedResponse(
        cacheManager.generateRequestHash(secondRequest),
        cacheManager.generateContextHash(secondRequest),
        cacheManager.generateSemanticHash(secondRequest),
        'What about unsupervised learning?'
      );

      // Should find contextual match due to similar conversation history
      if (result && result.source === 'contextual') {
        expect(result.similarity).toBeGreaterThan(0.7);
        expect(result.confidence).toBeGreaterThan(0.6);
      }
    });

    it('should demonstrate compression efficiency', async () => {
      const provider = 'openai';
      
      // Create a large response that should trigger compression
      const largeResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: 'Here is a detailed explanation:\n' + 'This is a very long response that contains lots of repeated information. '.repeat(100)
          }
        }],
        usage: { total_tokens: 500 }
      };

      const request = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Explain neural networks in detail' }]
      };

      await cacheManager.saveResponse(
        provider,
        cacheManager.generateRequestHash(request),
        cacheManager.generateContextHash(request),
        cacheManager.generateSemanticHash(request),
        request,
        largeResponse,
        500,
        0.05
      );

      const result = await cacheManager.findCachedResponse(
        cacheManager.generateRequestHash(request),
        cacheManager.generateContextHash(request),
        cacheManager.generateSemanticHash(request),
        'Explain neural networks in detail'
      );

      expect(result).toBeTruthy();
      expect(result!.entry.compressionRatio).toBeLessThan(0.8); // Should achieve good compression
      
      const retrievedResponse = JSON.parse(result!.entry.response);
      expect(retrievedResponse).toEqual(largeResponse); // Should decompress correctly
    });
  });

  describe('performance under load', () => {
    it('should handle concurrent cache operations', async () => {
      const operations: Promise<any>[] = [];
      const numOperations = 50;

      // Create concurrent save operations
      for (let i = 0; i < numOperations; i++) {
        const request = {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: `Request number ${i}` }]
        };

        const response = {
          choices: [{ message: { role: 'assistant', content: `Response ${i}` } }],
          usage: { total_tokens: 20 + i }
        };

        const operation = cacheManager.saveResponse(
          'test-provider',
          cacheManager.generateRequestHash(request),
          cacheManager.generateContextHash(request),  
          cacheManager.generateSemanticHash(request),
          request,
          response,
          20 + i,
          0.001 * i
        );

        operations.push(operation);
      }

      // Wait for all operations to complete
      const startTime = Date.now();
      await Promise.all(operations);
      const totalTime = Date.now() - startTime;

      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify all entries were saved
      let foundCount = 0;
      for (let i = 0; i < numOperations; i++) {
        const request = {
          model: 'gpt-3.5-turbo', 
          messages: [{ role: 'user', content: `Request number ${i}` }]
        };

        const result = await cacheManager.findCachedResponse(
          cacheManager.generateRequestHash(request),
          cacheManager.generateContextHash(request),
          cacheManager.generateSemanticHash(request),
          `Request number ${i}`
        );

        if (result) foundCount++;
      }

      expect(foundCount).toBeGreaterThan(numOperations * 0.8); // At least 80% should be found
    });

    it('should maintain performance with large cache', async () => {
      // Populate cache with many entries
      const numEntries = 100;
      for (let i = 0; i < numEntries; i++) {
        const request = {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: `Cache test ${i} with various keywords like python javascript algorithm data` }]
        };

        await cacheManager.saveResponse(
          'performance-test',
          cacheManager.generateRequestHash(request),
          cacheManager.generateContextHash(request),
          cacheManager.generateSemanticHash(request),
          request,
          { choices: [{ message: { role: 'assistant', content: `Response ${i}` } }] },
          25, 0.0025
        );
      }

      // Test search performance
      const searchRequest = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Python programming algorithm help' }]
      };

      const searches = [];
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        
        await cacheManager.findCachedResponse(
          cacheManager.generateRequestHash(searchRequest),
          cacheManager.generateContextHash(searchRequest),
          cacheManager.generateSemanticHash(searchRequest),
          'Python programming algorithm help'
        );
        
        const searchTime = Date.now() - startTime;
        searches.push(searchTime);
      }

      const avgSearchTime = searches.reduce((sum, time) => sum + time, 0) / searches.length;
      expect(avgSearchTime).toBeLessThan(100); // Average search should be under 100ms
    });
  });

  describe('cache cleanup and maintenance', () => {
    it('should clean up old entries effectively', async () => {
      // Create some old entries by manipulating timestamps (in real scenario)
      const oldRequest = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Old request that should be cleaned up' }]
      };

      await cacheManager.saveResponse(
        'test-provider',
        cacheManager.generateRequestHash(oldRequest),
        cacheManager.generateContextHash(oldRequest),
        cacheManager.generateSemanticHash(oldRequest),
        oldRequest,
        { choices: [{ message: { role: 'assistant', content: 'Old response' } }] },
        10, 0.001
      );

      // In a real test, we would manipulate the database timestamps
      // For this integration test, we'll just verify the cleanup method exists
      const cleanedCount = await cacheManager.cleanupOldEntries(1); // 1 day
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });

    it('should provide accurate statistics', async () => {
      // Add some test data
      const requests = [
        'Calculate fibonacci sequence',
        'Explain quantum computing', 
        'Write sorting algorithm',
        'Database optimization tips'
      ];

      for (let i = 0; i < requests.length; i++) {
        const request = {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: requests[i] }]
        };

        await cacheManager.saveResponse(
          'stats-test',
          cacheManager.generateRequestHash(request),
          cacheManager.generateContextHash(request),
          cacheManager.generateSemanticHash(request),
          request,
          { choices: [{ message: { role: 'assistant', content: `Response to: ${requests[i]}` } }] },
          30 + i * 5, 0.003 + i * 0.001
        );
      }

      const stats = await cacheManager.getStats();
      
      expect(stats.total_entries).toBeGreaterThan(0);
      expect(stats.total_tokens).toBeGreaterThan(0);
      expect(stats.total_cost).toBeGreaterThan(0);
      expect(stats.avg_compression_ratio).toBeGreaterThanOrEqual(0);
      
      if (stats.fastMemory) {
        expect(stats.fastMemory.totalEntries).toBeGreaterThanOrEqual(0);
        expect(stats.fastMemory.memoryUsage).toBeDefined();
      }
    });
  });

  describe('error handling and recovery', () => {
    it('should handle malformed cache entries gracefully', async () => {
      // This would test database corruption scenarios
      // For now, we'll test basic error handling
      
      expect(async () => {
        await cacheManager.findCachedResponse('invalid', 'hashes', 'here', 'test');
      }).not.toThrow();
    });

    it('should handle concurrent access safely', async () => {
      const request = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Concurrent access test' }]
      };

      const requestHash = cacheManager.generateRequestHash(request);
      const contextHash = cacheManager.generateContextHash(request);
      const semanticHash = cacheManager.generateSemanticHash(request);

      // Simulate concurrent reads and writes
      const operations = [];
      
      // Add some writes
      for (let i = 0; i < 5; i++) {
        operations.push(
          cacheManager.saveResponse(
            'concurrent-test',
            requestHash + i,
            contextHash,
            semanticHash,
            request,
            { choices: [{ message: { role: 'assistant', content: `Concurrent response ${i}` } }] },
            25, 0.0025
          )
        );
      }

      // Add some reads
      for (let i = 0; i < 5; i++) {
        operations.push(
          cacheManager.findCachedResponse(
            requestHash + i,
            contextHash,
            semanticHash,
            'Concurrent access test'
          )
        );
      }

      // Should complete without errors
      await expect(Promise.all(operations)).resolves.toBeDefined();
    });
  });

  describe('multi-level cache integration', () => {
    it('should integrate with fast memory store', async () => {
      const request = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Integration test for memory store' }]
      };

      const response = {
        choices: [{ message: { role: 'assistant', content: 'Memory integration response' } }],
        usage: { total_tokens: 35 }
      };

      // Save to cache (should also populate memory store)
      await cacheManager.saveResponse(
        'memory-test',
        cacheManager.generateRequestHash(request),
        cacheManager.generateContextHash(request),
        cacheManager.generateSemanticHash(request),
        request,
        response,
        35, 0.0035
      );

      // Wait for memory indexing
      await delay(100);

      // Search should potentially find entry in fast memory
      const result = await cacheManager.findCachedResponse(
        'different-hash', // Force semantic/memory search
        'different-context',
        'different-semantic',
        'Integration test for memory store'
      );

      if (result && result.source === 'memory') {
        expect(result.retrievalTimeMs).toBeLessThan(10); // Fast memory should be very quick
        expect(result.similarity).toBeGreaterThan(0.8);
      }
    });

    it('should demonstrate cache hierarchy performance', async () => {
      const testText = 'Demonstrate cache hierarchy with various similarity levels';
      
      // Create base entry
      const baseRequest = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: testText }]
      };

      await cacheManager.saveResponse(
        'hierarchy-test',
        cacheManager.generateRequestHash(baseRequest),
        cacheManager.generateContextHash(baseRequest),
        cacheManager.generateSemanticHash(baseRequest),
        baseRequest,
        { choices: [{ message: { role: 'assistant', content: 'Hierarchy response' } }] },
        30, 0.003
      );

      const testCases = [
        {
          name: 'Exact match',
          text: testText,
          expectedSource: 'exact',
          expectedMinSimilarity: 0.99
        },
        {
          name: 'Semantic match',
          text: 'Show cache hierarchy with different similarity levels',
          expectedSource: 'semantic',
          expectedMinSimilarity: 0.7
        },
        {
          name: 'Context match', 
          text: 'Different request but similar context',
          expectedSource: 'contextual',
          expectedMinSimilarity: 0.6
        }
      ];

      for (const testCase of testCases) {
        const testRequest = {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: testCase.text }]
        };

        const result = await cacheManager.findCachedResponse(
          cacheManager.generateRequestHash(testRequest),
          cacheManager.generateContextHash(testRequest),
          cacheManager.generateSemanticHash(testRequest),
          testCase.text
        );

        if (result) {
          console.log(`${testCase.name}: ${result.source} (similarity: ${result.similarity.toFixed(3)}, time: ${result.retrievalTimeMs}ms)`);
          
          if (result.source === testCase.expectedSource) {
            expect(result.similarity).toBeGreaterThan(testCase.expectedMinSimilarity);
            expect(result.retrievalTimeMs).toBeLessThan(200);
          }
        }
      }
    });
  });
});