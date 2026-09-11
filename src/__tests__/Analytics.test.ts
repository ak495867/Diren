import { Analytics, AnalyticsData } from '../analytics/Analytics';
import fs from 'fs';
import path from 'path';

describe('Analytics', () => {
  let analytics: Analytics;
  let testDataPath: string;

  beforeEach(() => {
    // Setup test data directory
    const testDir = path.join(__dirname, '../../test-data/.diren');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    analytics = new Analytics();
  });

  afterEach(() => {
    // Clean up test data
    const testDir = path.join(__dirname, '../../test-data');
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('basic analytics tracking', () => {
    it('should start with empty analytics', () => {
      const stats = analytics.getStats();
      
      expect(stats.totalRequests).toBe(0);
      expect(stats.cacheHits).toBe(0);
      expect(stats.apiCalls).toBe(0);
      expect(stats.totalCost).toBe(0);
      expect(stats.savedCost).toBe(0);
    });

    it('should record cache hits correctly', () => {
      analytics.recordCacheHit('openai', 0.005);
      analytics.recordCacheHit('anthropic', 0.003);
      
      const stats = analytics.getStats();
      
      expect(stats.totalRequests).toBe(2);
      expect(stats.cacheHits).toBe(2);
      expect(stats.apiCalls).toBe(0);
      expect(stats.savedCost).toBe(0.008);
    });

    it('should record API calls correctly', () => {
      analytics.recordApiCall('openai', 0.01);
      analytics.recordApiCall('anthropic', 0.005);
      
      const stats = analytics.getStats();
      
      expect(stats.totalRequests).toBe(2);
      expect(stats.cacheHits).toBe(0);
      expect(stats.apiCalls).toBe(2);
      expect(stats.totalCost).toBe(0.015);
      expect(stats.savedCost).toBe(0);
    });

    it('should track mixed cache hits and API calls', () => {
      analytics.recordApiCall('openai', 0.01);
      analytics.recordCacheHit('openai', 0.01);
      analytics.recordApiCall('anthropic', 0.005);
      analytics.recordCacheHit('anthropic', 0.005);
      
      const stats = analytics.getStats();
      
      expect(stats.totalRequests).toBe(4);
      expect(stats.cacheHits).toBe(2);
      expect(stats.apiCalls).toBe(2);
      expect(stats.totalCost).toBe(0.015);
      expect(stats.savedCost).toBe(0.015);
    });
  });

  describe('provider-specific analytics', () => {
    it('should track statistics per provider', () => {
      analytics.recordApiCall('openai', 0.01);
      analytics.recordCacheHit('openai', 0.01);
      analytics.recordApiCall('anthropic', 0.005);
      analytics.recordCacheHit('anthropic', 0.005);
      
      const stats = analytics.getStats();
      
      expect(stats.providerStats.openai).toBeDefined();
      expect(stats.providerStats.anthropic).toBeDefined();
      
      expect(stats.providerStats.openai.requests).toBe(2);
      expect(stats.providerStats.openai.cacheHits).toBe(1);
      expect(stats.providerStats.openai.cost).toBe(0.01);
      expect(stats.providerStats.openai.saved).toBe(0.01);
      
      expect(stats.providerStats.anthropic.requests).toBe(2);
      expect(stats.providerStats.anthropic.cacheHits).toBe(1);
      expect(stats.providerStats.anthropic.cost).toBe(0.005);
      expect(stats.providerStats.anthropic.saved).toBe(0.005);
    });

    it('should initialize provider stats on first use', () => {
      analytics.recordApiCall('new-provider', 0.001);
      
      const stats = analytics.getStats();
      
      expect(stats.providerStats['new-provider']).toBeDefined();
      expect(stats.providerStats['new-provider'].requests).toBe(1);
      expect(stats.providerStats['new-provider'].cacheHits).toBe(0);
      expect(stats.providerStats['new-provider'].cost).toBe(0.001);
      expect(stats.providerStats['new-provider'].saved).toBe(0);
    });
  });

  describe('calculated metrics', () => {
    it('should calculate cache hit rate correctly', () => {
      // 3 API calls, 2 cache hits = 40% hit rate
      analytics.recordApiCall('openai', 0.01);
      analytics.recordApiCall('openai', 0.01);
      analytics.recordApiCall('openai', 0.01);
      analytics.recordCacheHit('openai', 0.01);
      analytics.recordCacheHit('openai', 0.01);
      
      const stats = analytics.getStats();
      
      expect(stats.cacheHitRate).toBeCloseTo(40.0, 1);
    });

    it('should calculate savings percentage correctly', () => {
      // $0.02 spent, $0.03 saved = 60% savings
      analytics.recordApiCall('openai', 0.02);
      analytics.recordCacheHit('openai', 0.03);
      
      const stats = analytics.getStats();
      
      expect(stats.savingsPercentage).toBeCloseTo(60.0, 1);
    });

    it('should handle zero division gracefully', () => {
      const stats = analytics.getStats();
      
      expect(stats.cacheHitRate).toBe(0);
      expect(stats.savingsPercentage).toBe(0);
    });

    it('should calculate total value correctly', () => {
      analytics.recordApiCall('openai', 0.01);
      analytics.recordCacheHit('openai', 0.02);
      
      const stats = analytics.getStats();
      
      // Total value = cost + savings = 0.01 + 0.02 = 0.03
      const expectedSavingsPercentage = (0.02 / 0.03) * 100;
      expect(stats.savingsPercentage).toBeCloseTo(expectedSavingsPercentage, 1);
    });
  });

  describe('data persistence', () => {
    it('should persist analytics data across instances', () => {
      analytics.recordApiCall('openai', 0.01);
      analytics.recordCacheHit('anthropic', 0.005);
      
      // Create new analytics instance
      const newAnalytics = new Analytics();
      const stats = newAnalytics.getStats();
      
      expect(stats.totalRequests).toBe(2);
      expect(stats.apiCalls).toBe(1);
      expect(stats.cacheHits).toBe(1);
      expect(stats.totalCost).toBe(0.01);
      expect(stats.savedCost).toBe(0.005);
    });

    it('should handle corrupted analytics file gracefully', () => {
      // Corrupt the analytics file
      const analyticsPath = analytics['dataPath'];
      const analyticsDir = path.dirname(analyticsPath);
      
      if (!fs.existsSync(analyticsDir)) {
        fs.mkdirSync(analyticsDir, { recursive: true });
      }
      
      fs.writeFileSync(analyticsPath, 'invalid json data');
      
      // Should start with empty data instead of crashing
      const newAnalytics = new Analytics();
      const stats = newAnalytics.getStats();
      
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('performance under load', () => {
    it('should handle many analytics updates efficiently', () => {
      const startTime = Date.now();
      
      // Record many events
      for (let i = 0; i < 1000; i++) {
        if (i % 2 === 0) {
          analytics.recordApiCall('openai', 0.001);
        } else {
          analytics.recordCacheHit('openai', 0.001);
        }
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Should complete quickly
      expect(totalTime).toBeLessThan(1000); // Less than 1 second
      
      const stats = analytics.getStats();
      expect(stats.totalRequests).toBe(1000);
      expect(stats.apiCalls).toBe(500);
      expect(stats.cacheHits).toBe(500);
    });

    it('should handle concurrent updates safely', async () => {
      const promises = [];
      
      // Simulate concurrent analytics updates
      for (let i = 0; i < 100; i++) {
        promises.push(
          new Promise<void>((resolve) => {
            setTimeout(() => {
              analytics.recordApiCall('concurrent-test', 0.001);
              analytics.recordCacheHit('concurrent-test', 0.001);
              resolve();
            }, Math.random() * 10);
          })
        );
      }
      
      await Promise.all(promises);
      
      const stats = analytics.getStats();
      expect(stats.providerStats['concurrent-test'].requests).toBe(200);
    });
  });

  describe('statistics calculations', () => {
    it('should provide accurate provider breakdowns', () => {
      // Different usage patterns per provider
      analytics.recordApiCall('openai', 0.02);
      analytics.recordCacheHit('openai', 0.02);
      analytics.recordCacheHit('openai', 0.02);
      
      analytics.recordApiCall('anthropic', 0.005);
      analytics.recordCacheHit('anthropic', 0.005);
      
      const stats = analytics.getStats();
      
      // OpenAI: 1 API call, 2 cache hits
      expect(stats.providerStats.openai.requests).toBe(3);
      expect(stats.providerStats.openai.cacheHits).toBe(2);
      expect(stats.providerStats.openai.cost).toBe(0.02);
      expect(stats.providerStats.openai.saved).toBe(0.04);
      
      // Anthropic: 1 API call, 1 cache hit
      expect(stats.providerStats.anthropic.requests).toBe(2);
      expect(stats.providerStats.anthropic.cacheHits).toBe(1);
      expect(stats.providerStats.anthropic.cost).toBe(0.005);
      expect(stats.providerStats.anthropic.saved).toBe(0.005);
    });

    it('should handle edge cases in calculations', () => {
      // Test with very small numbers
      analytics.recordApiCall('test', 0.0001);
      analytics.recordCacheHit('test', 0.0001);
      
      const stats = analytics.getStats();
      
      expect(stats.totalCost).toBeCloseTo(0.0001, 4);
      expect(stats.savedCost).toBeCloseTo(0.0001, 4);
      expect(stats.cacheHitRate).toBe(50.0);
    });

    it('should maintain precision with floating point numbers', () => {
      // Add many small amounts to test floating point precision
      for (let i = 0; i < 100; i++) {
        analytics.recordApiCall('precision-test', 0.001);
      }
      
      const stats = analytics.getStats();
      
      // Should be close to 0.1, allowing for floating point precision
      expect(stats.totalCost).toBeCloseTo(0.1, 2);
    });
  });

  describe('data structure integrity', () => {
    it('should maintain consistent data structure', () => {
      analytics.recordApiCall('test1', 0.01);
      analytics.recordCacheHit('test2', 0.005);
      
      const stats = analytics.getStats();
      
      // Verify all expected fields are present
      expect(stats).toMatchObject({
        totalRequests: expect.any(Number),
        cacheHits: expect.any(Number),
        apiCalls: expect.any(Number),
        totalCost: expect.any(Number),
        savedCost: expect.any(Number),
        cacheHitRate: expect.any(Number),
        estimatedSavings: expect.any(Number),
        savingsPercentage: expect.any(Number),
        providerStats: expect.any(Object)
      });
      
      // Verify provider stats structure
      Object.values(stats.providerStats).forEach(providerStat => {
        expect(providerStat).toMatchObject({
          requests: expect.any(Number),
          cacheHits: expect.any(Number),
          cost: expect.any(Number),
          saved: expect.any(Number)
        });
      });
    });
  });

  describe('clear statistics', () => {
    it('should clear all statistics', () => {
      analytics.recordApiCall('openai', 0.01);
      analytics.recordCacheHit('anthropic', 0.005);
      
      analytics.clearStats();
      
      const stats = analytics.getStats();
      
      expect(stats.totalRequests).toBe(0);
      expect(stats.cacheHits).toBe(0);
      expect(stats.apiCalls).toBe(0);
      expect(stats.totalCost).toBe(0);
      expect(stats.savedCost).toBe(0);
      expect(Object.keys(stats.providerStats)).toHaveLength(0);
    });

    it('should persist cleared state', () => {
      analytics.recordApiCall('openai', 0.01);
      analytics.clearStats();
      
      const newAnalytics = new Analytics();
      const stats = newAnalytics.getStats();
      
      expect(stats.totalRequests).toBe(0);
    });
  });
});