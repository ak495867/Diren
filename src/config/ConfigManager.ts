import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  costPer1kTokens?: number;
  headers?: { [key: string]: string };
  authType?: 'bearer' | 'api-key' | 'custom';
  authHeader?: string;
  enabled?: boolean;
}

export interface ToolConfig {
  name: string;
  configPath: string;
  template: any;
  enabled: boolean;
}

export class ConfigManager {
  private configPath: string;
  private config: { [provider: string]: ProviderConfig } = {};
  private toolConfigs: { [tool: string]: ToolConfig } = {};

  constructor() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const direnDir = path.join(homeDir, '.diren');

    if (!fs.existsSync(direnDir)) {
      fs.mkdirSync(direnDir, { recursive: true });
    }

    this.configPath = path.join(direnDir, 'config.json');
    this.loadConfig();
    this.initializeProviders();
    this.initializeToolConfigs();
  }

  private initializeProviders(): void {
    const providers = {
      // Major Commercial Providers
      openai: {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-3.5-turbo',
        costPer1kTokens: 0.002,
        authType: 'bearer' as const,
        authHeader: 'Authorization'
      },
      anthropic: {
        baseUrl: 'https://api.anthropic.com/v1',
        model: 'claude-3-sonnet-20240229',
        costPer1kTokens: 0.003,
        authType: 'api-key' as const,
        authHeader: 'x-api-key'
      },
      google: {
        baseUrl: 'https://generativelanguage.googleapis.com/v1',
        model: 'gemini-pro',
        costPer1kTokens: 0.001,
        authType: 'custom' as const
      },
      groq: {
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'mixtral-8x7b-32768',
        costPer1kTokens: 0.0003,
        authType: 'bearer' as const
      },

      // AI Coding Tools
      cursor: {
        baseUrl: 'https://api2.cursor.so/v1',
        model: 'gpt-4',
        costPer1kTokens: 0.03,
        authType: 'bearer' as const
      },

      // Open Source / Local
      ollama: {
        baseUrl: 'http://localhost:11434/v1',
        model: 'llama2',
        costPer1kTokens: 0,
        authType: 'bearer' as const
      },
      'llama-cpp': {
        baseUrl: 'http://localhost:8080/v1',
        model: 'llama-2-7b-chat',
        costPer1kTokens: 0,
        authType: 'bearer' as const
      },

      // Router Services
      openrouter: {
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'meta-llama/llama-2-7b-chat',
        costPer1kTokens: 0.0002,
        authType: 'bearer' as const
      },
      tokenrouter: {
        baseUrl: 'https://api.tokenrouter.ai/v1',
        model: 'gpt-3.5-turbo',
        costPer1kTokens: 0.0015,
        authType: 'bearer' as const
      },

      // Other Commercial Providers
      perplexity: {
        baseUrl: 'https://api.perplexity.ai',
        model: 'pplx-7b-chat',
        costPer1kTokens: 0.0007,
        authType: 'bearer' as const
      },
      deepseek: {
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        costPer1kTokens: 0.0001,
        authType: 'bearer' as const
      },
      'azure-openai': {
        baseUrl: 'https://your-resource.openai.azure.com/openai/deployments',
        model: 'gpt-35-turbo',
        costPer1kTokens: 0.002,
        authType: 'api-key' as const,
        authHeader: 'api-key'
      },
      'alibaba-dashscope': {
        baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
        model: 'qwen-turbo',
        costPer1kTokens: 0.0003,
        authType: 'bearer' as const
      },
      'grok-x': {
        baseUrl: 'https://api.x.ai/v1',
        model: 'grok-beta',
        costPer1kTokens: 0.005,
        authType: 'bearer' as const
      },
      'glm-coder': {
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        model: 'glm-4',
        costPer1kTokens: 0.001,
        authType: 'bearer' as const
      },
      kilocode: {
        baseUrl: 'https://api.kilocode.ai/v1',
        model: 'kilocode-7b',
        costPer1kTokens: 0.0002,
        authType: 'bearer' as const
      },
      opencode: {
        baseUrl: 'https://api.opencode.dev/v1',
        model: 'opencode-34b',
        costPer1kTokens: 0.0005,
        authType: 'bearer' as const
      }
    };

    // Only set defaults for providers that don't exist
    Object.entries(providers).forEach(([name, config]) => {
      if (!this.config[name]) {
        this.config[name] = {
          apiKey: '',
          enabled: false,
          ...config
        };
      }
    });
  }

  private initializeToolConfigs(): void {
    this.toolConfigs = {
      'claude-cli': {
        name: 'Claude CLI',
        configPath: '~/.claude/settings.json',
        enabled: false,
        template: {
          hasCompletedOnboarding: true,
          env: {
            ANTHROPIC_BASE_URL: "http://127.0.0.1:3000/v1",
            ANTHROPIC_AUTH_TOKEN: "diren-managed",
            ANTHROPIC_DEFAULT_FABLE_MODEL: "claude-3-haiku-20240307",
            ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-3-opus-20240229",
            ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-3-sonnet-20240229",
            ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-3-haiku-20240307",
            CLAUDE_CODE_MAX_CONTEXT_TOKENS: "998000"
          }
        }
      },
      cursor: {
        name: 'Cursor IDE',
        configPath: '~/.cursor/User/settings.json',
        enabled: false,
        template: {
          "cursor.general.apiUrl": "http://localhost:3000/v1",
          "cursor.general.disableTelemetry": true
        }
      },
      'continue-dev': {
        name: 'Continue VS Code Extension',
        configPath: '~/.continue/config.json',
        enabled: false,
        template: {
          models: [{
            title: "Diren Proxy",
            provider: "openai",
            model: "gpt-3.5-turbo",
            apiBase: "http://localhost:3000/v1",
            apiKey: "diren-managed"
          }]
        }
      },
      aider: {
        name: 'Aider AI Coding Assistant',
        configPath: '~/.aider/config.yml',
        enabled: false,
        template: {
          openai_api_base: "http://localhost:3000/v1",
          openai_api_key: "diren-managed"
        }
      }
    };
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const parsed = JSON.parse(configData);

        // Decrypt API keys
        if (parsed.providers) {
          this.config = parsed.providers;
          Object.keys(this.config).forEach(provider => {
            if (this.config[provider].apiKey) {
              this.config[provider].apiKey = this.decrypt(this.config[provider].apiKey);
            }
          });
        }

        if (parsed.tools) {
          this.toolConfigs = { ...this.toolConfigs, ...parsed.tools };
        }
      }
    } catch (error) {
      console.warn('Failed to load config, starting with defaults:', error);
    }
  }

  private saveConfig(): void {
    try {
      // Encrypt API keys before saving
      const configToSave = {
        providers: JSON.parse(JSON.stringify(this.config)),
        tools: this.toolConfigs
      };

      Object.keys(configToSave.providers).forEach(provider => {
        if (configToSave.providers[provider].apiKey) {
          configToSave.providers[provider].apiKey = this.encrypt(configToSave.providers[provider].apiKey);
        }
      });

      fs.writeFileSync(this.configPath, JSON.stringify(configToSave, null, 2));
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  private encrypt(text: string): string {
    if (!text) return text;

    const algorithm = 'aes-256-cbc';
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(encryptedText: string): string {
    if (!encryptedText || !encryptedText.includes(':')) {
      return encryptedText; // Assume it's not encrypted
    }

    const algorithm = 'aes-256-cbc';
    const key = this.getEncryptionKey();

    const parts = encryptedText.split(':');
    if (parts.length !== 2) {
      return encryptedText;
    }

    try {
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];

      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch {
      return encryptedText;
    }
  }

  private getEncryptionKey(): Buffer {
    const machineId = process.env.MACHINE_ID || 'diren-default-key';
    const hash = crypto.createHash('sha256').update(machineId).digest();
    return hash; // Return Buffer directly for AES-256-CBC
  }

  public async setApiKey(provider: string, apiKey: string, config?: Partial<ProviderConfig>): Promise<void> {
    if (!this.config[provider]) {
      this.config[provider] = {
        apiKey: '',
        enabled: false,
        baseUrl: '',
        model: '',
        costPer1kTokens: 0.001,
        authType: 'bearer'
      };
    }

    this.config[provider] = {
      ...this.config[provider],
      apiKey,
      enabled: true,
      ...config
    };

    this.saveConfig();
  }

  public async getApiKey(provider: string): Promise<string | null> {
    return this.config[provider]?.apiKey || null;
  }

  public async getProviderConfig(provider: string): Promise<ProviderConfig | null> {
    return this.config[provider] || null;
  }

  public async listProviders(): Promise<string[]> {
    return Object.keys(this.config).filter(p => this.config[p].enabled);
  }

  public async getAllProviders(): Promise<{ [key: string]: ProviderConfig }> {
    return this.config;
  }

  public async addCustomProvider(name: string, config: ProviderConfig): Promise<void> {
    this.config[name] = config;
    this.saveConfig();
  }

  public async configureTools(toolName: string): Promise<boolean> {
    const toolConfig = this.toolConfigs[toolName];
    if (!toolConfig) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    const configPath = toolConfig.configPath.replace('~', process.env.HOME || process.env.USERPROFILE || '');
    const configDir = path.dirname(configPath);

    try {
      // Create directory if it doesn't exist
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // Read existing config if it exists
      let existingConfig = {};
      if (fs.existsSync(configPath)) {
        try {
          const existingData = fs.readFileSync(configPath, 'utf8');
          existingConfig = JSON.parse(existingData);
        } catch {
          // Invalid JSON, start fresh
        }
      }

      // Merge with our template
      const mergedConfig = { ...existingConfig, ...toolConfig.template };

      // Write the config
      fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2));

      // Mark as enabled
      toolConfig.enabled = true;
      this.saveConfig();

      return true;
    } catch (error) {
      console.error(`Failed to configure ${toolName}:`, error);
      return false;
    }
  }

  public getToolConfigs(): { [tool: string]: ToolConfig } {
    return this.toolConfigs;
  }

  public getProxyUrl(provider: string): string {
    const port = process.env.DIREN_PORT || 3000;
    return `http://localhost:${port}`;
  }

  public async enableProvider(provider: string, enabled: boolean = true): Promise<void> {
    if (this.config[provider]) {
      this.config[provider].enabled = enabled;
      this.saveConfig();
    }
  }
}