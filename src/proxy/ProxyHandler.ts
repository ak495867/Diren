import { Request, Response } from 'express';
import axios from 'axios';
import { CacheManager, SmartCacheResult } from '../cache/CacheManager';
import { ConfigManager } from '../config/ConfigManager';
import { Analytics } from '../analytics/Analytics';
import { Logger } from '../utils/Logger';
import { ProviderDetector } from '../utils/ProviderDetector';
import { ModelPool, RoutingRequest } from '../intelligence/ModelPool';

export class ProxyHandler {
  private logger: Logger;
  private modelPool: ModelPool;

  constructor(
    private cacheManager: CacheManager,
    private configManager: ConfigManager,
    private analytics: Analytics
  ) {
    this.logger = Logger.getInstance();
    this.modelPool = ModelPool.getInstance();
  }

  public async handleUniversal(req: Request, res: Response): Promise<void> {
    let provider = req.headers['x-diren-provider'] as string;
    
    if (!provider) {
      provider = ProviderDetector.detectProvider(req.url, req.headers, req.body);
    }

    // Enable smart model routing if requested
    if (req.headers['x-diren-smart-routing'] === 'true') {
      await this.handleSmartRequest(req, res);
    } else {
      await this.handleRequest(req, res, provider);
    }
  }

  private async handleSmartRequest(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Extract request text for analysis
      const requestText = this.extractRequestText(req.body);
      
      // Create routing request
      const routingRequest: RoutingRequest = {
        text: requestText,
        intent: this.extractIntent(requestText),
        complexity: this.calculateComplexity(requestText),
        maxTokens: req.body.max_tokens,
        maxCost: parseFloat(req.headers['x-diren-max-cost'] as string) || undefined,
        maxLatency: parseInt(req.headers['x-diren-max-latency'] as string) || undefined,
        preferredQuality: req.headers['x-diren-quality'] as any || 'medium',
        requiredCapabilities: req.headers['x-diren-capabilities']?.toString().split(',') as any
      };

      // Route to best model
      const routing = await this.modelPool.routeRequest(routingRequest);
      const selectedProvider = routing.selectedModel.provider;
      
      this.logger.info(`Smart routing selected ${selectedProvider}:${routing.selectedModel.model}`, {
        confidence: routing.confidence,
        estimatedCost: routing.estimatedCost,
        reasoning: routing.reasoning
      });

      // Add routing info to response headers
      res.set({
        'X-Diren-Selected-Provider': selectedProvider,
        'X-Diren-Selected-Model': routing.selectedModel.model,
        'X-Diren-Routing-Confidence': routing.confidence.toString(),
        'X-Diren-Estimated-Cost': routing.estimatedCost.toString(),
        'X-Diren-Reasoning': routing.reasoning.join('; ')
      });

      // Handle request with selected provider
      await this.handleRequest(req, res, selectedProvider);
      
      // Update model performance metrics
      const responseTime = Date.now() - startTime;
      this.modelPool.updateModelPerformance(selectedProvider, routing.selectedModel.model, {
        latency: responseTime,
        success: res.statusCode < 400
      });
      
    } catch (error: any) {
      this.logger.error('Smart routing failed, falling back to default', error);
      
      // Fallback to default provider
      const fallbackProvider = ProviderDetector.detectProvider(req.url, req.headers, req.body);
      await this.handleRequest(req, res, fallbackProvider);
    }
  }

  public async handleOpenAI(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, 'openai');
  }

  public async handleAnthropic(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, 'anthropic');
  }

  public async handleGoogle(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, 'google');
  }

  public async handleGroq(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, 'groq');
  }

  public async handleCursor(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, 'cursor');
  }

  public async handleOllama(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, 'ollama');
  }

  public async handlePerplexity(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, 'perplexity');
  }

  public async handleDeepSeek(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, 'deepseek');
  }

  public async handleOpenRouter(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, 'openrouter');
  }

  private async handleRequest(
    req: Request, 
    res: Response, 
    provider: string
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Extract request text for enhanced caching
      const requestText = this.extractRequestText(req.body);
      
      const requestHash = this.cacheManager.generateRequestHash(req.body);
      const contextHash = this.cacheManager.generateContextHash(req.body);
      const semanticHash = this.cacheManager.generateSemanticHash(req.body);
      
      this.logger.debug(`Cache lookup for ${provider}`, { requestHash, contextHash, semanticHash });
      
      // Enhanced cache lookup with semantic scoring
      const cacheResult = await this.cacheManager.findCachedResponse(
        requestHash, 
        contextHash, 
        semanticHash,
        requestText
      );
      
      if (cacheResult) {
        await this.cacheManager.updateUsage(cacheResult.entry.id);
        this.analytics.recordCacheHit(provider, cacheResult.entry.cost);
        
        const response = JSON.parse(cacheResult.entry.response);
        
        this.logger.request(req.method, req.url, provider, true);
        this.logger.debug(`Cache ${cacheResult.source} hit for ${provider}`, { 
          entryId: cacheResult.entry.id, 
          similarity: cacheResult.similarity,
          confidence: cacheResult.confidence,
          retrievalTime: cacheResult.retrievalTimeMs,
          useCount: cacheResult.entry.useCount + 1,
          compressionRatio: cacheResult.entry.compressionRatio
        });
        
        // Add cache info to response headers
        res.set({
          'X-Diren-Cache': 'HIT',
          'X-Diren-Cache-Source': cacheResult.source,
          'X-Diren-Cache-Similarity': cacheResult.similarity.toString(),
          'X-Diren-Cache-Confidence': cacheResult.confidence.toString(),
          'X-Diren-Retrieval-Time': `${cacheResult.retrievalTimeMs}ms`
        });
        
        res.json(response);
        return;
      }

      // Get provider configuration
      const providerConfig = await this.configManager.getProviderConfig(provider);
      if (!providerConfig || !providerConfig.apiKey) {
        res.status(401).json({ 
          error: `No API key configured for ${provider}. Configure it in the dashboard at http://localhost:3000/dashboard`,
          provider: provider,
          configureUrl: `http://localhost:3000/dashboard`
        });
        return;
      }

      if (!providerConfig.enabled) {
        res.status(403).json({ 
          error: `Provider ${provider} is disabled. Enable it in the dashboard.`,
          provider: provider
        });
        return;
      }

      // Build API request
      const apiUrl = this.buildApiUrl(provider, providerConfig, req);
      const headers = this.buildHeaders(provider, providerConfig);
      const requestBody = this.transformRequestBody(provider, req.body);

      this.logger.request(req.method, req.url, provider, false);
      this.logger.debug(`Making API request to ${apiUrl}`, { provider, model: req.body?.model });

      // Make API request with timeout and retry logic
      const apiResponse = await this.makeApiRequest(apiUrl, requestBody, headers);
      const responseData = apiResponse.data;
      
      // Calculate tokens and cost
      const tokens = this.extractTokenCount(responseData, provider);
      const cost = this.calculateCost(tokens, providerConfig);

      // Enhanced cache storage with semantic analysis
      await this.cacheManager.saveResponse(
        provider,
        requestHash,
        contextHash,
        semanticHash,
        req.body,
        responseData,
        tokens,
        cost
      );

      this.analytics.recordApiCall(provider, cost);
      
      // Update model performance if using smart routing
      if (req.headers['x-diren-smart-routing']) {
        this.modelPool.updateModelPerformance(provider, req.body?.model || 'unknown', {
          tokens,
          cost,
          success: true
        });
      }
      
      const responseTime = Date.now() - startTime;
      this.logger.debug(`API request completed`, { 
        provider, 
        tokens, 
        cost: cost.toFixed(6), 
        responseTime: `${responseTime}ms` 
      });
      
      // Add performance info to response headers
      res.set({
        'X-Diren-Cache': 'MISS',
        'X-Diren-Provider': provider,
        'X-Diren-Tokens': tokens.toString(),
        'X-Diren-Cost': cost.toFixed(6),
        'X-Diren-Response-Time': `${responseTime}ms`
      });
      
      res.json(responseData);
      
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      this.logger.error(`Error handling ${provider} request after ${responseTime}ms`, error);
      
      // Update model performance on failure if using smart routing
      if (req.headers['x-diren-smart-routing']) {
        this.modelPool.updateModelPerformance(provider, req.body?.model || 'unknown', {
          success: false
        });
      }
      
      if (error.response) {
        // API error - forward the exact error
        res.status(error.response.status).json({
          ...error.response.data,
          provider: provider,
          diren_proxy: true
        });
      } else if (error.code === 'ECONNREFUSED') {
        res.status(503).json({ 
          error: `Cannot connect to ${provider}. Check if the service is running.`,
          provider: provider,
          baseUrl: (await this.configManager.getProviderConfig(provider))?.baseUrl
        });
      } else if (error.code === 'ETIMEDOUT') {
        res.status(504).json({
          error: `Request to ${provider} timed out. The service may be overloaded.`,
          provider: provider
        });
      } else {
        res.status(500).json({ 
          error: 'Internal server error',
          message: error.message,
          provider: provider
        });
      }
    }
  }

  private buildApiUrl(provider: string, config: any, req: Request): string {
    const baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    
    // Handle different URL patterns
    switch (provider) {
      case 'google':
        const model = req.body.model || config.model || 'gemini-pro';
        return `${baseUrl}/models/${model}:generateContent?key=${config.apiKey}`;
      
      case 'azure-openai':
        const deployment = req.body.model || config.model;
        return `${baseUrl}/${deployment}/chat/completions?api-version=2023-12-01-preview`;
      
      case 'ollama':
      case 'llama-cpp':
        return `${baseUrl}/chat/completions`;
      
      case 'anthropic':
        return `${baseUrl}/messages`;
      
      case 'cursor':
        return `${baseUrl}/chat/completions`;
        
      case 'groq':
        return `${baseUrl}/chat/completions`;
      
      default:
        // Most providers follow OpenAI format
        return `${baseUrl}/chat/completions`;
    }
  }

  private buildHeaders(provider: string, config: any): any {
    const headers: any = {
      'Content-Type': 'application/json',
      'User-Agent': 'Diren/1.0.0',
      'Accept': 'application/json'
    };

    // Add authentication based on provider
    switch (config.authType) {
      case 'bearer':
        headers['Authorization'] = `Bearer ${config.apiKey}`;
        break;
      
      case 'api-key':
        headers[config.authHeader || 'x-api-key'] = config.apiKey;
        break;
      
      case 'custom':
        if (provider === 'anthropic') {
          headers['x-api-key'] = config.apiKey;
          headers['anthropic-version'] = '2023-06-01';
        } else if (provider === 'google') {
          // Google uses API key in URL params
        }
        break;
    }

    // Provider-specific headers
    if (config.headers) {
      Object.assign(headers, config.headers);
    }

    return headers;
  }

  private transformRequestBody(provider: string, body: any): any {
    // Transform request body based on provider requirements
    switch (provider) {
      case 'google':
        return {
          contents: body.messages?.map((msg: any) => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
          })) || [],
          generationConfig: {
            temperature: body.temperature || 0.7,
            maxOutputTokens: body.max_tokens || 1000,
            topP: body.top_p,
            topK: body.top_k
          }
        };
      
      case 'anthropic':
        const messages = body.messages || [];
        const systemMessage = messages.find((m: any) => m.role === 'system');
        const userMessages = messages.filter((m: any) => m.role !== 'system');
        
        return {
          model: body.model || 'claude-3-sonnet-20240229',
          messages: userMessages,
          max_tokens: body.max_tokens || 1000,
          temperature: body.temperature || 0.7,
          top_p: body.top_p,
          ...(systemMessage && { system: systemMessage.content })
        };
      
      default:
        // Most providers follow OpenAI format
        return {
          ...body,
          model: body.model || 'gpt-3.5-turbo'
        };
    }
  }

  private async makeApiRequest(url: string, body: any, headers: any): Promise<any> {
    const config = {
      timeout: 60000, // 60 second timeout
      headers,
      maxRetries: 3,
      retryDelay: 1000
    };

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        return await axios.post(url, body, {
          headers: config.headers,
          timeout: config.timeout,
          validateStatus: (status) => status < 500 || status === 503 // Don't retry on 4xx errors
        });
      } catch (error: any) {
        const isLastAttempt = attempt === config.maxRetries;
        const shouldRetry = error.response?.status >= 500 || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET';
        
        if (isLastAttempt || !shouldRetry) {
          throw error;
        }
        
        this.logger.warn(`API request attempt ${attempt} failed, retrying...`, { 
          error: error.message, 
          status: error.response?.status 
        });
        
        await new Promise(resolve => setTimeout(resolve, config.retryDelay * attempt));
      }
    }
  }

  private calculateCost(tokens: number, config: any): number {
    return (tokens / 1000) * (config.costPer1kTokens || 0.001);
  }

  private extractTokenCount(response: any, provider: string): number {
    try {
      switch (provider) {
        case 'openai':
        case 'groq':
        case 'openrouter':
        case 'cursor':
        case 'deepseek':
        case 'azure-openai':
          return response.usage?.total_tokens || 0;
        
        case 'ollama':
        case 'llama-cpp':
          // Local models - estimate tokens from response length
          const content = response.choices?.[0]?.message?.content || '';
          return Math.ceil(content.length / 4); // Rough estimate: 1 token = 4 characters
        
        case 'anthropic':
          return (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
        
        case 'google':
          return response.usageMetadata?.totalTokenCount || 
                 (response.usageMetadata?.promptTokenCount || 0) + 
                 (response.usageMetadata?.candidatesTokenCount || 0);
        
        case 'perplexity':
          return response.usage?.total_tokens || 0;
        
        default:
          // Try common patterns
          return response.usage?.total_tokens || 
                 response.usage?.totalTokens ||
                 ((response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)) ||
                 0;
      }
    } catch (error) {
      this.logger.warn(`Failed to extract token count for ${provider}`, error);
      return 0;
    }
  }

  private extractRequestText(body: any): string {
    if (body.messages && Array.isArray(body.messages)) {
      return body.messages
        .map((msg: any) => msg.content || '')
        .join(' ');
    }
    
    return body.prompt || body.input || JSON.stringify(body);
  }

  private extractIntent(text: string): string {
    const lowercaseText = text.toLowerCase();
    
    const intents = [
      { pattern: /(?:explain|describe|what is|tell me about)/i, intent: 'explain' },
      { pattern: /(?:how to|how do|tutorial|guide|steps)/i, intent: 'howto' },
      { pattern: /(?:fix|debug|error|problem|issue|broken)/i, intent: 'debug' },
      { pattern: /(?:write|create|generate|make|build|code)/i, intent: 'generate' },
      { pattern: /(?:review|analyze|check|evaluate|assess)/i, intent: 'analyze' },
      { pattern: /(?:translate|convert|transform|change)/i, intent: 'transform' },
      { pattern: /(?:optimize|improve|enhance|better)/i, intent: 'optimize' },
      { pattern: /(?:compare|difference|versus|vs)/i, intent: 'compare' }
    ];

    for (const { pattern, intent } of intents) {
      if (pattern.test(text)) {
        return intent;
      }
    }

    return 'general';
  }

  private calculateComplexity(text: string): number {
    const factors = {
      length: Math.log(text.length + 1) / 10,
      words: text.split(/\s+/).length / 100,
      sentences: (text.match(/[.!?]+/g) || []).length / 10,
      codeBlocks: (text.match(/```[\s\S]*?```/g) || []).length * 0.5,
      technicalTerms: this.countTechnicalTerms(text) / 20,
      specialChars: (text.match(/[{}[\]()]/g) || []).length / text.length
    };
    
    return Math.min(1.0, Object.values(factors).reduce((sum, val) => sum + val, 0));
  }

  private countTechnicalTerms(text: string): number {
    const technicalTerms = [
      'function', 'class', 'method', 'variable', 'array', 'object', 'algorithm',
      'database', 'api', 'framework', 'library', 'deployment', 'authentication',
      'optimization', 'performance', 'scalability', 'architecture', 'infrastructure'
    ];
    
    const lowercaseText = text.toLowerCase();
    return technicalTerms.filter(term => lowercaseText.includes(term)).length;
  }}
