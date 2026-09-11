import { DirenServer } from '../index';
import { ConfigManager } from '../config/ConfigManager';
import { CacheManager } from '../cache/CacheManager';
import { Analytics } from '../analytics/Analytics';
import { ModelPool } from '../intelligence/ModelPool';
import { FastMemoryStore } from '../intelligence/FastMemoryStore';
import { SemanticScorer } from '../intelligence/SemanticScorer';
import path from 'path';
import fs from 'fs';

export class TestEnvironment {
  private server: DirenServer | null = null;
  private testPort: number = 3001;
  private testDataDir: string;
  private originalDataDir: string;

  constructor() {
    // Use a separate test data directory
    this.originalDataDir = path.join(process.env.HOME || '', '.diren');
    this.testDataDir = path.join(__dirname, '../../test-data');
    
    // Override data directory for tests
    process.env.HOME = path.dirname(this.testDataDir);
  }

  async setup(): Promise<void> {
    // Create test data directory
    if (!fs.existsSync(this.testDataDir)) {
      fs.mkdirSync(this.testDataDir, { recursive: true });
    }

    // Clean test directory
    const direnTestDir = path.join(this.testDataDir, '.diren');
    if (fs.existsSync(direnTestDir)) {
      fs.rmSync(direnTestDir, { recursive: true, force: true });
    }

    // Setup test configuration
    await this.setupTestConfig();
  }

  async teardown(): Promise<void> {
    // Stop server if running
    if (this.server) {
      // Server doesn't have a stop method, so we'll just mark it as null
      this.server = null;
    }

    // Clean test data
    if (fs.existsSync(this.testDataDir)) {
      fs.rmSync(this.testDataDir, { recursive: true, force: true });
    }

    // Restore original data directory
    process.env.HOME = path.dirname(this.originalDataDir);
  }

  async startServer(): Promise<DirenServer> {
    this.server = new DirenServer(this.testPort);
    await this.server.start();
    
    // Wait for server to be ready
    await this.waitForServer();
    
    return this.server;
  }

  async waitForServer(): Promise<void> {
    const maxAttempts = 30;
    const delay = 1000;
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`http://localhost:${this.testPort}/health`);
        if (response.ok) {
          return;
        }
      } catch (error) {
        // Server not ready yet
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    throw new Error('Server failed to start within timeout');
  }

  async setupTestConfig(): Promise<void> {
    const configManager = new ConfigManager();
    
    // Setup test providers
    await configManager.setApiKey('test-provider', 'test-key-123', {
      baseUrl: 'https://api.test.com/v1',
      model: 'test-model',
      costPer1kTokens: 0.001,
      authType: 'bearer',
      enabled: true
    });

    await configManager.setApiKey('openai', 'sk-test-openai-key', {
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-3.5-turbo',
      costPer1kTokens: 0.002,
      authType: 'bearer',
      enabled: true
    });

    await configManager.setApiKey('anthropic', 'sk-ant-test-key', {
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude-3-haiku-20240307',
      costPer1kTokens: 0.00025,
      authType: 'api-key',
      enabled: true
    });
  }

  getServerUrl(): string {
    return `http://localhost:${this.testPort}`;
  }

  getTestPort(): number {
    return this.testPort;
  }

  // Helper methods for creating test data
  createTestRequest(content: string = 'Test request', model: string = 'gpt-3.5-turbo') {
    return {
      model,
      messages: [{ role: 'user', content }],
      max_tokens: 100,
      temperature: 0.7
    };
  }

  createTestResponse(content: string = 'Test response') {
    return {
      choices: [{
        message: {
          role: 'assistant',
          content
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 15,
        total_tokens: 25
      }
    };
  }

  // Mock external API responses
  mockApiResponse(provider: string, response: any = null) {
    return response || this.createTestResponse(`Mock response from ${provider}`);
  }
}

// Global test utilities
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const expectToThrow = async (fn: () => Promise<any>, expectedMessage?: string) => {
  try {
    await fn();
    throw new Error('Expected function to throw, but it did not');
  } catch (error: any) {
    if (expectedMessage && !error.message.includes(expectedMessage)) {
      throw new Error(`Expected error message to contain "${expectedMessage}", but got: ${error.message}`);
    }
  }
};

export const expectCacheHit = (headers: any, source: 'exact' | 'semantic' | 'contextual' | 'memory') => {
  expect(headers.get('x-diren-cache')).toBe('HIT');
  expect(headers.get('x-diren-cache-source')).toBe(source);
  expect(parseFloat(headers.get('x-diren-cache-similarity'))).toBeGreaterThan(0);
};

export const expectCacheMiss = (headers: any) => {
  expect(headers.get('x-diren-cache')).toBe('MISS');
  expect(headers.get('x-diren-provider')).toBeTruthy();
};

// Test data generators
export const generateSemanticVariations = (baseText: string): string[] => {
  return [
    baseText,
    baseText.replace(/\b\w/g, c => Math.random() > 0.5 ? c.toUpperCase() : c.toLowerCase()),
    baseText.replace(/\./g, '!').replace(/\?/g, '.'),
    `Please ${baseText.toLowerCase()}`,
    `Could you ${baseText.toLowerCase()}`,
    `I need help with: ${baseText}`
  ];
};

export const generateCodeVariations = (): string[] => {
  return [
    'Write a Python function to sort a list',
    'Create a sorting function in Python',
    'Generate Python code for list sorting',
    'Implement quicksort in Python',
    'Show me how to sort arrays in Python',
    'Python list sorting algorithm',
    'Sort function Python implementation'
  ];
};

export const generateAnalysisVariations = (): string[] => {
  return [
    'Analyze the pros and cons of microservices',
    'What are the advantages and disadvantages of microservices?',
    'Compare microservices vs monolithic architecture',
    'Microservices benefits and drawbacks',
    'Evaluation of microservice architecture'
  ];
};

export default TestEnvironment;