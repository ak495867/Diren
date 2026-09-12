import { EventEmitter } from 'events';
import { ConfigManager, ProviderConfig } from '../config/ConfigManager';
import { Logger } from '../utils/Logger';

export interface ModelCapability {
  type: 'chat' | 'completion' | 'code' | 'analysis' | 'translation';
  quality: 'high' | 'medium' | 'low';
  speed: 'fast' | 'medium' | 'slow';
  costEfficiency: 'high' | 'medium' | 'low';
  contextLength: number;
  languages: string[];
  specialties: string[];
}

export interface ModelProfile {
  provider: string;
  model: string;
  capabilities: ModelCapability[];
  performance: {
    averageLatency: number;
    successRate: number;
    costPer1kTokens: number;
    qualityScore: number;
  };
  availability: {
    isOnline: boolean;
    lastChecked: number;
    errorRate: number;
    rateLimitStatus: 'ok' | 'limited' | 'blocked';
  };
  usage: {
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    lastUsed: number;
  };
}

export interface RoutingRequest {
  text: string;
  intent: string;
  complexity: number;
  maxTokens?: number;
  maxCost?: number;
  maxLatency?: number;
  preferredQuality?: 'high' | 'medium' | 'low';
  requiredCapabilities?: ModelCapability['type'][];
}

export interface RoutingResult {
  selectedModel: ModelProfile;
  alternatives: ModelProfile[];
  reasoning: string[];
  confidence: number;
  estimatedCost: number;
  estimatedLatency: number;
}

export class ModelPool extends EventEmitter {
  private static instance: ModelPool;
  private models: Map<string, ModelProfile> = new Map();
  private configManager: ConfigManager;
  private logger: Logger;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  private constructor() {
    super();
    this.configManager = new ConfigManager();
    this.logger = Logger.getInstance();
    this.initializeModels();
    this.startHealthChecks();
  }

  public static getInstance(): ModelPool {
    if (!ModelPool.instance) {
      ModelPool.instance = new ModelPool();
    }
    return ModelPool.instance;
  }

  private initializeModels(): void {
    // Define model capabilities and characteristics
    const modelDefinitions = [
      // OpenAI Models
      {
        provider: 'openai',
        model: 'gpt-4-turbo-preview',
        capabilities: [
          { type: 'chat', quality: 'high', speed: 'medium', costEfficiency: 'low', contextLength: 128000, languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'], specialties: ['reasoning', 'analysis', 'creative-writing'] },
          { type: 'code', quality: 'high', speed: 'medium', costEfficiency: 'low', contextLength: 128000, languages: ['python', 'javascript', 'typescript', 'java', 'cpp', 'rust', 'go'], specialties: ['debugging', 'optimization', 'architecture'] }
        ],
        costPer1kTokens: 0.03
      },
      {
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        capabilities: [
          { type: 'chat', quality: 'medium', speed: 'fast', costEfficiency: 'high', contextLength: 16385, languages: ['en', 'es', 'fr', 'de'], specialties: ['general-purpose', 'quick-tasks'] },
          { type: 'code', quality: 'medium', speed: 'fast', costEfficiency: 'high', contextLength: 16385, languages: ['python', 'javascript', 'java'], specialties: ['simple-tasks', 'documentation'] }
        ],
        costPer1kTokens: 0.002
      },

      // Anthropic Models
      {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        capabilities: [
          { type: 'analysis', quality: 'high', speed: 'slow', costEfficiency: 'low', contextLength: 200000, languages: ['en'], specialties: ['deep-analysis', 'research', 'complex-reasoning'] },
          { type: 'code', quality: 'high', speed: 'slow', costEfficiency: 'low', contextLength: 200000, languages: ['python', 'javascript', 'typescript'], specialties: ['architecture', 'code-review'] }
        ],
        costPer1kTokens: 0.015
      },
      {
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229',
        capabilities: [
          { type: 'chat', quality: 'high', speed: 'medium', costEfficiency: 'medium', contextLength: 200000, languages: ['en', 'es', 'fr'], specialties: ['balanced-performance', 'versatile'] },
          { type: 'code', quality: 'high', speed: 'medium', costEfficiency: 'medium', contextLength: 200000, languages: ['python', 'javascript', 'typescript', 'rust'], specialties: ['code-generation', 'refactoring'] }
        ],
        costPer1kTokens: 0.003
      },
      {
        provider: 'anthropic',
        model: 'claude-3-haiku-20240307',
        capabilities: [
          { type: 'chat', quality: 'medium', speed: 'fast', costEfficiency: 'high', contextLength: 200000, languages: ['en'], specialties: ['quick-responses', 'simple-tasks'] },
          { type: 'code', quality: 'medium', speed: 'fast', costEfficiency: 'high', contextLength: 200000, languages: ['python', 'javascript'], specialties: ['simple-coding', 'bug-fixes'] }
        ],
        costPer1kTokens: 0.00025
      },

      // Groq Models (Fast inference)
      {
        provider: 'groq',
        model: 'mixtral-8x7b-32768',
        capabilities: [
          { type: 'chat', quality: 'medium', speed: 'fast', costEfficiency: 'high', contextLength: 32768, languages: ['en', 'es', 'fr'], specialties: ['speed', 'real-time'] },
          { type: 'code', quality: 'medium', speed: 'fast', costEfficiency: 'high', contextLength: 32768, languages: ['python', 'javascript'], specialties: ['rapid-prototyping'] }
        ],
        costPer1kTokens: 0.0003
      },

      // Local Models
      {
        provider: 'ollama',
        model: 'llama2:7b',
        capabilities: [
          { type: 'chat', quality: 'low', speed: 'medium', costEfficiency: 'high', contextLength: 4096, languages: ['en'], specialties: ['privacy', 'offline'] },
          { type: 'code', quality: 'low', speed: 'medium', costEfficiency: 'high', contextLength: 4096, languages: ['python', 'javascript'], specialties: ['simple-tasks'] }
        ],
        costPer1kTokens: 0
      },

      // Specialized Models
      {
        provider: 'deepseek',
        model: 'deepseek-coder',
        capabilities: [
          { type: 'code', quality: 'high', speed: 'fast', costEfficiency: 'high', contextLength: 16384, languages: ['python', 'javascript', 'typescript', 'java', 'cpp', 'rust', 'go'], specialties: ['code-generation', 'debugging', 'optimization'] }
        ],
        costPer1kTokens: 0.0001
      },

      {
        provider: 'perplexity',
        model: 'pplx-70b-online',
        capabilities: [
          { type: 'analysis', quality: 'high', speed: 'medium', costEfficiency: 'medium', contextLength: 8192, languages: ['en'], specialties: ['research', 'current-events', 'fact-checking'] }
        ],
        costPer1kTokens: 0.0007
      }
    ];

    // Initialize model profiles
    modelDefinitions.forEach(def => {
      const modelKey = `${def.provider}:${def.model}`;
      const profile: ModelProfile = {
        provider: def.provider,
        model: def.model,
        capabilities: def.capabilities as ModelCapability[],
        performance: {
          averageLatency: this.estimateLatency(def.provider),
          successRate: 0.95,
          costPer1kTokens: def.costPer1kTokens,
          qualityScore: this.calculateQualityScore(def.capabilities as ModelCapability[])
        },
        availability: {
          isOnline: false,
          lastChecked: 0,
          errorRate: 0,
          rateLimitStatus: 'ok'
        },
        usage: {
          totalRequests: 0,
          totalTokens: 0,
          totalCost: 0,
          lastUsed: 0
        }
      };

      this.models.set(modelKey, profile);
    });

    this.logger.info(`Initialized ${this.models.size} models in pool`);
  }

  public async routeRequest(request: RoutingRequest): Promise<RoutingResult> {
    const startTime = Date.now();
    const candidates = this.filterCandidates(request);
    const scored = this.scoreModels(candidates, request);
    
    if (scored.length === 0) {
      throw new Error('No suitable models available for this request');
    }

    const selected = scored[0];
    const alternatives = scored.slice(1, 4); // Top 3 alternatives

    const reasoning = this.generateReasoning(selected, request);
    const confidence = this.calculateConfidence(scored);

    const result: RoutingResult = {
      selectedModel: selected.model,
      alternatives: alternatives.map(s => s.model),
      reasoning,
      confidence,
      estimatedCost: this.estimateCost(selected.model, request),
      estimatedLatency: selected.model.performance.averageLatency
    };

    this.logger.debug('Model routing completed', {
      selectedModel: `${selected.model.provider}:${selected.model.model}`,
      score: selected.score,
      routingTime: Date.now() - startTime
    });

    this.emit('modelRouted', {
      request,
      result,
      routingTimeMs: Date.now() - startTime
    });

    return result;
  }

  public updateModelPerformance(
    provider: string,
    model: string,
    metrics: {
      latency?: number;
      success?: boolean;
      cost?: number;
      tokens?: number;
    }
  ): void {
    const modelKey = `${provider}:${model}`;
    const profile = this.models.get(modelKey);
    
    if (!profile) return;

    // Update performance metrics with exponential moving average
    const alpha = 0.1; // Smoothing factor

    if (metrics.latency !== undefined) {
      profile.performance.averageLatency = 
        profile.performance.averageLatency * (1 - alpha) + metrics.latency * alpha;
    }

    if (metrics.success !== undefined) {
      const currentSuccess = metrics.success ? 1 : 0;
      profile.performance.successRate = 
        profile.performance.successRate * (1 - alpha) + currentSuccess * alpha;
    }

    // Update usage statistics
    profile.usage.totalRequests++;
    profile.usage.lastUsed = Date.now();
    
    if (metrics.cost !== undefined) {
      profile.usage.totalCost += metrics.cost;
    }
    
    if (metrics.tokens !== undefined) {
      profile.usage.totalTokens += metrics.tokens;
      // Update cost per token based on actual usage
      if (profile.usage.totalTokens > 0) {
        profile.performance.costPer1kTokens = 
          (profile.usage.totalCost / profile.usage.totalTokens) * 1000;
      }
    }

    // Update availability
    profile.availability.lastChecked = Date.now();
    
    if (!metrics.success) {
      profile.availability.errorRate = Math.min(1, profile.availability.errorRate + 0.01);
    } else {
      profile.availability.errorRate = Math.max(0, profile.availability.errorRate - 0.005);
    }

    this.emit('performanceUpdated', { provider, model, profile });
  }

  public getModelStats(): any {
    const stats = {
      totalModels: this.models.size,
      onlineModels: 0,
      providerDistribution: {} as { [key: string]: number },
      capabilityDistribution: {} as { [key: string]: number },
      performanceMetrics: {
        averageLatency: 0,
        averageSuccessRate: 0,
        averageCost: 0
      },
      usage: {
        totalRequests: 0,
        totalCost: 0,
        totalTokens: 0
      }
    };

    let totalLatency = 0;
    let totalSuccessRate = 0;
    let totalCost = 0;

    for (const profile of this.models.values()) {
      // Count online models
      if (profile.availability.isOnline) {
        stats.onlineModels++;
      }

      // Provider distribution
      stats.providerDistribution[profile.provider] = 
        (stats.providerDistribution[profile.provider] || 0) + 1;

      // Capability distribution
      profile.capabilities.forEach(cap => {
        stats.capabilityDistribution[cap.type] = 
          (stats.capabilityDistribution[cap.type] || 0) + 1;
      });

      // Aggregate performance metrics
      totalLatency += profile.performance.averageLatency;
      totalSuccessRate += profile.performance.successRate;
      totalCost += profile.performance.costPer1kTokens;

      // Aggregate usage
      stats.usage.totalRequests += profile.usage.totalRequests;
      stats.usage.totalCost += profile.usage.totalCost;
      stats.usage.totalTokens += profile.usage.totalTokens;
    }

    const modelCount = this.models.size;
    stats.performanceMetrics.averageLatency = totalLatency / modelCount;
    stats.performanceMetrics.averageSuccessRate = totalSuccessRate / modelCount;
    stats.performanceMetrics.averageCost = totalCost / modelCount;

    return stats;
  }

  public async checkModelAvailability(): Promise<void> {
    const providers = await this.configManager.getAllProviders();
    
    for (const [modelKey, profile] of this.models.entries()) {
      const providerConfig = providers[profile.provider];
      
      if (!providerConfig || !providerConfig.enabled || !providerConfig.apiKey) {
        profile.availability.isOnline = false;
        continue;
      }

      // In a real implementation, you would ping the actual API
      // For now, we'll simulate based on provider configuration
      profile.availability.isOnline = true;
      profile.availability.lastChecked = Date.now();
    }

    this.emit('availabilityChecked', {
      onlineModels: Array.from(this.models.values()).filter(p => p.availability.isOnline).length,
      totalModels: this.models.size
    });
  }

  private filterCandidates(request: RoutingRequest): ModelProfile[] {
    return Array.from(this.models.values()).filter(profile => {
      // Check availability
      if (!profile.availability.isOnline) return false;

      // Check required capabilities
      if (request.requiredCapabilities) {
        const hasAllCapabilities = request.requiredCapabilities.every(required =>
          profile.capabilities.some(cap => cap.type === required)
        );
        if (!hasAllCapabilities) return false;
      }

      // Check context length
      if (request.maxTokens && 
          !profile.capabilities.some(cap => cap.contextLength >= request.maxTokens!)) {
        return false;
      }

      // Check cost constraints
      if (request.maxCost && profile.performance.costPer1kTokens > request.maxCost) {
        return false;
      }

      // Check latency constraints
      if (request.maxLatency && profile.performance.averageLatency > request.maxLatency) {
        return false;
      }

      return true;
    });
  }

  private scoreModels(
    candidates: ModelProfile[], 
    request: RoutingRequest
  ): Array<{ model: ModelProfile; score: number; breakdown: any }> {
    return candidates.map(model => {
      const breakdown = {
        qualityScore: 0,
        speedScore: 0,
        costScore: 0,
        availabilityScore: 0,
        capabilityScore: 0,
        intentScore: 0
      };

      // Quality scoring based on request preferences
      const qualityWeight = request.preferredQuality === 'high' ? 0.4 : 
                           request.preferredQuality === 'low' ? 0.1 : 0.25;
      breakdown.qualityScore = model.performance.qualityScore * qualityWeight;

      // Speed scoring (inverse of latency)
      const speedWeight = 0.2;
      const normalizedSpeed = Math.max(0, 1 - (model.performance.averageLatency / 10000));
      breakdown.speedScore = normalizedSpeed * speedWeight;

      // Cost efficiency scoring (inverse of cost)
      const costWeight = 0.25;
      const maxCost = request.maxCost || 0.1;
      const costEfficiency = Math.max(0, 1 - (model.performance.costPer1kTokens / maxCost));
      breakdown.costScore = costEfficiency * costWeight;

      // Availability scoring
      const availabilityWeight = 0.1;
      const availabilityScore = model.performance.successRate * 
                               (1 - model.availability.errorRate) *
                               (model.availability.rateLimitStatus === 'ok' ? 1 : 0.5);
      breakdown.availabilityScore = availabilityScore * availabilityWeight;

      // Capability matching
      const capabilityWeight = 0.15;
      let capabilityMatch = 0;
      
      if (request.requiredCapabilities) {
        capabilityMatch = request.requiredCapabilities.filter(required =>
          model.capabilities.some(cap => cap.type === required)
        ).length / request.requiredCapabilities.length;
      } else {
        // Default capability scoring based on intent
        const intentCapabilityMap: { [key: string]: ModelCapability['type'] } = {
          'generate': 'code',
          'debug': 'code',
          'analyze': 'analysis',
          'explain': 'chat',
          'translate': 'translation'
        };
        
        const preferredCapability = intentCapabilityMap[request.intent] || 'chat';
        capabilityMatch = model.capabilities.some(cap => cap.type === preferredCapability) ? 1 : 0.5;
      }
      
      breakdown.capabilityScore = capabilityMatch * capabilityWeight;

      // Intent-specific scoring
      const intentWeight = 0.1;
      let intentScore = 0.5; // Default score
      
      const specialtyBonus = model.capabilities.some(cap => 
        cap.specialties.some(specialty => request.text.toLowerCase().includes(specialty))
      ) ? 0.3 : 0;
      
      breakdown.intentScore = (intentScore + specialtyBonus) * intentWeight;

      const totalScore = Object.values(breakdown).reduce((sum, score) => sum + score, 0);

      return { model, score: totalScore, breakdown };
    }).sort((a, b) => b.score - a.score);
  }

  private generateReasoning(
    selected: { model: ModelProfile; score: number; breakdown: any }, 
    request: RoutingRequest
  ): string[] {
    const reasoning: string[] = [];
    const { model, breakdown } = selected;

    // Primary selection reasons
    if (breakdown.qualityScore > 0.3) {
      reasoning.push(`Selected for high quality (${model.performance.qualityScore.toFixed(2)})`);
    }

    if (breakdown.costScore > 0.15) {
      reasoning.push(`Cost efficient at $${model.performance.costPer1kTokens.toFixed(4)}/1K tokens`);
    }

    if (breakdown.speedScore > 0.15) {
      reasoning.push(`Fast response time (~${model.performance.averageLatency}ms)`);
    }

    if (breakdown.capabilityScore > 0.1) {
      const relevantCaps = model.capabilities
        .filter(cap => !request.requiredCapabilities || request.requiredCapabilities.includes(cap.type))
        .map(cap => cap.type)
        .join(', ');
      reasoning.push(`Matches required capabilities: ${relevantCaps}`);
    }

    // Provider-specific reasons
    if (model.provider === 'ollama') {
      reasoning.push('Local processing for privacy');
    }

    if (model.capabilities.some(cap => cap.contextLength > 100000)) {
      reasoning.push('Large context window support');
    }

    return reasoning.length > 0 ? reasoning : ['Best available option for this request'];
  }

  private calculateConfidence(scored: Array<{ model: ModelProfile; score: number }>): number {
    if (scored.length === 0) return 0;
    if (scored.length === 1) return 0.9;

    const topScore = scored[0].score;
    const secondScore = scored[1]?.score || 0;
    const gap = topScore - secondScore;

    // Higher gap = higher confidence
    return Math.min(0.95, 0.6 + (gap * 2));
  }

  private estimateCost(model: ModelProfile, request: RoutingRequest): number {
    const estimatedTokens = Math.ceil(request.text.length / 4) + (request.maxTokens || 500);
    return (estimatedTokens / 1000) * model.performance.costPer1kTokens;
  }

  private estimateLatency(provider: string): number {
    const latencyMap: { [key: string]: number } = {
      'groq': 500,      // Very fast
      'openai': 2000,   // Fast
      'anthropic': 3000, // Medium
      'google': 2500,   // Medium
      'ollama': 4000,   // Depends on hardware
      'deepseek': 1500, // Fast
      'perplexity': 3500 // Medium-slow
    };

    return latencyMap[provider] || 3000;
  }

  private calculateQualityScore(capabilities: ModelCapability[]): number {
    const avgQuality = capabilities.reduce((sum, cap) => {
      const qualityScore = cap.quality === 'high' ? 0.9 : cap.quality === 'medium' ? 0.6 : 0.3;
      return sum + qualityScore;
    }, 0) / capabilities.length;

    return avgQuality;
  }

  private startHealthChecks(): void {
    // Check model availability every 5 minutes
    this.healthCheckInterval = setInterval(() => {
      this.checkModelAvailability().catch(error => {
        this.logger.error('Health check failed', error);
      });
    }, 5 * 60 * 1000);

    // Initial health check
    this.checkModelAvailability();
  }

  public destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.removeAllListeners();
  }

  public reset(): void {
    // Reset all model profiles to default state
    for (const profile of this.models.values()) {
      profile.availability.isOnline = false;
      profile.availability.lastChecked = 0;
      profile.availability.errorRate = 0;
      profile.availability.rateLimitStatus = 'ok';
      profile.performance.averageLatency = this.estimateLatency(profile.provider);
      profile.performance.successRate = 0.95;
      profile.performance.costPer1kTokens = profile.usage.totalCost > 0 && profile.usage.totalTokens > 0
        ? (profile.usage.totalCost / profile.usage.totalTokens) * 1000
        : 0;
      profile.usage = {
        totalRequests: 0,
        totalTokens: 0,
        totalCost: 0,
        lastUsed: 0
      };
    }
  }
}