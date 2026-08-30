/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
  // Standalone dev scripts (e.g. verify-*.manual.ts) live alongside real test
  // files in __tests__/ but are meant to be run by hand via ts-node against a
  // live testnet, not picked up as Jest suites -- they have no describe/it
  // blocks and fail outright when Jest tries to execute them as one.
  testPathIgnorePatterns: ['/node_modules/', '\\.manual\\.ts$'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/db/migrate.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: [],
};
