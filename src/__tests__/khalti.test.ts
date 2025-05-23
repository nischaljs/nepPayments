import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import axios from 'axios';
import { PaymentError } from '../errors/PaymentError';
import { initiateKhaltiPayment } from '../gateways/khalti';
import { verifyKhaltiPayment } from '../gateways/verification';

// Mock modules
jest.mock('../config');
jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Khalti Gateway', () => {
  const validPaymentOptions = {
    amount: 1000,
    customerName: 'John Doe',
    customerEmail: 'john@example.com',
    customerPhone: '9841234567',
    productIdentity: 'prod_123',
    productName: 'Test Product',
    returnUrl: 'https://example.com/return',
    websiteUrl: 'https://example.com'
  };

  describe('initiateKhaltiPayment', () => {
    beforeEach(() => {
      mockedAxios.post.mockReset();
    });

    it('should successfully initiate payment', async () => {
      const mockResponse = { data: { payment_url: 'https://khalti.com/pay/123' } };
      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await initiateKhaltiPayment(validPaymentOptions);
      expect(result).toBe(mockResponse.data.payment_url);
    });

    it('should convert amount to paisa', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { payment_url: 'test' } });

      await initiateKhaltiPayment(validPaymentOptions);

      const requestPayload = mockedAxios.post.mock.calls[0][1] as { amount: number };
      expect(requestPayload.amount).toBe(validPaymentOptions.amount * 100);
    });

    it('should throw PaymentError for invalid amount', async () => {
      await expect(
        initiateKhaltiPayment({
          ...validPaymentOptions,
          amount: -100
        })
      ).rejects.toThrow(PaymentError);
    });

    it('should throw PaymentError for invalid URLs', async () => {
      await expect(
        initiateKhaltiPayment({
          ...validPaymentOptions,
          returnUrl: 'invalid-url'
        })
      ).rejects.toThrow(PaymentError);
    });

    it('should handle gateway errors', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: {
          data: { message: 'Invalid merchant' }
        }
      });

      await expect(initiateKhaltiPayment(validPaymentOptions)).rejects.toThrow(PaymentError);
    });
  });

  describe('verifyKhaltiPayment', () => {
    const validVerificationParams = {
      pidx: 'test_pidx',
      transaction_id: 'test_transaction'
    };

    it('should successfully verify payment', async () => {
      const mockResponse = {
        data: {
          status: 'Completed',
          amount: 100000, // in paisa
          transaction_id: 'test_transaction'
        }
      };
      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await verifyKhaltiPayment(validVerificationParams);

      expect(result.success).toBe(true);
      expect(result.amount).toBe(1000); // should be converted to rupees
      expect(result.status).toBe('completed');
    });

    it('should handle failed payments', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          status: 'Failed',
          amount: 100000,
          transaction_id: 'test_transaction'
        }
      });

      const result = await verifyKhaltiPayment(validVerificationParams);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
    });

    it('should throw PaymentError for verification errors', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: {
          data: { message: 'Invalid pidx' }
        }
      });

      await expect(verifyKhaltiPayment(validVerificationParams)).rejects.toThrow(PaymentError);
    });
  });
});
