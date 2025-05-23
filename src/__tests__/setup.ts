import { beforeAll, afterAll, beforeEach, jest } from '@jest/globals';

// Save original env
const originalEnv = { ...process.env };

// Mock environment variables with actual sandbox credentials
beforeAll(() => {
  process.env.NODE_ENV = 'development'; // Set test mode
  process.env.KHALTI_SECRET_KEY = 'test_secret_key_dc74e0fd57cb46cd93832aee0a507256';
  process.env.KHALTI_PUBLIC_KEY = 'test_public_key_dc74e0fd57cb46cd93832aee0a390775';
  process.env.ESEWA_MERCHANT_CODE = 'EPAYTEST';
  process.env.ESEWA_MERCHANT_SECRET = '8gBm/:&EnhH.1/q';
  process.env.FONEPAY_MERCHANT_ID = 'TEST_MERCHANT';
  process.env.FONEPAY_SECRET_KEY = 'test_secret_key';
});

// Restore original env after all tests
afterAll(() => {
  process.env = { ...originalEnv };
});

// Mock axios
jest.mock('axios');

// Reset mocks and restore env vars before each test
beforeEach(() => {
  jest.clearAllMocks();
});

describe('Test environment', () => {
  it('should be properly configured', () => {
    expect(true).toBeTruthy();
  });
});

// This file is only for test setup, not a test suite
export {};
