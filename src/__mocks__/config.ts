import { jest } from '@jest/globals';
import type { PaymentConfig } from '../config';
import { PaymentGateway, PaymentStatus } from '../types/payment.enums';

export { PaymentGateway, PaymentStatus };

export const API_ENDPOINTS = {
  [PaymentGateway.KHALTI]: {
    TEST: 'https://test-api.khalti.com/api/v2',
    LIVE: 'https://api.khalti.com/api/v2'
  },
  [PaymentGateway.ESEWA]: {
    TEST: 'https://uat.esewa.com.np/epay/main',
    LIVE: 'https://esewa.com.np/epay/main'
  },
  [PaymentGateway.FONEPAY]: {
    TEST: 'https://dev-clientapi.fonepay.com/api/merchantRequest',
    LIVE: 'https://clientapi.fonepay.com/api/merchantRequest'
  }
};

export const paymentConfig: PaymentConfig = {
  isTest: true,
  khalti: {
    secretKey: 'test_secret_key_dc74e0fd57cb46cd93832aee0a507256',
    publicKey: 'test_public_key_dc74e0fd57cb46cd93832aee0a390775'
  },
  esewa: {
    merchantCode: 'EPAYTEST',
    merchantSecret: '8gBm/:&EnhH.1/q'
  },
  fonepay: {
    merchantId: 'TEST_MERCHANT',
    secretKey: 'test_secret_key'
  }
};

// Reset mocks before each test
beforeEach(() => {
  jest.resetModules();
  Object.assign(paymentConfig, {
    isTest: true,
    khalti: {
      secretKey: 'test_secret_key_dc74e0fd57cb46cd93832aee0a507256',
      publicKey: 'test_public_key_dc74e0fd57cb46cd93832aee0a390775'
    },
    esewa: {
      merchantCode: 'EPAYTEST',
      merchantSecret: '8gBm/:&EnhH.1/q'
    },
    fonepay: {
      merchantId: 'TEST_MERCHANT',
      secretKey: 'test_secret_key'
    }
  });
});
