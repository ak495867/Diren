module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**/*'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/jest.setup.ts'],
  testTimeout: 60000,
  maxWorkers: 1, // Run tests sequentially to avoid port conflicts
  verbose: true,
  collectCoverage: false, // Set to true when running coverage reports
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json'
    }
  }
};