#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import { CacheManager } from './cache/CacheManager';
import { ProxyHandler } from './proxy/ProxyHandler';
import { ConfigManager } from './config/ConfigManager';
import { Analytics } from './analytics/Analytics';
import { DashboardServer } from './dashboard/DashboardServer';
import { RateLimiter } from './middleware/RateLimiter';
import { Logger, LogLevel } from './utils/Logger';
import { ModelPool } from './intelligence/ModelPool';
import { FastMemoryStore } from './intelligence/FastMemoryStore';

export class DirenServer {
  private app: express.Application;
  private cacheManager: CacheManager;
  private proxyHandler: ProxyHandler;
  private configManager: ConfigManager;
  private analytics: Analytics;
  private dashboardServer: DashboardServer;
  private rateLimiter: RateLimiter;
  private logger: Logger;
  private modelPool: ModelPool;
  private fastMemory: FastMemoryStore;
  private port: number;

  constructor(port: number = 3000) {
    this.port = port;
    this.logger = Logger.getInstance();
    
    // Set log level based on environment
    const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info');
    this.logger.setLogLevel(logLevel === 'debug' ? LogLevel.DEBUG : LogLevel.INFO);
    
    this.app = express();
    this.configManager = new ConfigManager();
    this.cacheManager = new CacheManager();
    this.analytics = new Analytics();
    this.modelPool = ModelPool.getInstance();
    this.fastMemory = FastMemoryStore.getInstance();
    this.proxyHandler = new ProxyHandler(this.cacheManager, this.configManager, this.analytics);
    this.dashboardServer = new DashboardServer(this.configManager, this.analytics, this.cacheManager);
    this.rateLimiter = new RateLimiter(1000, 60 * 1000); // 1000 requests per minute
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupIntelligenceEventListeners();
  }

  private setupMiddleware() {
    // Trust proxy for rate limiting
    this.app.set('trust proxy', 1);
    
    // Basic middleware
    this.app.use(cors({
      origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
      credentials: true
    }));
    
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    
    // Rate limiting
    this.app.use('/v1/', this.rateLimiter.middleware());
    
    // Request logging middleware
    this.app.use((req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        const statusColor = res.statusCode >= 400 ? 'error' : res.statusCode >= 300 ? 'warn' : 'info';
        
        if (statusColor === 'error') {
          this.logger.error(`${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
        } else {
          this.logger.debug(`${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
        }
      });
      
      next();
    });
  }

  private setupRoutes() {
    // Health check with detailed info
    this.app.get('/health', async (req, res) => {
      try {
        const cacheStats = await this.cacheManager.getStats();
        const analyticsStats = this.analytics.getStats();
        
        res.json({ 
          status: 'ok', 
          timestamp: new Date().toISOString(),
          version: '1.0.0',
          uptime: process.uptime(),
          cache: {
            totalEntries: cacheStats.total_entries || 0,
            compressionRatio: cacheStats.avg_compression_ratio || 0
          },
          analytics: {
            totalRequests: analyticsStats.totalRequests || 0,
            cacheHitRate: analyticsStats.cacheHitRate || 0,
            estimatedSavings: analyticsStats.estimatedSavings || 0
          }
        });
      } catch (error) {
        this.logger.error('Health check failed', error);
        res.status(503).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: 'Service unhealthy'
        });
      }
    });

    // Dashboard routes
    this.app.use('/', this.dashboardServer.getApp());

    // Legacy analytics endpoint (for backward compatibility)
    this.app.get('/analytics', (req, res) => {
      res.json(this.analytics.getStats());
    });

    // Smart routing endpoint
    this.app.post('/v1/smart/*', (req, res, next) => {
      req.headers['x-diren-smart-routing'] = 'true';
      next();
    }, this.proxyHandler.handleUniversal.bind(this.proxyHandler));

    // Model pool stats endpoint
    this.app.get('/api/models', (req, res) => {
      try {
        const stats = this.modelPool.getModelStats();
        res.json(stats);
      } catch (error) {
        this.logger.error('Model stats endpoint failed', error);
        res.status(500).json({ error: 'Failed to get model statistics' });
      }
    });

    // Fast memory stats endpoint
    this.app.get('/api/memory', (req, res) => {
      try {
        const stats = this.fastMemory.getStats();
        res.json(stats);
      } catch (error) {
        this.logger.error('Memory stats endpoint failed', error);
        res.status(500).json({ error: 'Failed to get memory statistics' });
      }
    });

    // Universal proxy endpoint (auto-detects provider)
    this.app.all('/v1/*', this.proxyHandler.handleUniversal.bind(this.proxyHandler));
    
    // Provider-specific endpoints for better routing
    this.app.post('/v1/chat/completions', this.proxyHandler.handleOpenAI.bind(this.proxyHandler));
    this.app.post('/v1/messages', this.proxyHandler.handleAnthropic.bind(this.proxyHandler));
    this.app.post('/v1/models/:model/generateContent', this.proxyHandler.handleGoogle.bind(this.proxyHandler));
    
    // Additional provider endpoints
    this.app.post('/groq/v1/chat/completions', this.proxyHandler.handleGroq.bind(this.proxyHandler));
    this.app.post('/cursor/v1/chat/completions', this.proxyHandler.handleCursor.bind(this.proxyHandler));
    this.app.post('/ollama/v1/chat/completions', this.proxyHandler.handleOllama.bind(this.proxyHandler));
    this.app.post('/perplexity/chat/completions', this.proxyHandler.handlePerplexity.bind(this.proxyHandler));
    this.app.post('/deepseek/v1/chat/completions', this.proxyHandler.handleDeepSeek.bind(this.proxyHandler));
    this.app.post('/openrouter/api/v1/chat/completions', this.proxyHandler.handleOpenRouter.bind(this.proxyHandler));

    // Metrics endpoint for monitoring
    this.app.get('/metrics', async (req, res) => {
      try {
        const stats = this.analytics.getStats();
        const cacheStats = await this.cacheManager.getStats();
        
        // Return Prometheus-style metrics
        const metrics = [
          `# HELP diren_requests_total Total number of requests processed`,
          `# TYPE diren_requests_total counter`,
          `diren_requests_total ${stats.totalRequests || 0}`,
          ``,
          `# HELP diren_cache_hits_total Total number of cache hits`,
          `# TYPE diren_cache_hits_total counter`, 
          `diren_cache_hits_total ${stats.cacheHits || 0}`,
          ``,
          `# HELP diren_cache_hit_rate Cache hit rate percentage`,
          `# TYPE diren_cache_hit_rate gauge`,
          `diren_cache_hit_rate ${stats.cacheHitRate || 0}`,
          ``,
          `# HELP diren_estimated_savings_total Estimated cost savings in USD`,
          `# TYPE diren_estimated_savings_total counter`,
          `diren_estimated_savings_total ${stats.estimatedSavings || 0}`,
          ``,
          `# HELP diren_cache_entries Total number of cache entries`,
          `# TYPE diren_cache_entries gauge`,
          `diren_cache_entries ${cacheStats.total_entries || 0}`
        ].join('\n');
        
        res.set('Content-Type', 'text/plain');
        res.send(metrics);
      } catch (error) {
        this.logger.error('Metrics endpoint failed', error);
        res.status(500).send('# Metrics unavailable');
      }
    });

    // Catch-all for unknown routes
    this.app.all('*', (req, res) => {
      this.logger.warn(`Unknown route accessed: ${req.method} ${req.url}`);
      res.status(404).json({
        error: 'Endpoint not found',
        message: 'Check the Diren dashboard for available endpoints',
        dashboard: `http://localhost:${this.port}/dashboard`,
        docs: 'https://github.com/diren-ai/diren#readme'
      });
    });

    // Global error handler
    this.app.use((error: any, req: any, res: any, next: any) => {
      this.logger.error('Unhandled error in request', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred'
      });
    });
  }

  public async start(): Promise<void> {
    try {
      this.logger.info('Initializing Diren server with advanced AI capabilities...');
      
      await this.cacheManager.initialize();
      this.logger.info('Cache manager initialized');
      
      // Initialize model pool
      await this.modelPool.checkModelAvailability();
      this.logger.info('Model pool initialized and availability checked');
      
      // Cleanup old cache entries on startup
      const cleanupCount = await this.cacheManager.cleanupOldEntries(30);
      if (cleanupCount > 0) {
        this.logger.info(`Cleaned up ${cleanupCount} old cache entries`);
      }
      
      this.app.listen(this.port, () => {
        console.log('🚀 Diren Server Started Successfully!');
        console.log('=====================================');
        console.log(`📡 Proxy Server: http://localhost:${this.port}`);
        console.log(`🧠 Smart Routing: http://localhost:${this.port}/v1/smart/*`);
        console.log(`📊 Web Dashboard: http://localhost:${this.port}/dashboard`);
        console.log(`🏥 Health Check: http://localhost:${this.port}/health`);
        console.log(`📈 Metrics: http://localhost:${this.port}/metrics`);
        console.log(`🤖 Model Stats: http://localhost:${this.port}/api/models`);
        console.log(`🧠 Memory Stats: http://localhost:${this.port}/api/memory`);
        console.log('');
        console.log('🎯 New Intelligence Features:');
        console.log('  • Semantic similarity caching for 90%+ hit rates');
        console.log('  • Fast memory retrieval with sub-ms response times');
        console.log('  • Smart model pooling for cost and quality optimization');
        console.log('  • Real-time performance learning and adaptation');
        console.log('');
        console.log('💡 Usage Tips:');
        console.log('  • Use X-Diren-Smart-Routing: true for automatic model selection');
        console.log('  • Set X-Diren-Quality: high|medium|low for quality preferences');
        console.log('  • Use /v1/smart/* endpoints for intelligent routing');
        console.log('');
        console.log('💰 Ready to save you money on AI API costs!');
        console.log('🎯 Configure providers in the dashboard to get started');
        console.log('');
        console.log('📚 Documentation: https://github.com/diren-ai/diren#readme');
        
        this.logger.info(`Diren server started on port ${this.port} with AI intelligence`);
      });
      
      // Graceful shutdown handling
      process.on('SIGTERM', () => this.shutdown('SIGTERM'));
      process.on('SIGINT', () => this.shutdown('SIGINT'));
      
    } catch (error) {
      this.logger.error('Failed to start Diren server', error);
      process.exit(1);
    }
  }

  private async shutdown(signal: string): Promise<void> {
    this.logger.info(`Received ${signal}, shutting down gracefully...`);
    
    // Perform any cleanup here
    // e.g., close database connections, finish pending operations
    
    process.exit(0);
  }

  private setupIntelligenceEventListeners(): void {
    // Listen to model pool events
    this.modelPool.on('modelRouted', (event) => {
      this.logger.debug('Model routed', {
        selectedModel: `${event.result.selectedModel.provider}:${event.result.selectedModel.model}`,
        confidence: event.result.confidence,
        routingTime: event.routingTimeMs
      });
    });

    this.modelPool.on('performanceUpdated', (event) => {
      this.logger.debug('Model performance updated', {
        provider: event.provider,
        model: event.model,
        successRate: event.profile.performance.successRate,
        avgLatency: event.profile.performance.averageLatency
      });
    });

    // Listen to fast memory events
    this.fastMemory.on('searched', (event) => {
      this.logger.debug('Fast memory search', {
        candidatesScanned: event.candidatesScanned,
        resultsFound: event.resultsFound,
        searchTime: event.searchTime
      });
    });

    this.fastMemory.on('evicted', (event) => {
      this.logger.info(`Fast memory evicted ${event.count} entries, ${event.remainingSize} remaining`);
    });

    this.fastMemory.on('periodicCleanup', (event) => {
      this.logger.info(`Fast memory cleanup removed ${event.removedCount} old entries`);
    });
  }
}

// Start server if run directly
if (require.main === module) {
  const port = parseInt(process.env.DIREN_PORT || process.env.PORT || '3000');
  const server = new DirenServer(port);
  server.start().catch(console.error);
}