import express from 'express';
import path from 'path';
import { ConfigManager } from '../config/ConfigManager';
import { Analytics } from '../analytics/Analytics';
import { CacheManager } from '../cache/CacheManager';

export class DashboardServer {
  private app: express.Application;
  
  constructor(
    private configManager: ConfigManager,
    private analytics: Analytics,
    private cacheManager: CacheManager
  ) {
    this.app = express();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Serve static dashboard files
    this.app.use('/dashboard', express.static(path.join(__dirname, '../../dashboard/dist')));
    
    // API routes
    this.app.get('/api/providers', async (req, res) => {
      try {
        const providers = await this.configManager.getAllProviders();
        res.json(providers);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get providers' });
      }
    });

    this.app.post('/api/providers/:provider/enable', async (req, res) => {
      try {
        const { provider } = req.params;
        const { enabled } = req.body;
        await this.configManager.enableProvider(provider, enabled);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: 'Failed to update provider' });
      }
    });

    this.app.post('/api/providers/:provider/config', async (req, res) => {
      try {
        const { provider } = req.params;
        const { apiKey, ...config } = req.body;
        await this.configManager.setApiKey(provider, apiKey, config);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: 'Failed to update provider config' });
      }
    });

    this.app.post('/api/providers/custom', async (req, res) => {
      try {
        const { name, config } = req.body;
        await this.configManager.addCustomProvider(name, config);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: 'Failed to add custom provider' });
      }
    });

    this.app.get('/api/tools', async (req, res) => {
      try {
        const tools = this.configManager.getToolConfigs();
        res.json(tools);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get tools' });
      }
    });

    this.app.post('/api/tools/:tool/configure', async (req, res) => {
      try {
        const { tool } = req.params;
        const success = await this.configManager.configureTools(tool);
        res.json({ success });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/analytics', async (req, res) => {
      try {
        const stats = this.analytics.getStats();
        const cacheStats = await this.cacheManager.getStats();
        res.json({ ...stats, cache: cacheStats });
      } catch (error) {
        res.status(500).json({ error: 'Failed to get analytics' });
      }
    });

    this.app.post('/api/cache/cleanup', async (req, res) => {
      try {
        const { maxAge = 30 } = req.body;
        const removed = await this.cacheManager.cleanupOldEntries(maxAge);
        res.json({ removed });
      } catch (error) {
        res.status(500).json({ error: 'Failed to cleanup cache' });
      }
    });

    // Redirect root dashboard URL to dashboard page
    this.app.get('/dashboard', (req, res) => {
      res.sendFile(path.join(__dirname, '../../dashboard/dist/index.html'));
    });
  }

  public getApp(): express.Application {
    return this.app;
  }
}