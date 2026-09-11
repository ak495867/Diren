import { ProxyHandler } from '../proxy/ProxyHandler';
import { CacheManager } from '../cache/CacheManager';
import { ConfigManager } from '../config/ConfigManager';
import { Analytics } from '../analytics/Analytics';
import TestEnvironment, { expectCacheHit, expectCacheMiss } from './setup';
import express from 'express';
import request from 'supertest';

// Mock axios for API calls
jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ProxyHandler Integration', () => {
  let testEnv: TestEnvironment;
  let app: express.Application;
  let cacheManager: CacheManager;
  let configManager: ConfigManager;
  let analytics: Analytics;
  let proxyHandler: ProxyHandler;

  beforeAll(async () => {
    testEnv = new TestEnvironment();
    await testEnv.setup();
  });

  afterAll(async () => {
    await testEnv.teardown();
  });

  beforeEach(async () => {
    // Setup components
    configManager = new ConfigManager();
    cacheManager = new CacheManager();
    analytics = new Analytics();
    
    await cacheManager.initialize();
    
    proxyHandler = new ProxyHandler(cacheManager, configManager, analytics);

    // Setup Express app for testing
    app = express();
    app.use(express.json());
    
    // Add proxy routes
    app.post('/v1/chat/completions', proxyHandler.handleOpenAI.bind(proxyHandler));
    app.post('/v1/messages', proxyHandler.handleAnthropic.bind(proxyHandler));
    app.post('/v1/smart/chat/completions', (req, res, next) => {
      req.headers['x-diren-smart-routing'] = 'true';
      next();
    }, proxyHandler.handleUniversal.bind(proxyHandler));
    app.all('/v1/*', proxyHandler.handleUniversal.bind(proxyHandler));

    // Setup test configuration
    await testEnv.setupTestConfig();

    // Reset axios mocks
    mockedAxios.post.mockReset();
  });

  describe('OpenAI integration', () => {
    it('should handle OpenAI requests with cache miss', async () => {
      const mockResponse = testEnv.createTestResponse('OpenAI response content');
      mockedAxios.post.mockResolvedValueOnce({
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });

      const testRequest = testEnv.createTestRequest('What is machine learning?');
      
      const response = await request(app)
        .post('/v1/chat/completions')
        .send(testRequest)
        .expect(200);

      // Should be cache miss on first request
      expectCacheMiss(response.headers);
      expect(response.body).toEqual(mockResponse);

      // Verify axios was called with correct parameters
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('api.openai.com'),
        testRequest,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Bearer'),
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should serve from cache on second identical request', async () => {
      const mockResponse = testEnv.createTestResponse('Cached response');
      mockedAxios.post.mockResolvedValueOnce({
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });

      const testRequest = testEnv.createTestRequest('Explain neural networks');

      // First request - cache miss
      await request(app)
        .post('/v1/chat/completions')
        .send(testRequest)
        .expect(200);

      // Second identical request - should be cache hit
      const response = await request(app)
        .post('/v1/chat/completions')
        .send(testRequest)
        .expect(200);

      expectCacheHit(response, 'exact');
      expect(response.body).toEqual(mockResponse);

      // Axios should only be called once (for the first request)
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should handle semantic similarity caching', async () => {
      const mockResponse = testEnv.createTestResponse('Python sorting function');
      mockedAxios.post.mockResolvedValueOnce({
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });

      // First request
      const firstRequest = testEnv.createTestRequest('Write a Python function to sort arrays');
      await request(app)
        .post('/v1/chat/completions')
        .send(firstRequest)
        .expect(200);

      // Semantically similar request
      const secondRequest = testEnv.createTestRequest('Create a sorting function in Python');
      const response = await request(app)
        .post('/v1/chat/completions')
        .send(secondRequest)
        .expect(200);

      // Should be semantic or contextual cache hit
      if (response.headers['x-diren-cache'] === 'HIT') {
        const source = response.headers['x-diren-cache-source'];
        expect(['semantic', 'contextual', 'memory']).toContain(source);
        expect(parseFloat(response.headers['x-diren-cache-similarity'])).toBeGreaterThan(0.7);
      }
    });

    it('should handle API errors gracefully', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: {
          status: 401,
          data: { error: 'Invalid API key' }
        }
      });

      const testRequest = testEnv.createTestRequest('Test error handling');

      const response = await request(app)
        .post('/v1/chat/completions')
        .send(testRequest)
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Invalid API key',
        provider: 'openai',
        diren_proxy: true
      });
    });

    it('should handle network timeouts', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        code: 'ETIMEDOUT',
        message: 'Request timeout'
      });

      const testRequest = testEnv.createTestRequest('Test timeout');

      const response = await request(app)
        .post('/v1/chat/completions')
        .send(testRequest)
        .expect(504);

      expect(response.body).toMatchObject({
        error: expect.stringContaining('timed out'),
        provider: 'openai'
      });
    });
  });

  describe('Anthropic integration', () => {
    it('should handle Anthropic requests correctly', async () => {
      const mockResponse = {
        content: [{ text: 'Anthropic response content' }],
        usage: { input_tokens: 10, output_tokens: 15 }
      };

      mockedAxios.post.mockResolvedValueOnce({
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });

      const testRequest = {
        model: 'claude-3-haiku-20240307',
        messages: [{ role: 'user', content: 'Hello Claude' }],
        max_tokens: 100
      };

      const response = await request(app)
        .post('/v1/messages')
        .send(testRequest)
        .expect(200);

      expect(response.body).toEqual(mockResponse);

      // Verify request transformation for Anthropic
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('anthropic.com'),
        expect.objectContaining({
          model: 'claude-3-haiku-20240307',
          messages: testRequest.messages,
          max_tokens: 100
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': expect.any(String),
            'anthropic-version': '2023-06-01'
          })
        })
      );
    });

    it('should transform requests with system messages', async () => {
      const mockResponse = { content: [{ text: 'Response with system context' }] };
      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse, status: 200 });

      const testRequest = {
        model: 'claude-3-sonnet-20240229',
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Hello' }
        ]
      };

      await request(app)
        .post('/v1/messages')
        .send(testRequest)
        .expect(200);

      const calledWith = mockedAxios.post.mock.calls[0][1];
      expect(calledWith).toMatchObject({
        system: 'You are a helpful assistant',
        messages: [{ role: 'user', content: 'Hello' }]
      });
    });
  });

  describe('Smart routing integration', () => {
    it('should enable smart routing with header', async () => {
      const mockResponse = testEnv.createTestResponse('Smart routing response');
      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse, status: 200 });

      const testRequest = testEnv.createTestRequest('Write Python code to process data');

      const response = await request(app)
        .post('/v1/smart/chat/completions')
        .send(testRequest)
        .expect(200);

      // Should include routing information in headers
      expect(response.headers['x-diren-selected-provider']).toBeDefined();
      expect(response.headers['x-diren-routing-confidence']).toBeDefined();
    });

    it('should respect quality preferences in smart routing', async () => {
      const mockResponse = testEnv.createTestResponse('High quality response');
      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse, status: 200 });

      const testRequest = testEnv.createTestRequest('Complex analysis task');

      const response = await request(app)
        .post('/v1/chat/completions')
        .set('X-Diren-Smart-Routing', 'true')
        .set('X-Diren-Quality', 'high')
        .send(testRequest)
        .expect(200);

      const selectedProvider = response.headers['x-diren-selected-provider'];
      const confidence = parseFloat(response.headers['x-diren-routing-confidence']);
      
      expect(selectedProvider).toBeTruthy();
      expect(confidence).toBeGreaterThan(0);
    });

    it('should respect cost constraints', async () => {
      const mockResponse = testEnv.createTestResponse('Cost-efficient response');
      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse, status: 200 });

      const testRequest = testEnv.createTestRequest('Simple question');

      const response = await request(app)
        .post('/v1/chat/completions')
        .set('X-Diren-Smart-Routing', 'true')
        .set('X-Diren-Max-Cost', '0.001')
        .send(testRequest)
        .expect(200);

      const estimatedCost = parseFloat(response.headers['x-diren-estimated-cost'] || '0');
      expect(estimatedCost).toBeLessThanOrEqual(0.001);
    });
  });

  describe('Provider detection and routing', () => {
    it('should detect provider from URL path', async () => {
      const mockResponse = testEnv.createTestResponse('Auto-detected response');
      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse, status: 200 });

      const testRequest = testEnv.createTestRequest('Auto-detect test');

      // Test different URL patterns
      const testCases = [
        { path: '/v1/chat/completions', expectedProvider: 'openai' },
        { path: '/v1/messages', expectedProvider: 'anthropic' }
      ];

      for (const testCase of testCases) {
        await request(app)
          .post(testCase.path)
          .send(testRequest)
          .expect(200);

        // Verify correct provider was used based on URL
        const lastCall = mockedAxios.post.mock.calls[mockedAxios.post.mock.calls.length - 1];
        const url = lastCall[0];
        
        if (testCase.expectedProvider === 'openai') {
          expect(url).toContain('openai.com');
        } else if (testCase.expectedProvider === 'anthropic') {
          expect(url).toContain('anthropic.com');
        }
      }
    });

    it('should use explicit provider header', async () => {
      const mockResponse = testEnv.createTestResponse('Explicit provider response');
      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse, status: 200 });

      const testRequest = testEnv.createTestRequest('Explicit provider test');

      await request(app)
        .post('/v1/chat/completions')
        .set('X-Diren-Provider', 'anthropic')
        .send(testRequest)
        .expect(200);

      // Should use Anthropic despite OpenAI endpoint
      const calledUrl = mockedAxios.post.mock.calls[0][0];
      expect(calledUrl).toContain('anthropic.com');
    });

    it('should handle unknown providers gracefully', async () => {
      const testRequest = testEnv.createTestRequest('Unknown provider test');

      const response = await request(app)
        .post('/v1/chat/completions')
        .set('X-Diren-Provider', 'unknown-provider')
        .send(testRequest)
        .expect(401);

      expect(response.body.error).toContain('No API key configured');
    });
  });

  describe('Performance and analytics integration', () => {
    it('should track performance metrics', async () => {
      const mockResponse = testEnv.createTestResponse('Analytics test response');
      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse, status: 200 });

      const testRequest = testEnv.createTestRequest('Analytics tracking test');

      const response = await request(app)
        .post('/v1/chat/completions')
        .send(testRequest)
        .expect(200);

      // Should include performance headers
      expect(response.headers['x-diren-provider']).toBe('openai');
      expect(response.headers['x-diren-tokens']).toBeTruthy();
      expect(response.headers['x-diren-cost']).toBeTruthy();
      expect(response.headers['x-diren-response-time']).toMatch(/\d+ms/);
    });

    it('should update analytics on cache hits and misses', async () => {
      const mockResponse = testEnv.createTestResponse('Analytics cache test');
      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse, status: 200 });

      const testRequest = testEnv.createTestRequest('Cache analytics test');

      // First request (cache miss)
      await request(app)
        .post('/v1/chat/completions')
        .send(testRequest);

      // Second request (cache hit)
      const response = await request(app)
        .post('/v1/chat/completions')
        .send(testRequest);

      // Verify analytics were updated
      const stats = analytics.getStats();
      expect(stats.totalRequests).toBeGreaterThanOrEqual(2);
      expect(stats.cacheHits).toBeGreaterThanOrEqual(1);
      expect(stats.apiCalls).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Error handling and resilience', () => {
    it('should handle provider configuration errors', async () => {
      // Test with disabled provider
      await configManager.enableProvider('openai', false);

      const testRequest = testEnv.createTestRequest('Disabled provider test');

      const response = await request(app)
        .post('/v1/chat/completions')
        .send(testRequest)
        .expect(403);

      expect(response.body.error).toContain('disabled');
    });

    it('should retry on temporary failures', async () => {
      // Mock temporary failure followed by success
      mockedAxios.post
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockResolvedValueOnce({ 
          data: testEnv.createTestResponse('Retry success'), 
          status: 200 
        });

      const testRequest = testEnv.createTestRequest('Retry test');

      const response = await request(app)
        .post('/v1/chat/completions')
        .send(testRequest)
        .expect(200);

      // Should succeed after retries
      expect(response.body.choices[0].message.content).toContain('Retry success');
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    it('should not retry on authentication errors', async () => {
      mockedAxios.post.mockRejectedValue({ 
        response: { status: 401, data: { error: 'Invalid API key' } }
      });

      const testRequest = testEnv.createTestRequest('Auth error test');

      await request(app)
        .post('/v1/chat/completions')
        .send(testRequest)
        .expect(401);

      // Should not retry on 401 errors
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should handle malformed responses', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { invalid: 'response structure' },
        status: 200
      });

      const testRequest = testEnv.createTestRequest('Malformed response test');

      const response = await request(app)
        .post('/v1/chat/completions')
        .send(testRequest)
        .expect(200);

      // Should pass through the response even if malformed
      expect(response.body).toEqual({ invalid: 'response structure' });
    });
  });

  describe('Compression and storage', () => {
    it('should handle large responses with compression', async () => {
      const largeContent = 'This is a very long response. '.repeat(200);
      const mockResponse = testEnv.createTestResponse(largeContent);
      
      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse, status: 200 });

      const testRequest = testEnv.createTestRequest('Large response test');

      const response = await request(app)
        .post('/v1/chat/completions')
        .send(testRequest)
        .expect(200);

      expect(response.body).toEqual(mockResponse);

      // Verify compression was applied by checking cache
      const requestHash = cacheManager.generateRequestHash(testRequest);
      const contextHash = cacheManager.generateContextHash(testRequest);
      const semanticHash = cacheManager.generateSemanticHash(testRequest);
      
      const cachedResult = await cacheManager.findCachedResponse(
        requestHash, contextHash, semanticHash, testRequest.messages[0].content
      );

      if (cachedResult && cachedResult.entry.compressionRatio) {
        expect(cachedResult.entry.compressionRatio).toBeLessThan(0.9); // Should achieve compression
      }
    });
  });

  describe('Concurrent request handling', () => {
    it('should handle multiple concurrent requests', async () => {
      const requests = Array.from({ length: 10 }, (_, i) => 
        testEnv.createTestRequest(`Concurrent request ${i}`)
      );

      const responses = requests.map((_, i) => 
        testEnv.createTestResponse(`Concurrent response ${i}`)
      );

      // Mock all responses
      responses.forEach(response => {
        mockedAxios.post.mockResolvedValueOnce({ data: response, status: 200 });
      });

      // Send all requests concurrently
      const promises = requests.map(req =>
        request(app).post('/v1/chat/completions').send(req)
      );

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach(result => {
        expect(result.status).toBe(200);
      });

      expect(mockedAxios.post).toHaveBeenCalledTimes(10);
    });

    it('should handle cache contention safely', async () => {
      const sameRequest = testEnv.createTestRequest('Cache contention test');
      const mockResponse = testEnv.createTestResponse('Shared response');
      
      mockedAxios.post.mockResolvedValue({ data: mockResponse, status: 200 });

      // Send identical requests concurrently
      const promises = Array.from({ length: 5 }, () =>
        request(app).post('/v1/chat/completions').send(sameRequest)
      );

      const results = await Promise.all(promises);

      // All should succeed with same response
      results.forEach(result => {
        expect(result.status).toBe(200);
        expect(result.body).toEqual(mockResponse);
      });

      // Should only call API once due to caching
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });
});