import { describe, it, expect, jest } from '@jest/globals';
import axios from 'axios';
import { initiateEsewaPayment } from '../gateways/esewa';
import { verifyEsewaPayment } from '../gateways/verification';
import { PaymentError } from '../errors/PaymentError';

// Mock modules
jest.mock('../config');
jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('eSewa Gateway', () => {
  const validPaymentOptions = {
    amount: 1000,
    taxAmount: 50,
    productCode: 'EPAYTEST',
    successUrl: 'https://example.com/success',
    failureUrl: 'https://example.com/failure'
  };

  describe('initiateEsewaPayment', () => {
    it('should generate valid HTML form', () => {
      const result = initiateEsewaPayment(validPaymentOptions);

      // Normalize whitespace for comparison
      const normalizedResult = result.replace(/\s+/g, ' ').trim();

      expect(normalizedResult).toContain('<form id="esewaForm"');
      expect(normalizedResult).toContain('method="POST"');
      expect(normalizedResult).toContain(
        `name="amount" value="${validPaymentOptions.amount.toFixed(2)}"`
      );
      expect(normalizedResult).toContain(
        `name="tax_amount" value="${validPaymentOptions.taxAmount.toFixed(2)}"`
      );
      expect(normalizedResult).toContain(
        `name="success_url" value="${validPaymentOptions.successUrl}"`
      );
      expect(normalizedResult).toContain(
        `name="failure_url" value="${validPaymentOptions.failureUrl}"`
      );
      expect(normalizedResult).toContain(
        `name="product_code" value="${validPaymentOptions.productCode}"`
      );
      expect(normalizedResult).toContain('name="signature"');
    });

    it('should include optional charges when provided', () => {
      const result = initiateEsewaPayment({
        ...validPaymentOptions,
        productServiceCharge: 50,
        productDeliveryCharge: 100
      });

      const normalizedResult = result.replace(/\s+/g, ' ').trim();

      expect(normalizedResult).toContain('name="product_service_charge" value="50.00"');
      expect(normalizedResult).toContain('name="product_delivery_charge" value="100.00"');
    });

    it('should throw PaymentError for invalid amount', () => {
      expect(() =>
        initiateEsewaPayment({
          ...validPaymentOptions,
          amount: -100
        })
      ).toThrow(PaymentError);
    });

    it('should throw PaymentError for invalid URLs', () => {
      expect(() =>
        initiateEsewaPayment({
          ...validPaymentOptions,
          successUrl: 'invalid-url'
        })
      ).toThrow(PaymentError);
    });
  });

  describe('verifyEsewaPayment', () => {
    const validVerificationParams = {
      oid: 'test_order',
      amt: '1000',
      refId: 'test_ref'
    };

    it('should successfully verify payment', async () => {
      const mockResponse = {
        data: {
          success: true,
          message: 'Payment successful'
        }
      };
      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await verifyEsewaPayment(validVerificationParams);

      expect(result.success).toBe(true);
      expect(result.amount).toBe(1000);
      expect(result.status).toBe('completed');
    });

    it('should handle failed payments', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          success: false,
          message: 'Payment failed'
        }
      });

      const result = await verifyEsewaPayment(validVerificationParams);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
    });

    it('should throw PaymentError for verification errors', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: {
          data: { message: 'Invalid reference ID' }
        }
      });

      await expect(verifyEsewaPayment(validVerificationParams)).rejects.toThrow(PaymentError);
    });
  });
});
