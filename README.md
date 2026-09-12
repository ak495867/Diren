# Diren - AI API Cost Optimizer

## What is Diren?

Diren is a super-smart tool that helps you save money on AI API costs! Think of it as your personal AI cost-cutting assistant that makes your AI requests go further while keeping everything fast and simple.

**Mission**: Make AI cheaper, faster, and smarter for everyone!

## 🎯 What It Does

Diren acts like a clever middleman between you and AI services like OpenAI, Anthropic, and others. Instead of paying full price for every AI request, Diren:

1. **Remembers previous requests** - Like a smart friend who doesn't forget
2. **Understands what you're asking** - Goes beyond just matching words to understanding meaning
3. **Finds the best, cheapest AI model** - Chooses the perfect AI for each task
4. **Serves you the results** - Super fast, whether from memory or live API

**Real impact**: Saves up to 90% on AI API costs while maintaining quality!

## 🚀 Quick Start (Kid-Friendly Version)

### 1. Install Diren (Super Easy!)

```bash
# Download and install (works on Mac, Windows, Linux)
npm install -g diren
```

### 2. Add Your AI API Keys

```bash
# Tell Diren about your favorite AI services
diren config set openai --key sk-your-openai-key
diren config set anthropic --key sk-ant-your-anthropic-key
diren config set groq --key gsk-your-groq-key
```

### 3. Start the Magic Server

```bash
# Start Diren with the cool dashboard
diren start --port 3000 --dashboard
```

### 4. Watch It Work

Open your browser to: `http://localhost:3000/dashboard`

You'll see a beautiful dashboard showing:
- **Money saved** 💰
- **Requests made** 📊  
- **Cache hits** 🎯
- **Provider status** 🔌

## 🌟 How It Saves Money (Simple Explanation)

### Super Smart Caching

Imagine Diren is like a brilliant library:

- **Exact matches**: Same question = instant answer from cache (100% savings!)
- **Semantic matches**: Similar meaning, different words = still gets cached (85-95% savings)
- **Contextual matches**: Related conversation topics = smart caching (70-85% savings)
- **Memory search**: Lightning-fast searches through all your past interactions

### Smart Model Selection

Diren automatically picks the best AI model:

- **Complex tasks** → Powerful, capable AI (costs more)
- **Simple tasks** → Efficient, cheaper AI (costs less)
- **Speed matters** → Fast responses over perfect ones
- **Code tasks** → Specialized AI for programming

### Compression Magic

Diren squeezes responses to save space:
- Stores large responses in compact form
- Avoids storing duplicate information
- Shrinks file sizes by up to 90%

## 🛠️ How to Use Diren

### For Developers (JavaScript/TypeScript)

```javascript
// Instead of calling AI APIs directly, just use Diren's URLs
const response = await fetch('http://localhost:3000/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: 'What is machine learning?' }]
  })
});

// The response includes helpful headers:
console.log(response.headers.get('X-Diren-Cache')); // 'HIT' or 'MISS'
console.log(response.headers.get('X-Diren-Provider')); // Which provider was used
console.log(response.headers.get('X-Diren-Cost')); // How much it cost
```

### Smart Routing with Diren

Let Diren automatically choose the best AI model:

```javascript
// Let Diren decide the best model for your request
const response = await fetch('http://localhost:3000/v1/smart/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Diren-Smart-Routing': 'true',
    'X-Diren-Quality': 'high'
  },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Write a Python function to sort arrays' }]
  })
});

// Diren automatically picks the best provider/model
// and adds helpful headers about the routing decision
```

## 📊 What Makes Diren Special

### 🤖 AI Intelligence
- **Understands meaning**, not just keywords
- **Semantic caching** that recognizes similar concepts
- **Context-aware** responses based on conversation
- **Intent detection** for better matching

### ⚡ Speed & Performance  
- **Sub-millisecond** cache retrieval
- **Smart indexing** for instant searches
- **Concurrent request** handling
- **Adaptive compression** for efficiency

### 🛡️ Enterprise Ready
- **20+ AI providers** supported
- **Universal API compatibility**
- **Real-time monitoring**
- **Beautiful web dashboard**
- **Tool auto-configuration**

## 🔧 Local Development

### Setup for Development

```bash
# Clone the repository
git clone https://github.com/diren-ai/diren.git
cd diren

# Install dependencies
npm install

# Build the project
npm run build

# Start development server
npm run dev

# Or run tests
npm test
```

### Running Tests

```bash
# Run all tests
npm run test

# Run specific test types
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only
npm run test:e2e        # End-to-end tests only

# Run comprehensive test suite
npm run test:all
```

### Testing Locally

1. **Start the Diren server** in one terminal:
```bash
diren start --port 3001
```

2. **Run tests** in another terminal:
```bash
npm run test:all -- --testPathPattern=system.e2e
```

3. **Check the dashboard** at `http://localhost:3001/dashboard`

## 📦 Publishing to NPM

### Preparation Steps

1. **Create a GitHub account** if you don't have one

2. **Fork this repository**:
   - Go to https://github.com/diren-ai/diren
   - Click "Fork" in the top-right corner

3. **Create a new branch** for your changes:
```bash
git checkout -b feature/your-name-improvement
```

4. **Update package.json** with your changes

5. **Commit your changes**:
```bash
git add .
git commit -m "Add [your feature] improvements"
```

### Publishing Process

1. **Push to your fork**:
```bash
git push origin feature/your-name-improvement
```

2. **Create a Pull Request (PR)**:
   - Go to your forked repository
   - Click "Compare & pull request"
   - Fill in a descriptive PR message

3. **Wait for review**: Maintainers will review and merge your changes

4. **Automated publishing**: When merged to main, GitHub Actions will automatically publish to NPM!

### Publishing to NPM Directly

For direct NPM publishing, you'll need:

1. **NPM account** with proper permissions
2. **Maintainer access** to the package
3. **Security audit** completed

### Local Testing Before Publishing

Before publishing, always run:

```bash
# 1. Build the project
npm run build

# 2. Run all tests
npm test

# 3. Check test coverage
npm run test:coverage

# 4. Run performance benchmarks
npm run benchmark

# 5. Run intelligence benchmarks
npm run intelligence-benchmark
```

## 🛠️ Troubleshooting

### Common Issues

**Issue: "Command not found: diren"**
```bash
# On Windows, you might need to restart your terminal
# On Mac/Linux, try:
export PATH=$PATH:/usr/local/bin
```

**Issue: Port already in use**
```bash
# Change the port
diren start --port 3002

# Or stop existing process
lsof -ti:3000 | xargs kill -9
```

**Issue: API configuration problems**
```bash
# Check your configuration
diren config list

# Set a provider
diren config set openai --key YOUR_API_KEY
```

### Getting Help

- **GitHub Issues**: Report bugs or request features
- **Documentation**: Check the `/docs` folder for detailed guides
- **Community**: Join discussions in the repository

## ✨ What's Next?

Diren is constantly evolving! Here's what's coming:

- **Advanced semantic matching** with deep learning
- **Real-time model performance tracking**
- **Multi-language support**
- **Cloud deployment options**
- **Plugin architecture** for custom providers

## 📝 Contribution Guidelines

We welcome contributions! Please:

1. **Follow the existing code style**
2. **Add tests** for new functionality
3. **Write clear documentation**
4. **Update this README** with new features
5. **Run tests** before submitting

## 🔄 License

MIT License - Feel free to use, modify, and share!

## 💬 Community

- **GitHub**: https://github.com/diren-ai/diren
- **Discussions**: Feature requests and feedback
- **Issues**: Bug reports and questions

## 🎉 Getting Started Today!

```bash
# One command to save money on AI APIs!
npm install -g diren

# Configure and start
diren config set openai --key sk-your-key
diren start --dashboard

# Open dashboard and watch the savings!
```

**Remember**: Every cached request saves money, every smart routing choice saves money. **Start using Diren today and keep more of your hard-earned money!** 💰🚀