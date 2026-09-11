# Contributing to Diren

Thank you for your interest in contributing to Diren! This guide will help you get started.

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/ak495867/diren.git
   cd diren
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Run tests**
   ```bash
   npm test
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

## Project Structure

- `src/cache/` - Caching logic and SQLite database management
- `src/config/` - Configuration management and API key encryption
- `src/proxy/` - HTTP proxy handlers for different AI providers
- `src/analytics/` - Usage tracking and cost calculation
- `src/cli.ts` - Command-line interface
- `src/index.ts` - Main server application

## Adding New Providers

To add support for a new AI provider:

1. **Add provider configuration** in `ConfigManager.ts`:
   ```typescript
   const defaults: { [key: string]: Partial<ProviderConfig> } = {
     yourprovider: {
       baseUrl: 'https://api.yourprovider.com',
       model: 'default-model',
       costPer1kTokens: 0.001
     }
   };
   ```

2. **Add proxy handler** in `ProxyHandler.ts`:
   ```typescript
   public async handleYourProvider(req: Request, res: Response): Promise<void> {
     await this.handleRequest(req, res, 'yourprovider', {
       url: 'https://api.yourprovider.com/v1/completions',
       headers: (apiKey: string) => ({
         'Authorization': `Bearer ${apiKey}`,
         'Content-Type': 'application/json'
       })
     });
   }
   ```

3. **Add route** in `index.ts`:
   ```typescript
   this.app.post('/v1/yourprovider', this.proxyHandler.handleYourProvider.bind(this.proxyHandler));
   ```

4. **Add token extraction** logic in `ProxyHandler.ts`:
   ```typescript
   case 'yourprovider':
     return response.usage?.total_tokens || 0;
   ```

## Testing

- **Unit tests**: `npm test`
- **Manual testing**: Start the server and test with curl or your favorite HTTP client
- **Integration tests**: Test with actual API keys (use test keys when available)

## Code Style

- Use TypeScript strict mode
- Follow existing naming conventions
- Add JSDoc comments for public methods
- Use meaningful variable and function names
- Keep functions small and focused

## Pull Request Process

1. **Fork the repository** and create a feature branch
2. **Make your changes** following the code style guidelines
3. **Add tests** for new functionality
4. **Update documentation** if needed
5. **Run tests** to ensure everything works
6. **Submit a pull request** with a clear description

## Issue Guidelines

When reporting bugs or requesting features:

1. **Search existing issues** first
2. **Use issue templates** when available
3. **Provide clear reproduction steps** for bugs
4. **Include relevant logs** and error messages
5. **Specify your environment** (OS, Node version, etc.)

## Security

- **Never commit API keys** or sensitive data
- **Use the existing encryption** for storing credentials
- **Report security vulnerabilities** privately via email
- **Follow secure coding practices**

## Questions?

- **Open an issue** for bugs or feature requests
- **Start a discussion** for general questions
- **Check existing documentation** first

We appreciate your contributions to making AI APIs more affordable for everyone!