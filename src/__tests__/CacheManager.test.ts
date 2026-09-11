import { CacheManager } from '../cache/CacheManager';
import fs from 'fs';
import path from 'path';

describe('CacheManager', () => {
  let cacheManager: CacheManager;
  let testDbPath: string;

  beforeEach(async () => {
    cacheManager = new CacheManager();
    await cacheManager.initialize();
    testDbPath = path.join(__dirname, '..', '..', 'test_cache.db');
  });

  afterEach(() => {
    // Clean up test database if it exists
    if (testDbPath && fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('should generate consistent hashes', () => {
    const request = {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.7
    };

    const hash1 = cacheManager.generateRequestHash(request);
    const hash2 = cacheManager.generateRequestHash(request);
    
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex length
  });

  test('should generate different hashes for different requests', () => {
    const request1 = {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello' }]
    };

    const request2 = {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hi' }]
    };

    const hash1 = cacheManager.generateRequestHash(request1);
    const hash2 = cacheManager.generateRequestHash(request2);
    
    expect(hash1).not.toBe(hash2);
  });

  test('should generate similar context hashes for similar contexts', () => {
    const request1 = {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.7,
      someOtherField: 'ignored'
    };

    const request2 = {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.7,
      differentField: 'also ignored'
    };

    const contextHash1 = cacheManager.generateContextHash(request1);
    const contextHash2 = cacheManager.generateContextHash(request2);
    
    expect(contextHash1).toBe(contextHash2);
  });
});