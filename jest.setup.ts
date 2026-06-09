import '@testing-library/jest-dom'

// Mock AbortSignal for Node.js environment
if (!global.AbortSignal) {
  global.AbortSignal = {
    timeout: (ms: number) => ({
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      aborted: false,
    }),
  } as any;
}

// Mock fetch for tests
global.fetch = jest.fn();

// Suppress console warnings during tests
const originalWarn = console.warn;
beforeEach(() => {
  console.warn = jest.fn();
});

afterEach(() => {
  console.warn = originalWarn;
});
