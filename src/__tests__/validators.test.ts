import { describe, expect, it } from '@jest/globals';
import { PaymentError } from '../errors/PaymentError';
import { validateAmount, validateRequiredField, validateUrl } from '../utils/validators';

describe('Validators', () => {
  describe('validateAmount', () => {
    it('should accept valid positive amounts', () => {
      expect(() => validateAmount(100, 'TEST')).not.toThrow();
      expect(() => validateAmount(0.5, 'TEST')).not.toThrow();
    });

    it('should reject negative amounts', () => {
      expect(() => validateAmount(-100, 'TEST')).toThrow(PaymentError);
    });

    it('should reject zero amount', () => {
      expect(() => validateAmount(0, 'TEST')).toThrow(PaymentError);
    });

    it('should reject NaN', () => {
      expect(() => validateAmount(NaN, 'TEST')).toThrow(PaymentError);
    });
  });

  describe('validateUrl', () => {
    it('should accept valid URLs', () => {
      expect(() => validateUrl('https://example.com', 'return', 'TEST')).not.toThrow();
      expect(() => validateUrl('http://localhost:3000/callback', 'return', 'TEST')).not.toThrow();
    });

    it('should reject invalid URLs', () => {
      expect(() => validateUrl('not-a-url', 'return', 'TEST')).toThrow(PaymentError);
      expect(() => validateUrl('', 'return', 'TEST')).toThrow(PaymentError);
    });
  });

  describe('validateRequiredField', () => {
    it('should accept valid non-empty values', () => {
      expect(() => validateRequiredField('test', 'field', 'TEST')).not.toThrow();
      expect(() => validateRequiredField(123, 'field', 'TEST')).not.toThrow();
      expect(() => validateRequiredField(true, 'field', 'TEST')).not.toThrow();
    });

    it('should reject undefined values', () => {
      expect(() => validateRequiredField(undefined, 'field', 'TEST')).toThrow(PaymentError);
    });

    it('should reject null values', () => {
      expect(() => validateRequiredField(null, 'field', 'TEST')).toThrow(PaymentError);
    });

    it('should reject empty strings', () => {
      expect(() => validateRequiredField('', 'field', 'TEST')).toThrow(PaymentError);
    });
  });
});
