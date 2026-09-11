import { ModelPool, RoutingRequest, ModelProfile } from '../intelligence/ModelPool';
import { ConfigManager } from '../config/ConfigManager';
import { delay } from './setup';

describe('ModelPool', () => {
  let modelPool: ModelPool;
  let configManager: ConfigManager;

  beforeEach(async () => {
    modelPool = ModelPool.getInstance();
    configManager = new ConfigManager();
    
    // Setup test providers
    await configManager.setApiKey('openai', 'test-key', { enabled: true });
    await configManager.setApiKey('anthropic', 'test-key', { enabled: true });
    await configManager.setApiKey('groq', 'test-key', { enabled: true });
    await configManager.setApiKey('deepseek', 'test-key', { enabled: true });
    
    // Initialize model availability
    await modelPool.checkModelAvailability();
  });

  describe('model initialization', () => {
    it('should initialize with predefined models', () => {
      const stats = modelPool.getModelStats();
      
      expect(stats.totalModels).toBeGreaterThan(0);
      expect(stats.providerDistribution).toHaveProperty('openai');
      expect(stats.providerDistribution).toHaveProperty('anthropic');
      expect(stats.providerDistribution).toHaveProperty('groq');
    });

    it('should have correct capability distributions', () => {
      const stats = modelPool.getModelStats();
      
      expect(stats.capabilityDistribution).toHaveProperty('chat');
      expect(stats.capabilityDistribution).toHaveProperty('code');
      expect(stats.capabilityDistribution.chat).toBeGreaterThan(0);
      expect(stats.capabilityDistribution.code).toBeGreaterThan(0);
    });

    it('should set models online based on provider configuration', async () => {
      const stats = modelPool.getModelStats();
      expect(stats.onlineModels).toBeGreaterThan(0);
    });
  });

  describe('request routing', () => {
    it('should route simple chat requests to efficient models', async () => {
      const request: RoutingRequest = {
        text: 'Hello, how are you?',
        intent: 'general',
        complexity: 0.1,
        maxCost: 0.01,
        preferredQuality: 'medium'
      };

      const result = await modelPool.routeRequest(request);
      
      expect(result.selectedModel).toBeDefined();
      expect(result.estimatedCost).toBeLessThanOrEqual(0.01);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.reasoning).toHaveLength.greaterThan(0);
    });

    it('should route code generation requests to specialized models', async () => {
      const request: RoutingRequest = {
        text: 'Write a Python function to implement binary search',
        intent: 'generate',
        complexity: 0.7,
        requiredCapabilities: ['code'],
        preferredQuality: 'high'
      };

      const result = await modelPool.routeRequest(request);
      
      expect(result.selectedModel.capabilities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'code' })
        ])
      );
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should respect cost constraints', async () => {
      const request: RoutingRequest = {
        text: 'Complex analysis task requiring detailed reasoning',
        intent: 'analyze',
        complexity: 0.9,
        maxCost: 0.001, // Very low cost limit
        preferredQuality: 'low'
      };

      const result = await modelPool.routeRequest(request);
      
      expect(result.estimatedCost).toBeLessThanOrEqual(0.001);
      expect(result.selectedModel.performance.costPer1kTokens).toBeLessThanOrEqual(0.001);
    });

    it('should respect latency constraints', async () => {
      const request: RoutingRequest = {
        text: 'Quick question about JavaScript',
        intent: 'explain',
        complexity: 0.3,
        maxLatency: 1000, // 1 second max
        preferredQuality: 'medium'
      };

      const result = await modelPool.routeRequest(request);
      
      expect(result.estimatedLatency).toBeLessThanOrEqual(1000);
      expect(result.selectedModel.performance.averageLatency).toBeLessThanOrEqual(1000);
    });

    it('should provide alternative models', async () => {
      const request: RoutingRequest = {
        text: 'Standard programming question',
        intent: 'generate',
        complexity: 0.5
      };

      const result = await modelPool.routeRequest(request);
      
      expect(result.alternatives).toBeDefined();
      expect(result.alternatives.length).toBeGreaterThanOrEqual(0);
      expect(result.alternatives.length).toBeLessThanOrEqual(3);
    });

    it('should handle requests with multiple capabilities', async () => {
      const request: RoutingRequest = {
        text: 'Analyze this code and suggest improvements',
        intent: 'analyze',
        complexity: 0.8,
        requiredCapabilities: ['code', 'analysis']
      };

      const result = await modelPool.routeRequest(request);
      
      const hasCode = result.selectedModel.capabilities.some(cap => cap.type === 'code');
      const hasAnalysis = result.selectedModel.capabilities.some(cap => cap.type === 'analysis');
      
      expect(hasCode || hasAnalysis).toBe(true); // Should have at least one required capability
    });

    it('should throw error when no suitable models available', async () => {
      // Disable all providers
      await configManager.enableProvider('openai', false);
      await configManager.enableProvider('anthropic', false);
      await configManager.enableProvider('groq', false);
      await configManager.enableProvider('deepseek', false);
      
      await modelPool.checkModelAvailability();

      const request: RoutingRequest = {
        text: 'Any request',
        intent: 'general',
        complexity: 0.5
      };

      await expect(modelPool.routeRequest(request)).rejects.toThrow('No suitable models available');
    });

    it('should provide reasoning for selection', async () => {
      const request: RoutingRequest = {
        text: 'Optimize database performance',
        intent: 'optimize',
        complexity: 0.8,
        preferredQuality: 'high'
      };

      const result = await modelPool.routeRequest(request);
      
      expect(result.reasoning).toHaveLength.greaterThan(0);
      expect(result.reasoning[0]).toMatch(/Selected for|Cost efficient|Fast response|Matches|Local processing|Large context/);
    });
  });

  describe('performance tracking', () => {
    it('should update model performance metrics', () => {
      const provider = 'openai';
      const model = 'gpt-3.5-turbo';
      
      // Get initial metrics
      const initialStats = modelPool.getModelStats();
      
      // Update performance
      modelPool.updateModelPerformance(provider, model, {
        latency: 1500,
        success: true,
        cost: 0.002,
        tokens: 100
      });

      const updatedStats = modelPool.getModelStats();
      
      // Usage should have increased
      expect(updatedStats.usage.totalRequests).toBeGreaterThanOrEqual(initialStats.usage.totalRequests);
    });

    it('should track success rates', () => {
      const provider = 'anthropic';
      const model = 'claude-3-haiku';
      
      // Simulate successful requests
      for (let i = 0; i < 5; i++) {
        modelPool.updateModelPerformance(provider, model, {
          success: true,
          latency: 1000,
          cost: 0.0005,
          tokens: 50
        });
      }

      // Simulate failed request
      modelPool.updateModelPerformance(provider, model, {
        success: false,
        latency: 5000
      });

      // Success rate should be affected but still positive
      const modelKey = `${provider}:${model}`;
      const modelProfile = modelPool['models'].get(modelKey);
      expect(modelProfile?.performance.successRate).toBeGreaterThan(0.7);
      expect(modelProfile?.performance.successRate).toBeLessThan(1.0);
    });

    it('should update average latency with exponential moving average', () => {
      const provider = 'groq';
      const model = 'mixtral-8x7b-32768';
      
      const modelKey = `${provider}:${model}`;
      const initialProfile = modelPool['models'].get(modelKey);
      const initialLatency = initialProfile?.performance.averageLatency || 0;

      // Update with significantly different latency
      modelPool.updateModelPerformance(provider, model, {
        latency: 500, // Much faster than typical
        success: true
      });

      const updatedProfile = modelPool['models'].get(modelKey);
      const updatedLatency = updatedProfile?.performance.averageLatency || 0;

      // Should move towards new value but not jump immediately
      expect(updatedLatency).toBeLessThan(initialLatency);
      expect(Math.abs(updatedLatency - 500)).toBeGreaterThan(100); // Smoothed, not direct jump
    });

    it('should update cost per token based on actual usage', () => {
      const provider = 'deepseek';
      const model = 'deepseek-coder';
      
      // Update with usage data
      modelPool.updateModelPerformance(provider, model, {
        cost: 0.01, // Total cost for request
        tokens: 1000, // Tokens used
        success: true
      });

      const modelKey = `${provider}:${model}`;
      const modelProfile = modelPool['models'].get(modelKey);
      
      // Cost per 1K tokens should be calculated from actual usage
      expect(modelProfile?.performance.costPer1kTokens).toBeCloseTo(0.01, 3);
    });
  });

  describe('model availability', () => {
    it('should check model availability based on provider config', async () => {
      await modelPool.checkModelAvailability();
      const stats = modelPool.getModelStats();
      
      expect(stats.onlineModels).toBeGreaterThan(0);
    });

    it('should mark models offline when providers disabled', async () => {
      // Disable a provider
      await configManager.enableProvider('openai', false);
      await modelPool.checkModelAvailability();
      
      // OpenAI models should be offline
      const openaiModels = Array.from(modelPool['models'].values())
        .filter(model => model.provider === 'openai');
      
      openaiModels.forEach(model => {
        expect(model.availability.isOnline).toBe(false);
      });
    });

    it('should emit availability check events', async () => {
      let eventEmitted = false;
      
      modelPool.on('availabilityChecked', (event) => {
        expect(event.onlineModels).toBeGreaterThanOrEqual(0);
        expect(event.totalModels).toBeGreaterThan(0);
        eventEmitted = true;
      });

      await modelPool.checkModelAvailability();
      expect(eventEmitted).toBe(true);
    });
  });

  describe('statistics and monitoring', () => {
    it('should provide comprehensive statistics', () => {
      const stats = modelPool.getModelStats();
      
      expect(stats).toMatchObject({
        totalModels: expect.any(Number),
        onlineModels: expect.any(Number),
        providerDistribution: expect.any(Object),
        capabilityDistribution: expect.any(Object),
        performanceMetrics: expect.objectContaining({
          averageLatency: expect.any(Number),
          averageSuccessRate: expect.any(Number),
          averageCost: expect.any(Number)
        }),
        usage: expect.objectContaining({
          totalRequests: expect.any(Number),
          totalCost: expect.any(Number),
          totalTokens: expect.any(Number)
        })
      });
    });

    it('should track usage across all models', () => {
      // Simulate usage on multiple models
      modelPool.updateModelPerformance('openai', 'gpt-3.5-turbo', {
        cost: 0.002, tokens: 100, success: true
      });
      
      modelPool.updateModelPerformance('anthropic', 'claude-3-haiku', {
        cost: 0.001, tokens: 200, success: true
      });

      const stats = modelPool.getModelStats();
      
      expect(stats.usage.totalRequests).toBeGreaterThan(0);
      expect(stats.usage.totalCost).toBeGreaterThan(0);
      expect(stats.usage.totalTokens).toBeGreaterThan(0);
    });

    it('should calculate performance averages correctly', () => {
      const stats = modelPool.getModelStats();
      
      expect(stats.performanceMetrics.averageLatency).toBeGreaterThan(0);
      expect(stats.performanceMetrics.averageSuccessRate).toBeGreaterThan(0);
      expect(stats.performanceMetrics.averageSuccessRate).toBeLessThanOrEqual(1);
      expect(stats.performanceMetrics.averageCost).toBeGreaterThanOrEqual(0);
    });
  });

  describe('event handling', () => {
    it('should emit model routed events', async () => {
      let eventEmitted = false;
      
      modelPool.on('modelRouted', (event) => {
        expect(event.request).toBeDefined();
        expect(event.result).toBeDefined();
        expect(event.routingTimeMs).toBeGreaterThan(0);
        eventEmitted = true;
      });

      const request: RoutingRequest = {
        text: 'Test routing event',
        intent: 'general',
        complexity: 0.5
      };

      await modelPool.routeRequest(request);
      expect(eventEmitted).toBe(true);
    });

    it('should emit performance update events', () => {
      let eventEmitted = false;
      
      modelPool.on('performanceUpdated', (event) => {
        expect(event.provider).toBe('openai');
        expect(event.model).toBe('gpt-3.5-turbo');
        expect(event.profile).toBeDefined();
        eventEmitted = true;
      });

      modelPool.updateModelPerformance('openai', 'gpt-3.5-turbo', {
        latency: 1000,
        success: true
      });

      expect(eventEmitted).toBe(true);
    });
  });

  describe('scoring and selection', () => {
    it('should score models based on request requirements', async () => {
      // Test high-quality requirement
      const highQualityRequest: RoutingRequest = {
        text: 'Complex analytical task requiring deep reasoning',
        intent: 'analyze',
        complexity: 0.9,
        preferredQuality: 'high'
      };

      const result = await modelPool.routeRequest(highQualityRequest);
      
      // Should select a high-quality model
      const hasHighQuality = result.selectedModel.capabilities.some(
        cap => cap.quality === 'high'
      );
      expect(hasHighQuality).toBe(true);
    });

    it('should balance cost and quality appropriately', async () => {
      // Test balanced requirements
      const balancedRequest: RoutingRequest = {
        text: 'Medium complexity programming task',
        intent: 'generate',
        complexity: 0.6,
        maxCost: 0.005,
        preferredQuality: 'medium'
      };

      const result = await modelPool.routeRequest(balancedRequest);
      
      expect(result.estimatedCost).toBeLessThanOrEqual(0.005);
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('error handling', () => {
    it('should handle invalid provider gracefully', () => {
      expect(() => {
        modelPool.updateModelPerformance('invalid-provider', 'invalid-model', {
          success: true
        });
      }).not.toThrow();
    });

    it('should handle routing with impossible constraints', async () => {
      const impossibleRequest: RoutingRequest = {
        text: 'Any task',
        intent: 'general',
        complexity: 0.5,
        maxCost: 0.0000001, // Impossibly low cost
        maxLatency: 1, // Impossibly low latency
        preferredQuality: 'high'
      };

      await expect(modelPool.routeRequest(impossibleRequest))
        .rejects.toThrow('No suitable models available');
    });
  });
});