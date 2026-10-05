module.exports = {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.test.json' }] },
  moduleNameMapper: {
    '^@subnetiq/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@subnetiq/netcalc$': '<rootDir>/../../packages/netcalc/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts'],
  clearMocks: true,
  restoreMocks: true,
};
