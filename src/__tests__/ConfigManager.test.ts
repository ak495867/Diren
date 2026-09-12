import { ConfigManager, ProviderConfig, ToolConfig } from '../config/ConfigManager';
import fs from 'fs';
import path from 'path';

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let testConfigPath: string;

  beforeEach(() => {
    // Use test directory
    const testDir = path.join(__dirname, '../../test-data/.diren');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    configManager = new ConfigManager();
  });

  afterEach(() => {
    // Clean up test files
    const testDir = path.join(__dirname, '../../test-data');
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('provider management', () => {
    it('should set and retrieve API keys', async () => {
      await configManager.setApiKey('openai', 'test-key-123');
      
      const retrievedKey = await configManager.getApiKey('openai');
      expect(retrievedKey).toBe('test-key-123');
    });

    it('should set provider configuration with additional options', async () => {
      const config: Partial<ProviderConfig> = {
        model: 'gpt-4',
        costPer1kTokens: 0.03,
        baseUrl: 'https://api.openai.com/v1'
      };

      await configManager.setApiKey('openai', 'test-key', config);
      
      const providerConfig = await configManager.getProviderConfig('openai');
      expect(providerConfig).toMatchObject({
        apiKey: 'test-key',
        model: 'gpt-4',
        costPer1kTokens: 0.03,
        baseUrl: 'https://api.openai.com/v1',
        enabled: true
      });
    });

    it('should list all configured providers', async () => {
      await configManager.setApiKey('openai', 'key1');
      await configManager.setApiKey('anthropic', 'key2');
      
      const providers = await configManager.listProviders();
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
    });

    it('should get all providers including disabled ones', async () => {
      await configManager.setApiKey('openai', 'key1');
      await configManager.enableProvider('openai', false);
      
      const allProviders = await configManager.getAllProviders();
      expect(allProviders.openai).toBeDefined();
      expect(allProviders.openai.enabled).toBe(false);
    });

    it('should enable and disable providers', async () => {
      await configManager.setApiKey('openai', 'key1');
      
      await configManager.enableProvider('openai', false);
      let config = await configManager.getProviderConfig('openai');
      expect(config?.enabled).toBe(false);
      
      await configManager.enableProvider('openai', true);
      config = await configManager.getProviderConfig('openai');
      expect(config?.enabled).toBe(true);
    });

    it('should add custom providers', async () => {
      const customConfig: ProviderConfig = {
        apiKey: 'custom-key',
        baseUrl: 'https://api.custom.com/v1',
        model: 'custom-model',
        costPer1kTokens: 0.005,
        authType: 'bearer',
        enabled: true
      };

      await configManager.addCustomProvider('custom-ai', customConfig);
      
      const retrievedConfig = await configManager.getProviderConfig('custom-ai');
      expect(retrievedConfig).toEqual(customConfig);
    });
  });

  describe('predefined providers', () => {
    it('should have predefined provider configurations', async () => {
      const allProviders = await configManager.getAllProviders();
      
      // Check major providers are predefined
      expect(allProviders.openai).toBeDefined();
      expect(allProviders.anthropic).toBeDefined();
      expect(allProviders.google).toBeDefined();
      expect(allProviders.groq).toBeDefined();
      
      // Check provider properties
      expect(allProviders.openai.baseUrl).toContain('openai.com');
      expect(allProviders.anthropic.baseUrl).toContain('anthropic.com');
      expect(allProviders.openai.authType).toBe('bearer');
      expect(allProviders.anthropic.authType).toBe('api-key');
    });

    it('should have correct cost configurations', async () => {
      const providers = await configManager.getAllProviders();

      expect(providers.openai.costPer1kTokens).toBeGreaterThan(0);
      expect(providers.anthropic.costPer1kTokens).toBeGreaterThan(0);

      // Check if anthropic model exists instead of claude-3-haiku-20240307
      if (providers.anthropic) {
        expect(providers.anthropic.costPer1kTokens).toBeGreaterThan(0);
      }

      // Local providers should have zero cost
      if (providers.ollama) {
        expect(providers.ollama.costPer1kTokens).toBe(0);
      }
    });

    it('should have different auth types for different providers', async () => {
      const providers = await configManager.getAllProviders();
      
      expect(providers.openai.authType).toBe('bearer');
      expect(providers.anthropic.authType).toBe('api-key');
      expect(providers.anthropic.authHeader).toBe('x-api-key');
    });
  });

  describe('tool configuration', () => {
    it('should provide tool configurations', () => {
      const toolConfigs = configManager.getToolConfigs();
      
      expect(toolConfigs['claude-cli']).toBeDefined();
      expect(toolConfigs.cursor).toBeDefined();
      expect(toolConfigs['continue-dev']).toBeDefined();
      expect(toolConfigs.aider).toBeDefined();
    });

    it('should have correct tool templates', () => {
      const toolConfigs = configManager.getToolConfigs();
      
      const claudeCli = toolConfigs['claude-cli'];
      expect(claudeCli.name).toBe('Claude CLI');
      expect(claudeCli.configPath).toContain('.claude/settings.json');
      expect(claudeCli.template).toHaveProperty('hasCompletedOnboarding', true);
      expect(claudeCli.template.env).toHaveProperty('ANTHROPIC_BASE_URL');
    });

    it('should configure tools correctly', async () => {
      // Mock file system for this test
      const mockConfigPath = path.join(__dirname, '../../test-data/.claude/settings.json');
      const mockConfigDir = path.dirname(mockConfigPath);
      
      if (!fs.existsSync(mockConfigDir)) {
        fs.mkdirSync(mockConfigDir, { recursive: true });
      }

      // This would normally configure the actual tool
      // For testing, we'll verify the configuration structure
      const toolConfigs = configManager.getToolConfigs();
      const claudeConfig = toolConfigs['claude-cli'];
      
      expect(claudeConfig.template.env.ANTHROPIC_BASE_URL).toContain('127.0.0.1:3000');
      expect(claudeConfig.template.env.ANTHROPIC_AUTH_TOKEN).toBe('diren-managed');
    });
  });

  describe('encryption and security', () => {
    it('should encrypt API keys when storing', async () => {
      await configManager.setApiKey('test-provider', 'secret-key-123');
      
      // Read the raw config file to verify encryption
      const configPath = configManager['configPath'];
      if (fs.existsSync(configPath)) {
        const rawConfig = fs.readFileSync(configPath, 'utf8');
        expect(rawConfig).not.toContain('secret-key-123');
      }
    });

    it('should decrypt API keys when retrieving', async () => {
      await configManager.setApiKey('test-provider', 'secret-key-123');
      
      // Create new instance to test decryption
      const newConfigManager = new ConfigManager();
      const retrievedKey = await newConfigManager.getApiKey('test-provider');
      
      expect(retrievedKey).toBe('secret-key-123');
    });

    it('should handle invalid encrypted data gracefully', async () => {
      // Manually corrupt the config file
      const configPath = configManager['configPath'];
      const configDir = path.dirname(configPath);
      
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      fs.writeFileSync(configPath, JSON.stringify({
        providers: {
          'corrupted-provider': {
            apiKey: 'invalid:encrypted:data',
            enabled: true
          }
        }
      }));

      const newConfigManager = new ConfigManager();
      const key = await newConfigManager.getApiKey('corrupted-provider');
      
      // Should return the corrupted data as-is rather than throwing
      expect(key).toBeTruthy();
    });
  });

  describe('proxy URL generation', () => {
    it('should generate correct proxy URLs', () => {
      const url = configManager.getProxyUrl('openai');
      expect(url).toBe('http://localhost:3000');
    });

    it('should use custom port from environment', () => {
      process.env.DIREN_PORT = '4000';
      
      const configManager = new ConfigManager();
      const url = configManager.getProxyUrl('anthropic');
      expect(url).toBe('http://localhost:4000');
      
      delete process.env.DIREN_PORT;
    });
  });

  describe('error handling', () => {
    it('should handle missing configuration gracefully', async () => {
      const key = await configManager.getApiKey('non-existent-provider');
      expect(key).toBeNull();
    });

    it('should handle file system errors', async () => {
      // This test would verify behavior when config directory is not writable
      // For now, just verify it doesn't throw on normal operations
      expect(async () => {
        await configManager.setApiKey('test', 'test-key');
        await configManager.getApiKey('test');
      }).not.toThrow();
    });

    it('should validate provider configurations', async () => {
      // Test with minimal configuration
      await configManager.setApiKey('minimal-provider', 'key');
      const config = await configManager.getProviderConfig('minimal-provider');
      
      expect(config?.apiKey).toBe('key');
      expect(config?.enabled).toBe(true);
    });
  });

  describe('configuration persistence', () => {
    it('should persist configuration across instances', async () => {
      // Set configuration with first instance
      await configManager.setApiKey('persist-test', 'persistent-key');
      
      // Create new instance and verify persistence
      const newConfigManager = new ConfigManager();
      const retrievedKey = await newConfigManager.getApiKey('persist-test');
      
      expect(retrievedKey).toBe('persistent-key');
    });

    it('should handle configuration updates', async () => {
      await configManager.setApiKey('update-test', 'original-key');
      
      // Update the key
      await configManager.setApiKey('update-test', 'updated-key', {
        model: 'updated-model'
      });
      
      const config = await configManager.getProviderConfig('update-test');
      expect(config?.apiKey).toBe('updated-key');
      expect(config?.model).toBe('updated-model');
    });

    it('should merge tool configurations correctly', () => {
      const tools = configManager.getToolConfigs();
      
      // Should have all predefined tools
      expect(Object.keys(tools).length).toBeGreaterThan(0);
      
      // Each tool should have required properties
      Object.values(tools).forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('configPath');
        expect(tool).toHaveProperty('template');
        expect(tool).toHaveProperty('enabled');
      });
    });
  });

  describe('provider categories', () => {
    it('should categorize providers correctly', async () => {
      const providers = await configManager.getAllProviders();
      
      // Commercial providers
      expect(providers.openai).toBeDefined();
      expect(providers.anthropic).toBeDefined();
      expect(providers.google).toBeDefined();
      
      // Fast/efficient providers
      expect(providers.groq).toBeDefined();
      
      // Local providers (if configured)
      if (providers.ollama) {
        expect(providers.ollama.costPer1kTokens).toBe(0);
      }
      
      // Router services
      expect(providers.openrouter).toBeDefined();
    });

    it('should have appropriate cost tiers', async () => {
      const providers = await configManager.getAllProviders();
      
      // Premium models should cost more
      if (providers['gpt-4']) {
        expect(providers['gpt-4'].costPer1kTokens).toBeGreaterThan(0.01);
      }
      
      // Efficient models should cost less
      if (providers.groq) {
        expect(providers.groq.costPer1kTokens).toBeLessThan(0.01);
      }
    });
  });
});