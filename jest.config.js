/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/test-setup/**'
  ],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testTimeout: 10000,
  verbose: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleDirectories: ['node_modules', 'src'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // ts-jest config options here
        tsconfig: 'tsconfig.json',
        isolatedModules: true
      }
    ]
  }
};
