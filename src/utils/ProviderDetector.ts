export class ProviderDetector {
  public static detectFromUrl(url: string): string | null {
    const patterns = [
      { pattern: /openai\.com/i, provider: 'openai' },
      { pattern: /anthropic\.com/i, provider: 'anthropic' },
      { pattern: /googleapis\.com/i, provider: 'google' },
      { pattern: /groq\.com/i, provider: 'groq' },
      { pattern: /cursor\.so/i, provider: 'cursor' },
      { pattern: /localhost:11434/i, provider: 'ollama' },
      { pattern: /localhost:8080/i, provider: 'llama-cpp' },
      { pattern: /perplexity\.ai/i, provider: 'perplexity' },
      { pattern: /deepseek\.com/i, provider: 'deepseek' },
      { pattern: /openrouter\.ai/i, provider: 'openrouter' },
      { pattern: /azure\.com/i, provider: 'azure-openai' },
      { pattern: /x\.ai/i, provider: 'grok-x' },
      { pattern: /dashscope\.aliyuncs\.com/i, provider: 'alibaba-dashscope' }
    ];

    for (const { pattern, provider } of patterns) {
      if (pattern.test(url)) {
        return provider;
      }
    }

    return null;
  }

  public static detectFromHeaders(headers: any): string | null {
    if (headers['x-api-key'] && headers['anthropic-version']) {
      return 'anthropic';
    }
    
    if (headers['authorization']?.includes('Bearer gsk-')) {
      return 'groq';
    }
    
    if (headers['authorization']?.includes('Bearer sk-')) {
      return 'openai';
    }

    return null;
  }

  public static detectFromModel(model: string): string | null {
    const modelPatterns = [
      { pattern: /^gpt-/i, provider: 'openai' },
      { pattern: /^claude-/i, provider: 'anthropic' },
      { pattern: /^gemini/i, provider: 'google' },
      { pattern: /^mixtral/i, provider: 'groq' },
      { pattern: /^llama/i, provider: 'ollama' },
      { pattern: /^deepseek/i, provider: 'deepseek' },
      { pattern: /^pplx/i, provider: 'perplexity' }
    ];

    for (const { pattern, provider } of modelPatterns) {
      if (pattern.test(model)) {
        return provider;
      }
    }

    return null;
  }

  public static detectProvider(url: string, headers: any, body: any): string {
    // Try URL detection first
    let provider = this.detectFromUrl(url);
    if (provider) return provider;

    // Try headers
    provider = this.detectFromHeaders(headers);
    if (provider) return provider;

    // Try model name
    if (body?.model) {
      provider = this.detectFromModel(body.model);
      if (provider) return provider;
    }

    // Default fallback
    return 'openai';
  }
}