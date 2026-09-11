# Diren Usage Examples

## Basic Setup

1. Install Diren globally:
```bash
npm install -g diren
```

2. Configure your API keys:
```bash
# OpenAI
diren config set openai --key sk-your-openai-key

# Anthropic
diren config set anthropic --key sk-ant-your-anthropic-key

# Google AI
diren config set google --key your-google-api-key
```

3. Start the server:
```bash
diren start --port 3000
```

## Using with OpenAI

Instead of calling OpenAI directly, use the Diren proxy:

### Before (Direct API):
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

### After (With Diren):
```javascript
const response = await fetch('http://localhost:3000/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: 'Hello!' }]
  })
});
```

## Using with Anthropic

### Before:
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

### After:
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

## Environment Variables

Set these in your application to use Diren:

```bash
# For OpenAI SDK
export OPENAI_BASE_URL=http://localhost:3000/v1

# For custom applications
export DIREN_URL=http://localhost:3000
export DIREN_PORT=3000
```

## Python Example

```python
import openai

# Configure to use Diren proxy
client = openai.OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="dummy"  # API key is managed by Diren
)

response = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

## Monitoring

Check your savings:
```bash
diren stats
```

View real-time analytics:
```bash
curl http://localhost:3000/analytics
```