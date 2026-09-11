#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');
const path = require('path');

class DirenBenchmark {
  constructor() {
    this.baseUrl = process.env.DIREN_URL || 'http://localhost:3000';
    this.results = {
      timestamp: new Date().toISOString(),
      tests: []
    };
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async makeRequest(provider, model, message, iteration = 1) {
    const requestBody = {
      model: model,
      messages: [
        { role: 'user', content: `${message} (test ${iteration})` }
      ],
      max_tokens: 100,
      temperature: 0.7
    };

    const startTime = Date.now();
    
    try {
      const response = await axios.post(`${this.baseUrl}/v1/chat/completions`, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'X-Diren-Provider': provider
        },
        timeout: 30000
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      return {
        success: true,
        responseTime,
        status: response.status,
        provider,
        model,
        cached: response.headers['x-diren-cached'] === 'true',
        tokens: response.data.usage?.total_tokens || 0
      };
    } catch (error) {
      const endTime = Date.now();
      return {
        success: false,
        responseTime: endTime - startTime,
        error: error.message,
        status: error.response?.status || 0,
        provider,
        model
      };
    }
  }

  async testCachePerformance() {
    console.log('\n🧪 Testing Cache Performance...');
    
    const testCases = [
      { provider: 'openai', model: 'gpt-3.5-turbo', message: 'What is the capital of France?' },
      { provider: 'anthropic', model: 'claude-3-haiku-20240307', message: 'Explain quantum computing briefly' },
      { provider: 'groq', model: 'mixtral-8x7b-32768', message: 'Write a hello world in Python' }
    ];

    for (const testCase of testCases) {
      console.log(`\n📡 Testing ${testCase.provider} - ${testCase.model}`);
      
      // First request (should hit API)
      const firstRequest = await this.makeRequest(
        testCase.provider, 
        testCase.model, 
        testCase.message, 
        1
      );
      
      if (firstRequest.success) {
        console.log(`   First request: ${firstRequest.responseTime}ms (API call)`);
        
        // Wait a moment
        await this.delay(1000);
        
        // Second identical request (should hit cache)
        const secondRequest = await this.makeRequest(
          testCase.provider,
          testCase.model,
          testCase.message,
          1 // Same iteration to ensure cache hit
        );
        
        if (secondRequest.success) {
          const speedup = Math.round((firstRequest.responseTime / secondRequest.responseTime) * 10) / 10;
          console.log(`   Cached request: ${secondRequest.responseTime}ms (${speedup}x faster)`);
          
          this.results.tests.push({
            testType: 'cache_performance',
            provider: testCase.provider,
            model: testCase.model,
            firstRequestTime: firstRequest.responseTime,
            cachedRequestTime: secondRequest.responseTime,
            speedupFactor: speedup,
            tokens: firstRequest.tokens
          });
        } else {
          console.log(`   ❌ Cache test failed: ${secondRequest.error}`);
        }
      } else {
        console.log(`   ❌ First request failed: ${firstRequest.error}`);
      }
    }
  }

  async testCompressionEfficiency() {
    console.log('\n🗜️  Testing Compression Efficiency...');
    
    try {
      const analyticsResponse = await axios.get(`${this.baseUrl}/api/analytics`);
      const analytics = analyticsResponse.data;
      
      if (analytics.cache && analytics.cache.avg_compression_ratio) {
        const compressionRatio = analytics.cache.avg_compression_ratio;
        const spaceSavings = ((1 - compressionRatio) * 100).toFixed(1);
        
        console.log(`   Average compression ratio: ${compressionRatio.toFixed(3)}`);
        console.log(`   Space savings: ${spaceSavings}%`);
        
        this.results.tests.push({
          testType: 'compression_efficiency',
          compressionRatio,
          spaceSavingsPercent: parseFloat(spaceSavings),
          totalEntries: analytics.cache.total_entries || 0,
          compressedEntries: analytics.cache.compressed_entries || 0
        });
      }
    } catch (error) {
      console.log(`   ❌ Failed to get compression stats: ${error.message}`);
    }
  }

  async testCostSavings() {
    console.log('\n💰 Testing Cost Savings...');
    
    try {
      const analyticsResponse = await axios.get(`${this.baseUrl}/api/analytics`);
      const analytics = analyticsResponse.data;
      
      const totalRequests = analytics.totalRequests || 0;
      const cacheHits = analytics.cacheHits || 0;
      const estimatedSavings = analytics.estimatedSavings || 0;
      const totalCost = analytics.totalCost || 0;
      
      const cacheHitRate = totalRequests > 0 ? (cacheHits / totalRequests * 100).toFixed(1) : '0';
      const totalValue = totalCost + estimatedSavings;
      const savingsRate = totalValue > 0 ? (estimatedSavings / totalValue * 100).toFixed(1) : '0';
      
      console.log(`   Total requests: ${totalRequests}`);
      console.log(`   Cache hit rate: ${cacheHitRate}%`);
      console.log(`   Money saved: $${estimatedSavings.toFixed(4)}`);
      console.log(`   Savings rate: ${savingsRate}%`);
      
      this.results.tests.push({
        testType: 'cost_savings',
        totalRequests,
        cacheHitRate: parseFloat(cacheHitRate),
        estimatedSavings,
        totalCost,
        savingsRate: parseFloat(savingsRate)
      });
      
    } catch (error) {
      console.log(`   ❌ Failed to get cost savings: ${error.message}`);
    }
  }

  async testLoadPerformance() {
    console.log('\n⚡ Testing Load Performance...');
    
    const concurrentRequests = 10;
    const testMessage = 'Generate a random number between 1 and 1000';
    
    console.log(`   Making ${concurrentRequests} concurrent requests...`);
    
    const startTime = Date.now();
    const promises = Array.from({ length: concurrentRequests }, (_, i) => 
      this.makeRequest('openai', 'gpt-3.5-turbo', testMessage, i)
    );
    
    const results = await Promise.all(promises);
    const endTime = Date.now();
    
    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;
    const avgResponseTime = results
      .filter(r => r.success)
      .reduce((sum, r) => sum + r.responseTime, 0) / successful;
    
    console.log(`   Total time: ${endTime - startTime}ms`);
    console.log(`   Successful: ${successful}/${concurrentRequests}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Average response time: ${Math.round(avgResponseTime)}ms`);
    
    this.results.tests.push({
      testType: 'load_performance',
      concurrentRequests,
      successful,
      failed,
      totalTime: endTime - startTime,
      averageResponseTime: Math.round(avgResponseTime)
    });
  }

  async generateReport() {
    const reportDir = path.join(__dirname, '..', 'benchmark-results');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const filename = `benchmark-${new Date().toISOString().slice(0, 10)}.json`;
    const filepath = path.join(reportDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2));
    
    console.log(`\n📊 Benchmark report saved to: ${filepath}`);
    
    // Generate summary
    console.log('\n📈 Benchmark Summary:');
    console.log('===================');
    
    this.results.tests.forEach(test => {
      switch (test.testType) {
        case 'cache_performance':
          console.log(`🏃 ${test.provider}: ${test.speedupFactor}x speedup from caching`);
          break;
        case 'compression_efficiency':
          console.log(`🗜️  Compression: ${test.spaceSavingsPercent}% space savings`);
          break;
        case 'cost_savings':
          console.log(`💰 Cost: ${test.cacheHitRate}% hit rate, $${test.estimatedSavings.toFixed(4)} saved`);
          break;
        case 'load_performance':
          console.log(`⚡ Load: ${test.successful}/${test.concurrentRequests} successful, ${test.averageResponseTime}ms avg`);
          break;
      }
    });
  }

  async run() {
    console.log('🚀 Starting Diren Performance Benchmark');
    console.log('=======================================');
    
    // Check if Diren is running
    try {
      const healthResponse = await axios.get(`${this.baseUrl}/health`);
      console.log(`✅ Diren server is running (v${healthResponse.data.version || 'unknown'})`);
    } catch (error) {
      console.error(`❌ Cannot connect to Diren server at ${this.baseUrl}`);
      console.error('   Make sure Diren is running: diren start');
      process.exit(1);
    }
    
    // Run all benchmark tests
    await this.testCachePerformance();
    await this.testCompressionEfficiency();
    await this.testCostSavings();
    await this.testLoadPerformance();
    
    // Generate report
    await this.generateReport();
    
    console.log('\n✨ Benchmark completed!');
  }
}

// Run benchmark if called directly
if (require.main === module) {
  const benchmark = new DirenBenchmark();
  benchmark.run().catch(console.error);
}

module.exports = DirenBenchmark;