const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    // Handle module aliases (this will be automatically configured for you based on your tsconfig.json paths)
    '^@/(.*)$': '<rootDir>/$1',
  },
  testEnvironment: 'jest-environment-jsdom',
  // Deno-native Edge Function tests run in the dedicated CI job.
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/supabase/functions/', '/e2e/'],
  collectCoverageFrom: [
    'lib/**/*.{js,ts,tsx}',
    'app/api/**/*.{js,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  // Ratchet at the current baseline: CI runs coverage and refuses regressions.
  // Raise these numbers as route-handler integration coverage expands.
  coverageThreshold: {
    global: {
      statements: 18,
      branches: 14.5,
      functions: 24,
      lines: 19,
    },
  },
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
