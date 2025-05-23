import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import axios from 'axios';
import { initiateFonepayPayment } from '../gateways/fonepay';
import { verifyFonepayPayment } from '../gateways/verification';
import { PaymentError } from '../errors/PaymentError';

// Mock modules
jest.mock('../config');
jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Fonepay Gateway', () => {
  const validPaymentOptions = {
    customerName: 'John Doe',
    amount: 1000,
    transactionId: 'TRANS123',
    returnUrl: 'https://example.com/return'
  };

  describe('initiateFonepayPayment', () => {
    beforeEach(() => {
      mockedAxios.post.mockReset();
    });

    it('should successfully initiate payment', async () => {
      const mockResponse = {
        data: {
          paymentUrl: 'https://fonepay.com/pay/123'
        }
      };
      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await initiateFonepayPayment(validPaymentOptions);
      expect(result).toBe(mockResponse.data.paymentUrl);
    });

    it('should send correct payload', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { paymentUrl: 'test' }
      });

      await initiateFonepayPayment(validPaymentOptions);

      const requestPayload = mockedAxios.post.mock.calls[0][1];
      expect(requestPayload).toMatchObject({
        PRN: validPaymentOptions.transactionId,
        AMT: validPaymentOptions.amount.toFixed(2),
        CRN: validPaymentOptions.customerName,
        RU: validPaymentOptions.returnUrl
      });
    });

    it('should throw PaymentError for invalid amount', async () => {
      await expect(
        initiateFonepayPayment({
          ...validPaymentOptions,
          amount: -100
        })
      ).rejects.toThrow(PaymentError);
    });

    it('should throw PaymentError for invalid URL', async () => {
      await expect(
        initiateFonepayPayment({
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

      await expect(initiateFonepayPayment(validPaymentOptions)).rejects.toThrow(PaymentError);
    });
  });

  describe('verifyFonepayPayment', () => {
    const validVerificationParams = {
      PRN: 'TEST_PRN',
      PID: 'TEST_PID',
      BID: 'TEST_BID',
      AMT: '1000',
      UID: 'TEST_UID',
      DV: 'NPR'
    };

    it('should successfully verify payment', async () => {
      const mockResponse = {
        data: {
          status: 'success',
          message: 'Payment verified'
        }
      };
      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await verifyFonepayPayment(validVerificationParams);

      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.amount).toBe(1000);
    });

    it('should handle failed payments', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          status: 'failed',
          message: 'Payment failed'
        }
      });

      const result = await verifyFonepayPayment(validVerificationParams);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
    });

    it('should throw PaymentError for verification errors', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: {
          data: { message: 'Invalid verification parameters' }
        }
      });

      await expect(verifyFonepayPayment(validVerificationParams)).rejects.toThrow(PaymentError);
    });
  });
});
