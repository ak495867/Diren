# Diren Usage Examples - Complete Guide

This guide shows you everything you need to know to use Diren like a pro!

## 🎯 What You'll Learn

- How to set up Diren
- How to use it with different AI services
- How to configure popular coding tools
- How to monitor your savings
- Cool advanced features

---

## 🚀 Basic Setup (Kid-Friendly!)

### Step 1: Install Diren

```bash
# This installs Diren globally on your computer
npm install -g diren
```

**What this does**: Makes the `diren` command available everywhere!

### Step 2: Add Your AI API Keys

Diren needs to know your API keys to save you money. Think of it like giving Diren the keys to your AI accounts.

```bash
# OpenAI (ChatGPT, GPT-4, etc.)
diren config set openai --key sk-your-openai-key

# Anthropic (Claude)
diren config set anthropic --key sk-ant-your-anthropic-key

# Google AI (Gemini)
diren config set google --key your-google-api-key

# Groq (Super fast!)
diren config set groq --key gsk-your-groq-key
```

**Tip**: Don't have API keys? Get them from:
- [OpenAI](https://platform.openai.com/api-keys)
- [Anthropic](https://console.anthropic.com/settings/keys)
- [Google AI](https://makersuite.google.com/app/apikey)
- [Groq](https://console.groq.com/keys)

### Step 3: Start the Server

```bash
# Start with dashboard (recommended!)
diren start --port 3000 --dashboard
```

**What happens**: 
- Diren starts on port 3000
- Opens a beautiful web dashboard
- Ready to save you money!

### Step 4: Check It's Working

Open your browser: `http://localhost:3000/dashboard`

You should see:
- 💰 Total money saved
- 📊 Requests processed
- 🎯 Cache hit rate
- 🔌 Provider status

---

## 🤖 Using Diren with Different AI Services

### OpenAI (ChatGPT, GPT-4)

**Before (Direct API - pays full price):**
```javascript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer sk-your-key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: 'Hello!' }]
  })
});
```

**After (With Diren - saves money!):**
```javascript
const response = await fetch('http://localhost:3000/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'  // No API key needed!
  },
  body: JSON.stringify({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: 'Hello!' }]
  })
});
```

**What changed**: 
- Uses `localhost:3000` instead of OpenAI directly
- No API key in your code (Diren handles it!)
- Same response format, but cheaper!

### Anthropic (Claude)

**Before:**
```javascript
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': 'sk-ant-your-key',
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01'
  },
  body: JSON.stringify({
    model: 'claude-3-sonnet-20240229',
    max_tokens: 1000,
    messages: [{ role: 'user', content: 'Hello!' }]
  })
});
```

**After:**
```javascript
const response = await fetch('http://localhost:3000/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'claude-3-sonnet-20240229',
    max_tokens: 1000,
    messages: [{ role: 'user', content: 'Hello!' }]
  })
});
```

### Google AI (Gemini)

```javascript
const response = await fetch('http://localhost:3000/v1/models/gemini-pro:generateContent', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: 'Hello!' }] }]
  })
});
```

### Python with OpenAI SDK

```python
import openai

# Just change the base URL!
client = openai.OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="dummy"  # Diren manages the real key
)

response = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[{"role": "user", "content": "Hello!"}]
)

print(response.choices[0].message.content)
```

---

## 🛠️ One-Click Tool Setup

Diren can automatically configure your favorite coding tools!

### Set Up Claude CLI

```bash
# Magic - it does everything for you!
diren tools configure claude-cli
```

**What it does**: 
- Finds your `~/.claude/settings.json`
- Adds Diren as the default AI provider
- You just use `claude` normally!

### Set Up Cursor IDE

```bash
diren tools configure cursor
```

**What it does**:
- Configures Cursor to use Diren
- All AI features in Cursor go through Diren
- Saves money on every AI request!

### List All Supported Tools

```bash
diren tools list
```

**Supported tools**:
- ✅ Claude CLI
- ✅ Cursor IDE  
- ✅ Continue (VS Code extension)
- ✅ Aider

---

## 📊 Monitoring Your Savings

### Command Line

```bash
# Quick stats
diren stats

# JSON format (for scripts)
diren stats --json
```

**Output example:**
```
💰 Diren Usage Statistics
==========================
📊 Total requests: 1,247
⚡ Cache hits: 987
📈 Cache hit rate: 79.1%
💵 Total cost: $2.45
🎯 Money saved: $18.92
📉 Savings rate: 88.5%

📋 Provider Breakdown:
----------------------
openai        Requests: 523, Saved: $12.34
anthropic     Requests: 412, Saved: $5.67
groq          Requests: 312, Saved: $0.91
```

### Web Dashboard

Open: `http://localhost:3000/dashboard`

Shows:
- Real-time charts
- Provider breakdown
- Cache management
- Tool configuration

### API Endpoints

```bash
# Detailed analytics
curl http://localhost:3000/api/analytics

# Model performance
curl http://localhost:3000/api/models

# Memory stats
curl http://localhost:3000/api/memory

# Prometheus metrics
curl http://localhost:3000/metrics
```

---

## 🧠 Smart AI Routing (Advanced!)

Let Diren automatically pick the BEST AI model for your request!

```javascript
// Let Diren decide the best model
const response = await fetch('http://localhost:3000/v1/smart/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Diren-Smart-Routing': 'true',
    'X-Diren-Quality': 'high',        // high, medium, low
    'X-Diren-Max-Cost': '0.05',       // Max $0.05 per request
    'X-Diren-Capabilities': 'code'    // Required: code, analysis, chat
  },
  body: JSON.stringify({
    messages: [{
      role: 'user',
      content: 'Write a Python function to sort arrays with comments'
    }]
  })
});

// Check routing info
console.log(response.headers.get('X-Diren-Selected-Provider')); // "deepseek"
console.log(response.headers.get('X-Diren-Selected-Model'));    // "deepseek-coder"
console.log(response.headers.get('X-Diren-Routing-Confidence')); // "0.92"
```

### Quality Settings

| Setting | Use Case | Cost | Speed |
|---------|----------|------|-------|
| `high` | Complex analysis, important code | Higher | Medium |
| `medium` | Balanced | Balanced | Balanced |
| `low` | Simple tasks, quick answers | Lowest | Fastest |

### Smart Routing Examples

**For code (routes to code specialists):**
```javascript
headers: {
  'X-Diren-Capabilities': 'code',
  'X-Diren-Quality': 'high'
}
```

**For analysis (routes to deep thinkers):**
```javascript
headers: {
  'X-Diren-Capabilities': 'analysis',
  'X-Diren-Quality': 'high'
}
```

**For speed (routes to fastest):**
```javascript
headers: {
  'X-Diren-Max-Latency': '1000',  // 1 second max
  'X-Diren-Quality': 'low'
}
```

---

## ⚡ Quick Reference

### Useful Commands

```bash
# Start server
diren start --port 3000 --dashboard

# Configure providers
diren config set openai --key YOUR_KEY
diren config list

# Configure tools
diren tools configure claude-cli
diren tools configure cursor
diren tools list

# Check stats
diren stats

# Open dashboard
diren dashboard

# Smart routing analysis
diren smart route "write python code" --quality high
```

### Response Headers to Watch

| Header | Meaning |
|--------|---------|
| `X-Diren-Cache` | `HIT` or `MISS` |
| `X-Diren-Cache-Source` | `exact`, `semantic`, `contextual`, `memory` |
| `X-Diren-Provider` | Which AI was used |
| `X-Diren-Cost` | Cost in dollars |
| `X-Diren-Response-Time` | How long it took |

---

## 🔧 Troubleshooting

### "Command not found: diren"
```bash
# Windows: Restart terminal
# Mac/Linux:
export PATH=$PATH:/usr/local/bin
```

### Port already in use
```bash
# Use different port
diren start --port 3002

# Or kill existing process
lsof -ti:3000 | xargs kill -9
```

### Configuration issues
```bash
# Check what's configured
diren config list

# Set a provider
diren config set openai --key YOUR_API_KEY
```

### Dashboard not loading
```bash
# Make sure server is running
diren start --dashboard

# Check URL
open http://localhost:3000/dashboard
```

---

## 🎯 Pro Tips for Maximum Savings

1. **Use smart routing** - Let Diren choose the best model
2. **Check cache hit rate** - Aim for >70%
3. **Monitor dashboard** - See savings in real-time
4. **Configure tools** - One-click saves on all your coding
5. **Set quality preferences** - Don't pay for quality you don't need

---

## 💡 Need More Help?

- **GitHub Issues**: Bug reports & feature requests
- **Documentation**: Check `/docs` folder
- **Community**: Discussions in the repository

**Remember**: Every request through Diren saves money. Start today and keep more of your money! 💰🚀