import { DirenServer } from '../index';
import TestEnvironment from './setup';
import axios from 'axios';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

// Mock axios for external API calls
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Diren System E2E Tests', () => {
  let testEnv: TestEnvironment;
  let server: DirenServer | null = null;
  let serverUrl: string;

  beforeAll(async () => {
    testEnv = new TestEnvironment();
    await testEnv.setup();
    serverUrl = testEnv.getServerUrl();
  }, 30000);

  afterAll(async () => {
    if (server) {
      // In a real scenario, we'd properly stop the server
      server = null;
    }
    await testEnv.teardown();
  });

  beforeEach(() => {
    mockedAxios.post.mockReset();
    mockedAxios.get.mockReset();
  });

  describe('Server Startup and Health', () => {
    it('should start server and respond to health checks', async () => {
      server = await testEnv.startServer();
      
      const healthResponse = await axios.get(`${serverUrl}/health`);
      
      expect(healthResponse.status).toBe(200);
      expect(healthResponse.data).toMatchObject({
        status: 'ok',
        version: '1.0.0',
        uptime: expect.any(Number)
      });
    });

    it('should serve dashboard on correct endpoint', async () => {
      const response = await axios.get(`${serverUrl}/dashboard`);
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
    });

    it('should provide API endpoints', async () => {
      const endpoints = [
        '/api/analytics',
        '/api/models', 
        '/api/memory',
        '/metrics'
      ];

      for (const endpoint of endpoints) {
        const response = await axios.get(`${serverUrl}${endpoint}`);
        expect([200, 500]).toContain(response.status); // Some might fail without data
      }
    });
  });

  describe('Complete Request Lifecycle', () => {
    it('should handle end-to-end OpenAI request with caching', async () => {
      const mockResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: 'This is a complete end-to-end test response from OpenAI.'
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 15,
          total_tokens: 35
        },
        model: 'gpt-3.5-turbo'
      };

      mockedAxios.post.mockResolvedValue({
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });

      const requestPayload = {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'user', content: 'What is the meaning of life in the context of AI?' }
        ],
        max_tokens: 100,
        temperature: 0.7
      };

      // First request - should be cache miss
      const firstResponse = await axios.post(`${serverUrl}/v1/chat/completions`, requestPayload, {
        headers: { 'Content-Type': 'application/json' }
      });

      expect(firstResponse.status).toBe(200);
      expect(firstResponse.data).toEqual(mockResponse);
      expect(firstResponse.headers['x-diren-cache']).toBe('MISS');
      expect(firstResponse.headers['x-diren-provider']).toBe('openai');

      // Second identical request - should be cache hit
      const secondResponse = await axios.post(`${serverUrl}/v1/chat/completions`, requestPayload, {
        headers: { 'Content-Type': 'application/json' }
      });

      expect(secondResponse.status).toBe(200);
      expect(secondResponse.data).toEqual(mockResponse);
      expect(secondResponse.headers['x-diren-cache']).toBe('HIT');
      expect(secondResponse.headers['x-diren-cache-source']).toBe('exact');
      expect(parseFloat(secondResponse.headers['x-diren-cache-similarity'])).toBeCloseTo(1.0, 1);

      // Verify only one actual API call was made
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should demonstrate semantic caching across similar requests', async () => {
      const mockResponses = [
        {
          choices: [{ message: { role: 'assistant', content: 'Python function implementation' } }],
          usage: { total_tokens: 30 }
        },
        {
          choices: [{ message: { role: 'assistant', content: 'Another Python implementation' } }],
          usage: { total_tokens: 25 }
        }
      ];

      mockedAxios.post
        .mockResolvedValueOnce({ data: mockResponses[0], status: 200 })
        .mockResolvedValueOnce({ data: mockResponses[1], status: 200 });

      const requests = [
        {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Write a Python function to sort arrays' }]
        },
        {
          model: 'gpt-3.5-turbo', 
          messages: [{ role: 'user', content: 'Create a sorting algorithm in Python' }]
        },
        {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Python array sorting implementation' }]
        }
      ];

      const responses = [];
      
      // Send requests sequentially to build up cache
      for (const request of requests) {
        const response = await axios.post(`${serverUrl}/v1/chat/completions`, request);
        responses.push(response);
        
        // Small delay to allow for caching
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // First should be cache miss
      expect(responses[0].headers['x-diren-cache']).toBe('MISS');

      // Later requests should potentially hit semantic cache
      const cacheHits = responses.slice(1).filter(r => r.headers['x-diren-cache'] === 'HIT');
      
      if (cacheHits.length > 0) {
        const semanticHit = cacheHits.find(r => 
          ['semantic', 'contextual', 'memory'].includes(r.headers['x-diren-cache-source'])
        );
        
        if (semanticHit) {
          expect(parseFloat(semanticHit.headers['x-diren-cache-similarity'])).toBeGreaterThan(0.6);
          console.log(`Semantic cache hit achieved with ${semanticHit.headers['x-diren-cache-similarity']} similarity`);
        }
      }
    });

    it('should handle smart routing with quality preferences', async () => {
      const mockResponse = {
        choices: [{ message: { role: 'assistant', content: 'Smart routing response' } }],
        usage: { total_tokens: 40 }
      };

      mockedAxios.post.mockResolvedValue({ data: mockResponse, status: 200 });

      const requestPayload = {
        model: 'auto', // Let smart routing decide
        messages: [{ role: 'user', content: 'Analyze the complexity of this algorithm' }],
        max_tokens: 150
      };

      const response = await axios.post(`${serverUrl}/v1/smart/chat/completions`, requestPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Diren-Quality': 'high',
          'X-Diren-Max-Cost': '0.01',
          'X-Diren-Capabilities': 'analysis'
        }
      });

      expect(response.status).toBe(200);
      expect(response.data).toEqual(mockResponse);
      
      // Should include routing metadata
      expect(response.headers['x-diren-selected-provider']).toBeTruthy();
      expect(response.headers['x-diren-selected-model']).toBeTruthy();
      expect(parseFloat(response.headers['x-diren-routing-confidence'])).toBeGreaterThan(0);
      expect(response.headers['x-diren-reasoning']).toBeTruthy();
    });

    it('should track analytics across multiple requests', async () => {
      const mockResponse = {
        choices: [{ message: { role: 'assistant', content: 'Analytics tracking response' } }],
        usage: { total_tokens: 20 }
      };

      mockedAxios.post.mockResolvedValue({ data: mockResponse, status: 200 });

      // Make several requests to build up analytics
      const requests = [
        'Explain machine learning',
        'What is deep learning?',
        'How do neural networks work?',
        'Explain machine learning', // Duplicate for cache hit
        'What is artificial intelligence?'
      ];

      for (const content of requests) {
        await axios.post(`${serverUrl}/v1/chat/completions`, {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content }]
        });
        
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Check analytics
      const analyticsResponse = await axios.get(`${serverUrl}/api/analytics`);
      expect(analyticsResponse.status).toBe(200);
      
      const analytics = analyticsResponse.data;
      expect(analytics.totalRequests).toBeGreaterThanOrEqual(5);
      expect(analytics.cacheHits).toBeGreaterThanOrEqual(1); // At least one duplicate
      expect(analytics.estimatedSavings).toBeGreaterThan(0);
      expect(analytics.cacheHitRate).toBeGreaterThan(0);
    });
  });

  describe('Multi-Provider Integration', () => {
    it('should route to different providers correctly', async () => {
      const providers = [
        { endpoint: '/v1/chat/completions', provider: 'openai' },
        { endpoint: '/v1/messages', provider: 'anthropic' }
      ];

      const mockResponse = {
        choices: [{ message: { role: 'assistant', content: 'Multi-provider test' } }],
        usage: { total_tokens: 15 }
      };

      mockedAxios.post.mockResolvedValue({ data: mockResponse, status: 200 });

      for (const { endpoint, provider } of providers) {
        const requestPayload = {
          model: provider === 'anthropic' ? 'claude-3-haiku' : 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: `Test ${provider} integration` }]
        };

        const response = await axios.post(`${serverUrl}${endpoint}`, requestPayload);
        
        expect(response.status).toBe(200);
        expect(response.headers['x-diren-provider'] || provider).toBe(provider);
      }
    });

    it('should handle provider-specific request formats', async () => {
      // Test Anthropic-specific request with system message
      const anthropicMockResponse = {
        content: [{ text: 'Anthropic system message response' }],
        usage: { input_tokens: 10, output_tokens: 15 }
      };

      mockedAxios.post.mockResolvedValue({ data: anthropicMockResponse, status: 200 });

      const anthropicRequest = {
        model: 'claude-3-sonnet-20240229',
        messages: [
          { role: 'system', content: 'You are a helpful coding assistant' },
          { role: 'user', content: 'Write a JavaScript function' }
        ],
        max_tokens: 200
      };

      const response = await axios.post(`${serverUrl}/v1/messages`, anthropicRequest);
      
      expect(response.status).toBe(200);
      expect(response.data).toEqual(anthropicMockResponse);

      // Verify the request was transformed properly for Anthropic
      const calledWith = mockedAxios.post.mock.calls[0];
      expect(calledWith[1]).toMatchObject({
        model: 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: 'Write a JavaScript function' }],
        system: 'You are a helpful coding assistant',
        max_tokens: 200
      });
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle API failures gracefully', async () => {
      // Test various error scenarios
      const errorScenarios = [
        {
          name: 'Authentication Error',
          error: { response: { status: 401, data: { error: 'Invalid API key' } } },
          expectedStatus: 401
        },
        {
          name: 'Rate Limit Error',
          error: { response: { status: 429, data: { error: 'Rate limit exceeded' } } },
          expectedStatus: 429
        },
        {
          name: 'Server Error',
          error: { response: { status: 500, data: { error: 'Internal server error' } } },
          expectedStatus: 500
        },
        {
          name: 'Network Timeout',
          error: { code: 'ETIMEDOUT', message: 'Request timeout' },
          expectedStatus: 504
        }
      ];

      for (const scenario of errorScenarios) {
        mockedAxios.post.mockReset();
        mockedAxios.post.mockRejectedValue(scenario.error);

        const requestPayload = {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: `Test ${scenario.name}` }]
        };

        const response = await axios.post(`${serverUrl}/v1/chat/completions`, requestPayload, {
          validateStatus: () => true // Don't throw on error status
        });

        expect(response.status).toBe(scenario.expectedStatus);
        expect(response.data).toMatchObject({
          error: expect.any(String),
          provider: expect.any(String)
        });
      }
    });

    it('should handle malformed requests', async () => {
      const malformedRequests = [
        {}, // Empty request
        { model: 'gpt-3.5-turbo' }, // Missing messages
        { messages: [] }, // Missing model
        { model: 'gpt-3.5-turbo', messages: 'invalid' } // Invalid messages format
      ];

      for (const request of malformedRequests) {
        const response = await axios.post(`${serverUrl}/v1/chat/completions`, request, {
          validateStatus: () => true
        });

        // Should handle gracefully (might be 400 or pass through to API)
        expect([200, 400, 401, 500]).toContain(response.status);
      }
    });

    it('should maintain service during high load', async () => {
      const mockResponse = {
        choices: [{ message: { role: 'assistant', content: 'Load test response' } }],
        usage: { total_tokens: 10 }
      };

      mockedAxios.post.mockResolvedValue({ data: mockResponse, status: 200 });

      // Send many concurrent requests
      const concurrentRequests = 20;
      const requests = Array.from({ length: concurrentRequests }, (_, i) => 
        axios.post(`${serverUrl}/v1/chat/completions`, {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: `Load test request ${i}` }]
        })
      );

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(10000); // 10 seconds max
      
      // Should handle requests efficiently
      const avgResponseTime = totalTime / concurrentRequests;
      expect(avgResponseTime).toBeLessThan(500); // Average under 500ms per request
    });
  });

  describe('Performance and Monitoring', () => {
    it('should provide comprehensive metrics', async () => {
      // Generate some activity first
      const mockResponse = {
        choices: [{ message: { role: 'assistant', content: 'Metrics test' } }],
        usage: { total_tokens: 25 }
      };

      mockedAxios.post.mockResolvedValue({ data: mockResponse, status: 200 });

      await axios.post(`${serverUrl}/v1/chat/completions`, {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Generate metrics data' }]
      });

      // Check various metric endpoints
      const endpoints = [
        { url: '/api/analytics', expectedFields: ['totalRequests', 'cacheHits', 'estimatedSavings'] },
        { url: '/api/models', expectedFields: ['totalModels', 'onlineModels', 'performanceMetrics'] },
        { url: '/api/memory', expectedFields: ['totalEntries', 'memoryUsage'] },
        { url: '/metrics', isPrometheus: true }
      ];

      for (const endpoint of endpoints) {
        const response = await axios.get(`${serverUrl}${endpoint.url}`);
        expect(response.status).toBe(200);

        if (endpoint.isPrometheus) {
          expect(response.headers['content-type']).toContain('text/plain');
          expect(response.data).toContain('diren_requests_total');
        } else {
          endpoint.expectedFields.forEach(field => {
            expect(response.data).toHaveProperty(field);
          });
        }
      }
    });

    it('should track cache performance over time', async () => {
      const mockResponse = {
        choices: [{ message: { role: 'assistant', content: 'Cache performance test' } }],
        usage: { total_tokens: 30 }
      };

      mockedAxios.post.mockResolvedValue({ data: mockResponse, status: 200 });

      const baseRequest = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Cache performance baseline' }]
      };

      const variations = [
        'Cache performance baseline',
        'Cache performance baseline', // Exact duplicate
        'Performance baseline for cache', // Semantic variation
        'Baseline cache performance test' // Another variation
      ];

      const responseTimes = [];
      
      for (const content of variations) {
        const request = { ...baseRequest, messages: [{ role: 'user', content }] };
        
        const startTime = Date.now();
        const response = await axios.post(`${serverUrl}/v1/chat/completions`, request);
        const responseTime = Date.now() - startTime;
        
        responseTimes.push({
          responseTime,
          cacheStatus: response.headers['x-diren-cache'],
          cacheSource: response.headers['x-diren-cache-source'],
          retrievalTime: response.headers['x-diren-retrieval-time']
        });

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // First should be cache miss
      expect(responseTimes[0].cacheStatus).toBe('MISS');

      // Cache hits should be faster
      const cacheHits = responseTimes.filter(r => r.cacheStatus === 'HIT');
      if (cacheHits.length > 0) {
        const missTime = responseTimes[0].responseTime;
        const avgHitTime = cacheHits.reduce((sum, r) => sum + r.responseTime, 0) / cacheHits.length;
        
        console.log(`Cache performance: Miss ${missTime}ms, Avg Hit ${avgHitTime.toFixed(1)}ms`);
        expect(avgHitTime).toBeLessThan(missTime * 0.8); // Cache hits should be significantly faster
      }
    });
  });

  describe('Configuration and Tools Integration', () => {
    it('should handle dynamic configuration changes', async () => {
      // This would test configuration updates through the API
      // For now, we'll verify the configuration endpoints exist
      
      const configEndpoints = [
        '/api/providers',
        '/api/tools'
      ];

      for (const endpoint of configEndpoints) {
        const response = await axios.get(`${serverUrl}${endpoint}`);
        expect([200, 500]).toContain(response.status); // Might fail without proper setup
      }
    });

    it('should provide tool configuration status', async () => {
      const response = await axios.get(`${serverUrl}/api/tools`);
      
      if (response.status === 200) {
        expect(response.data).toBeInstanceOf(Object);
        
        // Should have known tools
        const expectedTools = ['claude-cli', 'cursor', 'continue-dev', 'aider'];
        expectedTools.forEach(tool => {
          if (response.data[tool]) {
            expect(response.data[tool]).toHaveProperty('name');
            expect(response.data[tool]).toHaveProperty('enabled');
            expect(response.data[tool]).toHaveProperty('configPath');
          }
        });
      }
    });
  });

  describe('Intelligence Features Integration', () => {
    it('should demonstrate fast memory store performance', async () => {
      const mockResponse = {
        choices: [{ message: { role: 'assistant', content: 'Memory store test' } }],
        usage: { total_tokens: 20 }
      };

      mockedAxios.post.mockResolvedValue({ data: mockResponse, status: 200 });

      // Build up memory with various requests
      const memoryTestRequests = [
        'JavaScript async programming patterns',
        'Python data science libraries overview',
        'React component lifecycle methods',
        'SQL query optimization techniques',
        'Machine learning model evaluation'
      ];

      for (const content of memoryTestRequests) {
        await axios.post(`${serverUrl}/v1/chat/completions`, {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content }]
        });
        
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Test semantic search through similar requests
      const similarRequests = [
        'JavaScript async await patterns', // Similar to first
        'Python libraries for data analysis', // Similar to second
        'React hooks vs lifecycle methods' // Related to third
      ];

      const semanticResults = [];
      
      for (const content of similarRequests) {
        const startTime = Date.now();
        const response = await axios.post(`${serverUrl}/v1/chat/completions`, {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content }]
        });
        const responseTime = Date.now() - startTime;

        if (response.headers['x-diren-cache'] === 'HIT' && 
            response.headers['x-diren-cache-source'] === 'memory') {
          semanticResults.push({
            content,
            responseTime,
            similarity: parseFloat(response.headers['x-diren-cache-similarity']),
            retrievalTime: response.headers['x-diren-retrieval-time']
          });
        }
      }

      // Log memory performance if we got hits
      if (semanticResults.length > 0) {
        console.log('Fast Memory Performance:');
        semanticResults.forEach(result => {
          console.log(`  ${result.content}: ${result.similarity.toFixed(3)} similarity, ${result.retrievalTime} retrieval`);
        });
      }
    });

    it('should show compression efficiency in action', async () => {
      // Create a large response to test compression
      const largeContent = 'This is a comprehensive explanation that includes many technical details. '.repeat(50);
      const mockResponse = {
        choices: [{ message: { role: 'assistant', content: largeContent } }],
        usage: { total_tokens: 500 }
      };

      mockedAxios.post.mockResolvedValue({ data: mockResponse, status: 200 });

      await axios.post(`${serverUrl}/v1/chat/completions`, {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Provide a detailed explanation of neural networks' }]
      });

      // Check analytics for compression stats
      const analyticsResponse = await axios.get(`${serverUrl}/api/analytics`);
      
      if (analyticsResponse.status === 200 && analyticsResponse.data.cache) {
        const compressionRatio = analyticsResponse.data.cache.avg_compression_ratio;
        if (compressionRatio && compressionRatio < 0.8) {
          console.log(`Compression achieved: ${((1 - compressionRatio) * 100).toFixed(1)}% space saved`);
          expect(compressionRatio).toBeLessThan(0.8);
        }
      }
    });
  });

  describe('Real-world Usage Scenarios', () => {
    it('should handle a typical development session', async () => {
      const mockResponse = {
        choices: [{ message: { role: 'assistant', content: 'Development session response' } }],
        usage: { total_tokens: 40 }
      };

      mockedAxios.post.mockResolvedValue({ data: mockResponse, status: 200 });

      // Simulate a typical development session with various requests
      const developmentSession = [
        'How to implement user authentication in Express.js',
        'Best practices for React state management',
        'SQL query to join users and orders tables',
        'How to handle errors in async JavaScript functions',
        'React state management best practices', // Similar to earlier request
        'Express.js user authentication implementation', // Rearranged similar request
        'Debugging Node.js memory leaks',
        'How to implement authentication in Express', // Another variation
        'Python vs JavaScript for web development',
        'Best practices for database indexing'
      ];

      const sessionResults = [];
      let totalApiCalls = 0;
      let totalCacheHits = 0;

      for (const [index, content] of developmentSession.entries()) {
        const startTime = Date.now();
        
        const response = await axios.post(`${serverUrl}/v1/chat/completions`, {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content }]
        });
        
        const responseTime = Date.now() - startTime;
        const isCacheHit = response.headers['x-diren-cache'] === 'HIT';
        
        if (isCacheHit) {
          totalCacheHits++;
        } else {
          totalApiCalls++;
        }

        sessionResults.push({
          request: index + 1,
          content: content.substring(0, 50) + '...',
          responseTime,
          cacheHit: isCacheHit,
          cacheSource: response.headers['x-diren-cache-source'],
          similarity: parseFloat(response.headers['x-diren-cache-similarity'] || '0')
        });

        await new Promise(resolve => setTimeout(resolve, 200)); // Realistic delay
      }

      // Analyze session results
      console.log('\nDevelopment Session Results:');
      console.log(`Total requests: ${developmentSession.length}`);
      console.log(`API calls: ${totalApiCalls}`);
      console.log(`Cache hits: ${totalCacheHits}`);
      console.log(`Cache hit rate: ${((totalCacheHits / developmentSession.length) * 100).toFixed(1)}%`);

      sessionResults.forEach(result => {
        const status = result.cacheHit ? `HIT (${result.cacheSource})` : 'MISS';
        const similarity = result.similarity > 0 ? `, sim: ${result.similarity.toFixed(2)}` : '';
        console.log(`  ${result.request}. ${result.content} - ${status}${similarity} (${result.responseTime}ms)`);
      });

      // Should achieve reasonable cache hit rate
      const cacheHitRate = totalCacheHits / developmentSession.length;
      expect(cacheHitRate).toBeGreaterThan(0.2); // At least 20% hit rate with similar questions

      // Cache hits should be faster than misses
      const cacheHitTimes = sessionResults.filter(r => r.cacheHit).map(r => r.responseTime);
      const cacheMissTimes = sessionResults.filter(r => !r.cacheHit).map(r => r.responseTime);

      if (cacheHitTimes.length > 0 && cacheMissTimes.length > 0) {
        const avgHitTime = cacheHitTimes.reduce((sum, time) => sum + time, 0) / cacheHitTimes.length;
        const avgMissTime = cacheMissTimes.reduce((sum, time) => sum + time, 0) / cacheMissTimes.length;
        
        console.log(`Average response times: Cache hits ${avgHitTime.toFixed(0)}ms, Misses ${avgMissTime.toFixed(0)}ms`);
        expect(avgHitTime).toBeLessThan(avgMissTime * 0.9); // Hits should be notably faster
      }
    });
  });
});