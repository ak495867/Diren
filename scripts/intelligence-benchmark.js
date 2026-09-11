#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class IntelligenceBenchmark {
  constructor() {
    this.baseUrl = process.env.DIREN_URL || 'http://localhost:3000';
    this.results = {
      timestamp: new Date().toISOString(),
      intelligence: {
        semanticCaching: {},
        fastMemory: {},
        modelRouting: {},
        compression: {}
      },
      performance: {
        latency: {},
        throughput: {},
        accuracy: {}
      }
    };
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async testSemanticCaching() {
    console.log('\n🧠 Testing Semantic Caching Intelligence...');
    
    const semanticGroups = [
      {
        intent: 'code_generation',
        variations: [
          'Write a Python function to sort a list',
          'Create a Python sorting function',  
          'Generate Python code for list sorting',
          'Implement quicksort in Python',
          'Show me how to sort arrays in Python'
        ]
      },
      {
        intent: 'explanation',
        variations: [
          'What is machine learning?',
          'Explain machine learning',
          'Tell me about ML',
          'Describe artificial intelligence and ML',
          'How does machine learning work?'
        ]
      },
      {
        intent: 'debugging',
        variations: [
          'Fix this JavaScript error',
          'Debug this JS code',
          'Why is this JavaScript not working?',
          'Troubleshoot this JS function',
          'Find the bug in this JavaScript'
        ]
      }
    ];

    let totalTests = 0;
    let semanticHits = 0;
    let avgSimilarity = 0;

    for (const group of semanticGroups) {
      console.log(`\n  Testing ${group.intent}...`);
      
      // First request - should be cache miss
      const firstResponse = await this.makeRequest(group.variations[0], { 
        'X-Diren-Provider': 'openai' 
      });
      
      if (!firstResponse.success) continue;
      
      // Test semantic variations
      for (let i = 1; i < group.variations.length; i++) {
        await this.delay(100); // Small delay
        
        const response = await this.makeRequest(group.variations[i], {
          'X-Diren-Provider': 'openai'
        });
        
        totalTests++;
        
        const cacheStatus = response.headers['x-diren-cache'];
        const cacheSource = response.headers['x-diren-cache-source'];
        const similarity = parseFloat(response.headers['x-diren-cache-similarity'] || '0');
        
        if (cacheStatus === 'HIT' && (cacheSource === 'semantic' || cacheSource === 'contextual')) {
          semanticHits++;
          avgSimilarity += similarity;
          console.log(`    ✅ "${group.variations[i]}" - ${cacheSource} hit (${similarity.toFixed(2)} similarity)`);
        } else {
          console.log(`    ❌ "${group.variations[i]}" - cache miss`);
        }
      }
    }

    const semanticHitRate = totalTests > 0 ? (semanticHits / totalTests) * 100 : 0;
    avgSimilarity = semanticHits > 0 ? avgSimilarity / semanticHits : 0;

    this.results.intelligence.semanticCaching = {
      totalTests,
      semanticHits,
      hitRate: semanticHitRate,
      averageSimilarity: avgSimilarity
    };

    console.log(`\n  📊 Semantic Cache Results:`);
    console.log(`     Hit Rate: ${semanticHitRate.toFixed(1)}%`);
    console.log(`     Average Similarity: ${avgSimilarity.toFixed(3)}`);
    console.log(`     Tests Passed: ${semanticHits}/${totalTests}`);
  }

  async testFastMemoryPerformance() {
    console.log('\n⚡ Testing Fast Memory Performance...');
    
    const searchQueries = [
      'JavaScript array methods',
      'Python data structures', 
      'React component lifecycle',
      'SQL database optimization',
      'REST API best practices',
      'Machine learning algorithms',
      'Docker containerization',
      'Git version control'
    ];

    let totalSearches = 0;
    let totalSearchTime = 0;
    let memoryHits = 0;

    for (const query of searchQueries) {
      const startTime = Date.now();
      
      try {
        const response = await axios.get(`${this.baseUrl}/api/memory`, {
          params: { q: query },
          timeout: 5000
        });
        
        totalSearches++;
        const searchTime = Date.now() - startTime;
        totalSearchTime += searchTime;
        
        if (response.data.results && response.data.results.length > 0) {
          memoryHits++;
          console.log(`    ✅ "${query}" - ${response.data.results.length} results in ${searchTime}ms`);
        } else {
          console.log(`    ⚪ "${query}" - no results in ${searchTime}ms`);
        }
        
      } catch (error) {
        console.log(`    ❌ "${query}" - error: ${error.message}`);
      }

      await this.delay(50);
    }

    const avgSearchTime = totalSearches > 0 ? totalSearchTime / totalSearches : 0;
    const memoryHitRate = totalSearches > 0 ? (memoryHits / totalSearches) * 100 : 0;

    this.results.intelligence.fastMemory = {
      totalSearches,
      memoryHits,
      averageSearchTime: avgSearchTime,
      hitRate: memoryHitRate
    };

    console.log(`\n  📊 Fast Memory Results:`);
    console.log(`     Average Search Time: ${avgSearchTime.toFixed(1)}ms`);  
    console.log(`     Memory Hit Rate: ${memoryHitRate.toFixed(1)}%`);
    console.log(`     Total Searches: ${totalSearches}`);
  }

  async testSmartModelRouting() {
    console.log('\n🎯 Testing Smart Model Routing...');
    
    const routingTests = [
      {
        content: 'Write a complex algorithm for graph traversal in C++',
        expectedCapability: 'code',
        expectedComplexity: 'high',
        preferredProviders: ['deepseek', 'claude', 'gpt-4']
      },
      {
        content: 'What is 2 + 2?',
        expectedCapability: 'chat', 
        expectedComplexity: 'low',
        preferredProviders: ['groq', 'claude-haiku', 'gpt-3.5']
      },
      {
        content: 'Analyze the economic implications of climate change policies',
        expectedCapability: 'analysis',
        expectedComplexity: 'high', 
        preferredProviders: ['claude-opus', 'gpt-4', 'perplexity']
      },
      {
        content: 'Fix this simple JavaScript function that adds two numbers',
        expectedCapability: 'code',
        expectedComplexity: 'low',
        preferredProviders: ['groq', 'claude-haiku', 'deepseek']
      }
    ];

    let totalRoutes = 0;
    let correctRoutes = 0;
    let avgConfidence = 0;
    let avgLatency = 0;

    for (const test of routingTests) {
      console.log(`\n  Testing: "${test.content.substring(0, 50)}..."`);
      
      const startTime = Date.now();
      const response = await this.makeRequest(test.content, {
        'X-Diren-Smart-Routing': 'true',
        'X-Diren-Quality': 'medium'
      });
      
      const routingTime = Date.now() - startTime;
      totalRoutes++;
      avgLatency += routingTime;

      if (response.success) {
        const selectedProvider = response.headers['x-diren-selected-provider'];
        const confidence = parseFloat(response.headers['x-diren-routing-confidence'] || '0');
        const reasoning = response.headers['x-diren-reasoning'] || '';
        
        avgConfidence += confidence;
        
        // Check if routing makes sense
        const isCorrectRoute = test.preferredProviders.some(provider => 
          selectedProvider?.toLowerCase().includes(provider.toLowerCase())
        );
        
        if (isCorrectRoute || confidence > 0.8) {
          correctRoutes++;
          console.log(`    ✅ Routed to ${selectedProvider} (confidence: ${confidence.toFixed(2)})`);
        } else {
          console.log(`    ⚠️  Routed to ${selectedProvider} (confidence: ${confidence.toFixed(2)}) - suboptimal`);
        }
        
        console.log(`    📝 Reasoning: ${reasoning}`);
      } else {
        console.log(`    ❌ Routing failed: ${response.error}`);
      }

      await this.delay(200);
    }

    avgConfidence = totalRoutes > 0 ? avgConfidence / totalRoutes : 0;
    avgLatency = totalRoutes > 0 ? avgLatency / totalRoutes : 0;
    const routingAccuracy = totalRoutes > 0 ? (correctRoutes / totalRoutes) * 100 : 0;

    this.results.intelligence.modelRouting = {
      totalRoutes,
      correctRoutes,
      accuracy: routingAccuracy,
      averageConfidence: avgConfidence,
      averageLatency: avgLatency
    };

    console.log(`\n  📊 Smart Routing Results:`);
    console.log(`     Routing Accuracy: ${routingAccuracy.toFixed(1)}%`);
    console.log(`     Average Confidence: ${avgConfidence.toFixed(3)}`);
    console.log(`     Average Latency: ${avgLatency.toFixed(0)}ms`);
  }

  async testCompressionEfficiency() {
    console.log('\n🗜️  Testing Compression Efficiency...');
    
    try {
      const analyticsResponse = await axios.get(`${this.baseUrl}/api/analytics`);
      const memoryResponse = await axios.get(`${this.baseUrl}/api/memory`);
      
      const analytics = analyticsResponse.data;
      const memory = memoryResponse.data;
      
      const compressionRatio = analytics.cache?.avg_compression_ratio || 0;
      const spaceSavings = compressionRatio > 0 ? ((1 - compressionRatio) * 100) : 0;
      const totalEntries = analytics.cache?.total_entries || 0;
      const compressedEntries = analytics.cache?.compressed_entries || 0;
      const compressionRate = totalEntries > 0 ? (compressedEntries / totalEntries * 100) : 0;
      
      this.results.intelligence.compression = {
        compressionRatio,
        spaceSavings,
        totalEntries,
        compressedEntries,
        compressionRate,
        memoryUtilization: memory.memoryUsage?.utilizationPercent || 0
      };
      
      console.log(`\n  📊 Compression Results:`);
      console.log(`     Space Savings: ${spaceSavings.toFixed(1)}%`);
      console.log(`     Compression Rate: ${compressionRate.toFixed(1)}% of entries`);
      console.log(`     Average Ratio: ${compressionRatio.toFixed(3)}`);
      console.log(`     Memory Utilization: ${memory.memoryUsage?.utilizationPercent || 0}%`);
      
    } catch (error) {
      console.log(`    ❌ Failed to get compression stats: ${error.message}`);
    }
  }

  async testOverallPerformance() {
    console.log('\n🚀 Testing Overall Performance...');
    
    const concurrentRequests = 5;
    const testMessage = 'Explain the differences between supervised and unsupervised machine learning';
    
    console.log(`\n  Making ${concurrentRequests} concurrent requests...`);
    
    const startTime = Date.now();
    const promises = Array.from({ length: concurrentRequests }, (_, i) => 
      this.makeRequest(`${testMessage} (test ${i})`, {
        'X-Diren-Smart-Routing': 'true'
      })
    );
    
    const results = await Promise.all(promises);
    const endTime = Date.now();
    
    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;
    const cacheHits = results.filter(r => r.headers['x-diren-cache'] === 'HIT').length;
    const avgResponseTime = results
      .filter(r => r.success)
      .reduce((sum, r) => sum + r.responseTime, 0) / successful;
    
    this.results.performance = {
      totalRequests: concurrentRequests,
      successful,
      failed,
      cacheHits,
      cacheHitRate: (cacheHits / successful * 100),
      totalTime: endTime - startTime,
      averageResponseTime: avgResponseTime,
      throughput: (successful / (endTime - startTime)) * 1000 // requests per second
    };
    
    console.log(`\n  📊 Performance Results:`);
    console.log(`     Total Time: ${endTime - startTime}ms`);
    console.log(`     Successful: ${successful}/${concurrentRequests}`);
    console.log(`     Cache Hits: ${cacheHits} (${(cacheHits/successful*100).toFixed(1)}%)`);
    console.log(`     Average Response Time: ${Math.round(avgResponseTime)}ms`);
    console.log(`     Throughput: ${this.results.performance.throughput.toFixed(1)} req/sec`);
  }

  async makeRequest(content, headers = {}) {
    const startTime = Date.now();
    
    try {
      const response = await axios.post(`${this.baseUrl}/v1/chat/completions`, {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content }],
        max_tokens: 100
      }, {
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        timeout: 30000
      });

      return {
        success: true,
        responseTime: Date.now() - startTime,
        status: response.status,
        headers: response.headers,
        data: response.data
      };
      
    } catch (error) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: error.message,
        status: error.response?.status || 0
      };
    }
  }

  calculateIntelligenceScore() {
    const weights = {
      semanticCaching: 0.3,
      fastMemory: 0.25, 
      modelRouting: 0.25,
      compression: 0.2
    };

    let totalScore = 0;
    let totalWeight = 0;

    // Semantic caching score
    if (this.results.intelligence.semanticCaching.hitRate !== undefined) {
      const score = Math.min(100, this.results.intelligence.semanticCaching.hitRate);
      totalScore += score * weights.semanticCaching;
      totalWeight += weights.semanticCaching;
    }

    // Fast memory score  
    if (this.results.intelligence.fastMemory.averageSearchTime !== undefined) {
      const score = Math.max(0, 100 - this.results.intelligence.fastMemory.averageSearchTime / 10);
      totalScore += score * weights.fastMemory;
      totalWeight += weights.fastMemory;
    }

    // Model routing score
    if (this.results.intelligence.modelRouting.accuracy !== undefined) {
      totalScore += this.results.intelligence.modelRouting.accuracy * weights.modelRouting;
      totalWeight += weights.modelRouting;
    }

    // Compression score
    if (this.results.intelligence.compression.spaceSavings !== undefined) {
      totalScore += this.results.intelligence.compression.spaceSavings * weights.compression;
      totalWeight += weights.compression;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  async generateReport() {
    const reportDir = path.join(__dirname, '..', 'benchmark-results');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const filename = `intelligence-benchmark-${new Date().toISOString().slice(0, 10)}.json`;
    const filepath = path.join(reportDir, filename);
    
    // Calculate overall intelligence score
    this.results.overallScore = this.calculateIntelligenceScore();
    
    fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2));
    
    console.log(`\n📊 Intelligence Benchmark Report saved to: ${filepath}`);
    
    // Generate summary
    console.log('\n🎯 Intelligence Summary:');
    console.log('========================');
    console.log(`🧠 Overall Intelligence Score: ${this.results.overallScore.toFixed(1)}%`);
    console.log('');
    
    if (this.results.intelligence.semanticCaching.hitRate !== undefined) {
      console.log(`🎯 Semantic Caching: ${this.results.intelligence.semanticCaching.hitRate.toFixed(1)}% hit rate`);
    }
    
    if (this.results.intelligence.fastMemory.averageSearchTime !== undefined) {
      console.log(`⚡ Fast Memory: ${this.results.intelligence.fastMemory.averageSearchTime.toFixed(1)}ms avg search`);
    }
    
    if (this.results.intelligence.modelRouting.accuracy !== undefined) {
      console.log(`🎯 Smart Routing: ${this.results.intelligence.modelRouting.accuracy.toFixed(1)}% accuracy`);
    }
    
    if (this.results.intelligence.compression.spaceSavings !== undefined) {
      console.log(`🗜️  Compression: ${this.results.intelligence.compression.spaceSavings.toFixed(1)}% space saved`);
    }
    
    if (this.results.performance.cacheHitRate !== undefined) {
      console.log(`📈 Performance: ${this.results.performance.cacheHitRate.toFixed(1)}% cache hit rate`);
    }
  }

  async run() {
    console.log('🧠 Starting Diren Intelligence Benchmark');
    console.log('==========================================');
    
    // Check if Diren is running
    try {
      const healthResponse = await axios.get(`${this.baseUrl}/health`);
      console.log(`✅ Diren server is running (intelligence features enabled)`);
    } catch (error) {
      console.error(`❌ Cannot connect to Diren server at ${this.baseUrl}`);
      console.error('   Make sure Diren is running: diren start');
      process.exit(1);
    }
    
    // Run intelligence benchmarks
    await this.testSemanticCaching();
    await this.testFastMemoryPerformance(); 
    await this.testSmartModelRouting();
    await this.testCompressionEfficiency();
    await this.testOverallPerformance();
    
    // Generate comprehensive report
    await this.generateReport();
    
    console.log('\n✨ Intelligence benchmark completed!');
    console.log(`🏆 Overall Score: ${this.results.overallScore.toFixed(1)}%`);
  }
}

// Run benchmark if called directly
if (require.main === module) {
  const benchmark = new IntelligenceBenchmark();
  benchmark.run().catch(console.error);
}

module.exports = IntelligenceBenchmark;