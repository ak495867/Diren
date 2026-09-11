# Smart Routing & AI Intelligence Examples

Diren's AI intelligence features provide semantic caching, fast memory retrieval, and smart model pooling for optimal cost and performance.

## Smart Model Routing

### Automatic Model Selection

Use the smart routing endpoint to automatically select the best model for your request:

```javascript
// Instead of specifying a provider, let Diren choose
const response = await fetch('http://localhost:3000/v1/smart/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    // Optional: Set preferences
    'X-Diren-Quality': 'high',           // high, medium, low
    'X-Diren-Max-Cost': '0.05',         // Max cost per request
    'X-Diren-Max-Latency': '5000',      // Max latency in ms
    'X-Diren-Capabilities': 'code,analysis' // Required capabilities
  },
  body: JSON.stringify({
    messages: [
      { 
        role: 'user', 
        content: 'Write a Python function to implement quicksort with detailed comments' 
      }
    ],
    max_tokens: 1000
  })
});

// Response headers will include routing information
console.log(response.headers.get('X-Diren-Selected-Provider')); // e.g., "deepseek"
console.log(response.headers.get('X-Diren-Selected-Model'));    // e.g., "deepseek-coder"
console.log(response.headers.get('X-Diren-Routing-Confidence')); // e.g., "0.92"
console.log(response.headers.get('X-Diren-Reasoning'));         // Selection reasoning
```

### Manual Smart Routing Header

Enable smart routing on any endpoint:

```javascript
const response = await fetch('http://localhost:3000/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Diren-Smart-Routing': 'true',    // Enable smart routing
    'X-Diren-Quality': 'medium'         // Quality preference
  },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Explain quantum computing' }]
  })
});
```

## Semantic Caching Examples

### Cache Hit Types

Diren provides multiple levels of cache matching:

```javascript
// 1. Exact Match (100% cache hit)
await fetch('http://localhost:3000/v1/chat/completions', {
  method: 'POST',
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'What is JavaScript?' }]
  })
});

// Same request again - EXACT cache hit
await fetch('http://localhost:3000/v1/chat/completions', {
  method: 'POST',
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'What is JavaScript?' }]
  })
});

// 2. Semantic Match (~85-95% cache hit)
// Similar intent, different wording
await fetch('http://localhost:3000/v1/chat/completions', {
  method: 'POST', 
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Explain what JavaScript is' }]
  })
});

// 3. Contextual Match (~70-85% cache hit)
// Same conversation context
await fetch('http://localhost:3000/v1/chat/completions', {
  method: 'POST',
  body: JSON.stringify({
    messages: [
      { role: 'user', content: 'What is JavaScript?' },
      { role: 'assistant', content: 'JavaScript is a programming language...' },
      { role: 'user', content: 'What about Python?' }  // Related context
    ]
  })
});
```

### Cache Performance Headers

Check cache performance in response headers:

```javascript
const response = await fetch('http://localhost:3000/v1/chat/completions', {
  // ... request
});

console.log(response.headers.get('X-Diren-Cache'));           // HIT or MISS
console.log(response.headers.get('X-Diren-Cache-Source'));    // exact, semantic, contextual, memory
console.log(response.headers.get('X-Diren-Cache-Similarity')); // 0.0-1.0 similarity score
console.log(response.headers.get('X-Diren-Cache-Confidence')); // 0.0-1.0 confidence
console.log(response.headers.get('X-Diren-Retrieval-Time'));   // e.g., "0.3ms"
```

## Model Pool Usage Examples

### Code Generation Tasks

```javascript
// Diren automatically routes to code-specialized models
const codeResponse = await fetch('http://localhost:3000/v1/smart/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Diren-Capabilities': 'code'  // Require code capabilities
  },
  body: JSON.stringify({
    messages: [{
      role: 'user',
      content: 'Create a REST API endpoint in Node.js for user authentication'
    }]
  })
});

// Likely routed to: deepseek-coder, claude-3-sonnet, or gpt-4 (code-optimized)
```

### Analysis Tasks

```javascript
// Routes to models optimized for analysis
const analysisResponse = await fetch('http://localhost:3000/v1/smart/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Diren-Capabilities': 'analysis',
    'X-Diren-Quality': 'high'
  },
  body: JSON.stringify({
    messages: [{
      role: 'user',
      content: 'Analyze the pros and cons of microservices vs monolithic architecture'
    }]
  })
});

// Likely routed to: claude-3-opus, gpt-4-turbo, or perplexity (analysis-optimized)
```

### Cost-Optimized Requests

```javascript
// Optimize for cost while maintaining quality
const costOptimizedResponse = await fetch('http://localhost:3000/v1/smart/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Diren-Max-Cost': '0.001',  // Very low cost limit
    'X-Diren-Quality': 'medium'
  },
  body: JSON.stringify({
    messages: [{
      role: 'user',
      content: 'Write a simple hello world program in Python'
    }]
  })
});

// Likely routed to: claude-3-haiku, gpt-3.5-turbo, or groq/mixtral
```

### Speed-Optimized Requests

```javascript
// Optimize for speed
const fastResponse = await fetch('http://localhost:3000/v1/smart/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Diren-Max-Latency': '1000',  // 1 second max
    'X-Diren-Quality': 'low'        // Accept lower quality for speed
  },
  body: JSON.stringify({
    messages: [{
      role: 'user',
      content: 'Quick summary of machine learning'
    }]
  })
});

// Likely routed to: groq/mixtral, claude-3-haiku, or local ollama models
```

## CLI Usage Examples

### Smart Routing Analysis

```bash
# Analyze text for optimal model routing
diren smart route "Create a database schema for an e-commerce app" \
  --quality high \
  --max-cost 0.05 \
  --capabilities code,analysis

# Output:
# 🧠 Analyzing request for optimal model routing...
# Text: "Create a database schema for an e-commerce app"
# Quality preference: high
# Max cost: $0.05
#
# 📊 Routing Analysis:
# ✅ Intent detected: code generation + analysis
# ✅ Complexity score: 0.8 (high)
# ✅ Recommended provider: claude-3-sonnet (balanced performance)
# ✅ Estimated cost: $0.024
# ✅ Estimated latency: 2.1s
```

### Model Pool Status

```bash
# Check available models
diren smart models

# Output:
# 🤖 Available Models in Pool:
# ===============================
# 
# High Quality:
#   ✅ gpt-4-turbo         ~2100ms  $0.0300/1K tokens
#   ✅ claude-3-opus       ~3200ms  $0.0150/1K tokens
#   ✅ gemini-ultra        ~2800ms  $0.0200/1K tokens
# 
# Balanced:
#   ✅ gpt-3.5-turbo       ~1200ms  $0.0020/1K tokens
#   ✅ claude-3-sonnet     ~1800ms  $0.0030/1K tokens
#   ✅ gemini-pro          ~1500ms  $0.0025/1K tokens
```

### Fast Memory Statistics

```bash
# Check memory performance
diren smart memory

# Output:
# 🧠 Fast Memory Store Statistics:
# =================================
# Total entries: 2,847
# Memory utilization: 68.2%
# Average search time: 0.3ms
# Cache hit rate: 91.5%
# Compression ratio: 0.23 (77% space saved)
```

## Python SDK Example

```python
import openai
import requests

# Configure for smart routing
client = openai.OpenAI(
    base_url="http://localhost:3000/v1/smart",
    api_key="dummy"  # Managed by Diren
)

# Smart routing with preferences
response = client.chat.completions.create(
    model="auto",  # Let Diren choose
    messages=[
        {"role": "user", "content": "Optimize this SQL query for performance"}
    ],
    extra_headers={
        "X-Diren-Quality": "high",
        "X-Diren-Capabilities": "code,analysis"
    }
)

print(f"Selected provider: {response.response.headers.get('X-Diren-Selected-Provider')}")
print(f"Cache status: {response.response.headers.get('X-Diren-Cache')}")
print(f"Response: {response.choices[0].message.content}")
```

## Advanced Configuration

### Custom Model Preferences

```javascript
// Set provider preferences in request
const response = await fetch('http://localhost:3000/v1/smart/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Diren-Prefer-Providers': 'anthropic,openai',  // Preference order
    'X-Diren-Avoid-Providers': 'ollama',             // Providers to avoid
    'X-Diren-Model-Constraints': 'context_length>50000' // Model requirements
  },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Long document analysis task...' }]
  })
});
```

### Monitoring and Analytics

```javascript
// Get detailed analytics
const analytics = await fetch('http://localhost:3000/api/analytics');
const stats = await analytics.json();

console.log(`Total savings: $${stats.estimatedSavings}`);
console.log(`Cache hit rate: ${stats.cacheHitRate}%`);

// Get model pool performance
const models = await fetch('http://localhost:3000/api/models');
const modelStats = await models.json();

console.log(`Online models: ${modelStats.onlineModels}`);
console.log(`Average latency: ${modelStats.performanceMetrics.averageLatency}ms`);

// Get fast memory statistics  
const memory = await fetch('http://localhost:3000/api/memory');
const memoryStats = await memory.json();

console.log(`Memory utilization: ${memoryStats.memoryUsage.utilizationPercent}%`);
console.log(`Search performance: ${memoryStats.averageSearchTime}ms`);
```

This intelligent caching and routing system can reduce API costs by 90%+ while improving response times and maintaining high quality responses through semantic understanding and optimal model selection.