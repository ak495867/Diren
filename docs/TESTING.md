# Diren Testing Guide

This document provides comprehensive information about testing the Diren AI API cost optimization tool.

## Test Suite Overview

Diren includes a multi-layered testing strategy covering unit tests, integration tests, end-to-end tests, and performance benchmarks.

### Test Categories

#### 1. Unit Tests
- **SemanticScorer**: NLP-based similarity detection and intent analysis
- **FastMemoryStore**: In-memory semantic search and caching
- **ModelPool**: Intelligent model selection and routing
- **CacheManager**: Multi-level caching with compression
- **ConfigManager**: Provider configuration and tool integration
- **Analytics**: Usage tracking and cost calculation

#### 2. Integration Tests
- **Cache Integration**: End-to-end caching workflow with semantic matching
- **Proxy Integration**: Request handling, provider routing, and error resilience

#### 3. End-to-End (E2E) Tests
- **System E2E**: Complete request lifecycle with real-world scenarios
- **Multi-Provider**: OpenAI, Anthropic, and smart routing integration
- **Performance**: Load testing and concurrent request handling
- **Intelligence**: Semantic caching and fast memory performance

#### 4. Performance Benchmarks
- **Intelligence Benchmark**: Semantic matching, memory performance, compression
- **Standard Benchmark**: Cache performance, throughput, and response times

## Running Tests

### Prerequisites

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

### Test Commands

```bash
# Run all tests
npm test

# Run specific test categories
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests only
npm run test:e2e         # End-to-end tests only

# Run tests with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch

# Run comprehensive test suite
npm run test:all
```

### Advanced Testing

```bash
# Run tests with custom configuration
npx jest --config jest.config.js --verbose

# Run specific test files
npx jest SemanticScorer.test.ts
npx jest --testPathPattern=integration

# Run tests matching pattern
npx jest --testNamePattern="cache"
```

## Test Script Usage

The comprehensive test runner script provides advanced testing options:

```bash
# Make script executable
chmod +x scripts/run-tests.sh

# Run all tests with reporting
./scripts/run-tests.sh --all --report

# Run specific test categories
./scripts/run-tests.sh --unit --coverage
./scripts/run-tests.sh --e2e --performance

# Clean test environment
./scripts/run-tests.sh --clean

# Skip build step (faster for repeated runs)
SKIP_BUILD=true ./scripts/run-tests.sh --integration
```

### Script Options

- `--unit, -u`: Run only unit tests
- `--integration, -i`: Run only integration tests  
- `--e2e, -e`: Run only end-to-end tests
- `--performance, -p`: Run performance benchmarks
- `--coverage, -c`: Generate coverage report
- `--all, -a`: Run complete test suite (default)
- `--clean`: Clean test environment and coverage
- `--skip-build`: Skip project build step
- `--report`: Generate comprehensive test report
- `--help, -h`: Show help message

## Performance Benchmarks

### Intelligence Benchmark

Tests the AI intelligence features:

```bash
# Run intelligence benchmark
node scripts/intelligence-benchmark.js

# Or via npm
npm run intelligence-benchmark
```

**Benchmarks Include:**
- **Semantic Caching**: Measures similarity detection accuracy and cache hit rates
- **Fast Memory**: Tests sub-millisecond retrieval performance
- **Model Routing**: Evaluates intelligent model selection accuracy
- **Compression**: Measures storage efficiency and decompression speed

### Standard Benchmark

Tests basic performance metrics:

```bash
# Run standard benchmark
node scripts/benchmark.js

# Or via npm
npm run benchmark
```

**Benchmarks Include:**
- **Cache Performance**: Response time comparison (hits vs misses)
- **Throughput**: Concurrent request handling capacity
- **Cost Tracking**: Savings calculation accuracy
- **Load Testing**: Performance under high request volume

## Test Configuration

### Environment Variables

```bash
# Test configuration
export NODE_ENV=test
export TEST_PORT=3001
export LOG_LEVEL=error

# Skip build during development
export SKIP_BUILD=true

# Clean coverage on exit
export CLEAN_COVERAGE=true
```

### Jest Configuration

Key configuration in `jest.config.js`:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 60000,
  maxWorkers: 1, // Sequential execution to avoid port conflicts
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/jest.setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/__tests__/**/*'
  ]
};
```

## Test Structure

### Test File Organization

```
src/__tests__/
├── setup.ts                      # Test environment utilities
├── jest.setup.ts                 # Jest configuration and matchers
├── SemanticScorer.test.ts         # Unit: Semantic analysis
├── FastMemoryStore.test.ts        # Unit: Memory performance
├── ModelPool.test.ts              # Unit: Model routing
├── CacheManager.test.ts           # Unit: Basic caching
├── ConfigManager.test.ts          # Unit: Configuration management
├── Analytics.test.ts              # Unit: Usage tracking
├── CacheManager.integration.test.ts # Integration: Advanced caching
├── ProxyHandler.integration.test.ts # Integration: Request handling
└── system.e2e.test.ts             # E2E: Full system testing
```

### Test Environment

The `TestEnvironment` class provides:
- Isolated test database and configuration
- Mock API responses and providers
- Test data generators and utilities
- Cleanup and teardown management

```typescript
// Example usage in tests
const testEnv = new TestEnvironment();
await testEnv.setup();

const server = await testEnv.startServer();
const response = await fetch(`${testEnv.getServerUrl()}/v1/chat/completions`);

await testEnv.teardown();
```

## Expected Test Results

### Unit Tests
- **Pass Rate**: 100% for all core components
- **Coverage**: >90% line coverage for critical paths
- **Performance**: <50ms average test execution time

### Integration Tests
- **Cache Integration**: 90%+ semantic similarity detection
- **Proxy Integration**: All provider formats handled correctly
- **Error Handling**: Graceful degradation under failure conditions

### E2E Tests
- **Cache Hit Rate**: >80% for similar requests
- **Response Time**: <100ms for cache hits, <2s for API calls
- **Concurrency**: Handle 20+ concurrent requests efficiently
- **Memory Usage**: Efficient with proper cleanup

### Performance Benchmarks
- **Semantic Matching**: >85% accuracy for similar content
- **Memory Retrieval**: <1ms average search time
- **Compression**: >70% average space savings
- **Intelligence Score**: >90% overall system intelligence

## Test Data and Mocking

### Mock Providers

Tests use mocked HTTP responses to simulate AI provider APIs:

```typescript
// Mock OpenAI response
mockedAxios.post.mockResolvedValue({
  data: {
    choices: [{ message: { role: 'assistant', content: 'Mock response' } }],
    usage: { total_tokens: 25 }
  },
  status: 200
});
```

### Test Data Generators

Utility functions for generating test data:

```typescript
// Generate semantic variations for testing
const variations = generateCodeVariations();
// ['Write a Python function', 'Create Python code', ...]

const analysisVariations = generateAnalysisVariations();
// ['Analyze the pros and cons', 'Compare advantages', ...]
```

## Debugging Tests

### Common Issues

1. **Port Conflicts**: Use `TEST_PORT` environment variable
2. **Database Locks**: Tests run sequentially (maxWorkers: 1)
3. **Mock Cleanup**: Reset mocks in beforeEach hooks
4. **Async Timing**: Use proper await/async patterns

### Debug Commands

```bash
# Run tests with debug output
DEBUG=* npm test

# Run single test with detailed logs
npx jest SemanticScorer.test.ts --verbose --no-cache

# Debug test setup
node --inspect-brk node_modules/.bin/jest --runInBand
```

### Log Analysis

Tests generate minimal logs by default. Enable detailed logging:

```bash
# Enable debug logging
LOG_LEVEL=debug npm test

# View test artifacts
ls -la test-data/
ls -la benchmark-results/
ls -la coverage/
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Diren Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm ci
      - run: npm run build
      - run: npm run test:all
      - run: npm run test:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
```

### Test Metrics

Track these metrics in CI:
- Test pass rate (should be 100%)
- Code coverage (target >90%)
- Performance benchmarks (regression detection)
- Intelligence scores (quality metrics)

## Contributing Tests

### Writing New Tests

1. Follow the existing test structure and naming conventions
2. Use the `TestEnvironment` class for setup and teardown
3. Mock external dependencies (APIs, file system)
4. Include both positive and negative test cases
5. Test error conditions and edge cases

### Test Guidelines

- **Isolation**: Each test should be independent
- **Clarity**: Test names should describe behavior clearly
- **Coverage**: Test both success and failure paths
- **Performance**: Keep test execution time reasonable
- **Maintainability**: Use helper functions for common operations

### Adding New Test Categories

When adding new components:

1. Create unit tests for the component
2. Add integration tests if it interacts with other components
3. Include E2E tests for user-facing features
4. Add performance benchmarks for critical paths
5. Update this documentation

## Troubleshooting

### Common Test Failures

**Database Connection Issues**
```bash
# Clean test database
rm -rf test-data/
npm test
```

**Port Already in Use**
```bash
# Kill processes on test port
lsof -ti:3001 | xargs kill -9
npm test
```

**Memory Leaks in Tests**
```bash
# Run with heap inspection
node --inspect node_modules/.bin/jest --detectOpenHandles --forceExit
```

**Timeout Issues**
```bash
# Increase timeout for slow tests
JEST_TIMEOUT=120000 npm test
```

### Getting Help

- Check the test logs for specific error messages
- Verify all dependencies are installed: `npm ci`
- Ensure the project builds successfully: `npm run build`  
- Run a single test to isolate issues: `npx jest SpecificTest.test.ts`
- Clean the test environment: `./scripts/run-tests.sh --clean`

For persistent issues, please open an issue on the GitHub repository with:
- Test command that's failing
- Complete error output
- Environment information (OS, Node version)
- Steps to reproduce the issue