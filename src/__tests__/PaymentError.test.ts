import { describe, it, expect } from '@jest/globals';
import { PaymentError, PaymentErrorCode } from '../errors/PaymentError';

describe('PaymentError', () => {
  it('should create error with all properties', () => {
    const error = new PaymentError(
      PaymentErrorCode.INVALID_AMOUNT,
      'Amount cannot be negative',
      'KHALTI',
      { amount: -100 }
    );

    expect(error.code).toBe(PaymentErrorCode.INVALID_AMOUNT);
    expect(error.message).toBe('Amount cannot be negative');
    expect(error.gateway).toBe('KHALTI');
    expect(error.details).toEqual({ amount: -100 });
    expect(error.name).toBe('PaymentError');
    expect(error instanceof Error).toBe(true);
  });

  it('should provide user-friendly messages', () => {
    const cases = [
      {
        error: new PaymentError(PaymentErrorCode.INVALID_AMOUNT, 'test'),
        expected: 'Invalid payment amount. Amount must be greater than 0.'
      },
      {
        error: new PaymentError(PaymentErrorCode.GATEWAY_NOT_CONFIGURED, 'test', 'KHALTI'),
        expected: 'Payment gateway KHALTI is not configured. Run setup script first.'
      },
      {
        error: new PaymentError(PaymentErrorCode.NETWORK_ERROR, 'test'),
        expected: 'Network error occurred. Please check your connection and try again.'
      },
      {
        error: new PaymentError(PaymentErrorCode.UNKNOWN_ERROR, 'Custom message'),
        expected: 'Custom message'
      }
    ];

    cases.forEach(({ error, expected }) => {
      expect(error.friendlyMessage).toBe(expected);
    });
  });

  it('should convert to JSON with all properties', () => {
    const error = new PaymentError(PaymentErrorCode.INVALID_CONFIG, 'Missing API key', 'ESEWA');

    const json = error.toJSON();
    expect(json).toEqual({
      name: 'PaymentError',
      code: PaymentErrorCode.INVALID_CONFIG,
      message: 'Missing API key',
      friendlyMessage: 'Invalid payment configuration. Please check your setup.',
      gateway: 'ESEWA',
      details: undefined
    });
  });
});
