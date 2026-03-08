module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/workflows'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'workflows/**/*.ts',
    '!workflows/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
