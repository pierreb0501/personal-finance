import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'node',
  transform: {
    // jose (used for session JWTs) ships ESM-only with no CJS build, so it
    // needs to be transformed too — not just project source files.
    '^.+\\.(t|j)sx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', allowJs: true } }],
  },
  transformIgnorePatterns: ['node_modules/(?!(jose)/)'],
  moduleNameMapper: {
    '^server-only$': '<rootDir>/__mocks__/server-only.ts',
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
}

export default config
