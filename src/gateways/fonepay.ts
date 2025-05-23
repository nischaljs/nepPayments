import axios, { AxiosError } from 'axios';
import { paymentConfig, API_ENDPOINTS } from '../config';
import { FonepayPaymentOptions } from '../types/payment.types';
import { PaymentError, PaymentErrorCode } from '../errors/PaymentError';
import { validateAmount, validateUrl, validateRequiredField } from '../utils/validators';

export async function initiateFonepayPayment(options: FonepayPaymentOptions): Promise<string> {
  // Validate required fields
  validateAmount(options.amount, 'FONEPAY');
  validateUrl(options.returnUrl, 'return', 'FONEPAY');
  validateRequiredField(options.customerName, 'customerName', 'FONEPAY');
  validateRequiredField(options.transactionId, 'transactionId', 'FONEPAY');

  if (!paymentConfig.fonepay) {
    throw new PaymentError(
      PaymentErrorCode.GATEWAY_NOT_CONFIGURED,
      'Fonepay gateway is not configured',
      'FONEPAY'
    );
  }

  const { customerName, amount, transactionId, returnUrl } = options;

  const payload = {
    PRN: transactionId,
    PID: paymentConfig.fonepay.merchantId,
    AMT: amount.toFixed(2),
    CRN: customerName,
    RU: returnUrl,
    DV: 'NPR', // Currency
    R1: 'Payment for products/services',
    R2: '', // Optional remarks
    MD: 'P' // Payment mode
  };

  try {
    const response = await axios.post(
      paymentConfig.isTest ? API_ENDPOINTS.FONEPAY.TEST : API_ENDPOINTS.FONEPAY.LIVE,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${paymentConfig.fonepay.secretKey}`
        }
      }
    );

    if (!response.data?.paymentUrl) {
      throw new PaymentError(
        PaymentErrorCode.GATEWAY_ERROR,
        'Invalid response from Fonepay: paymentUrl not found',
        'FONEPAY'
      );
    }

    return response.data.paymentUrl;
  } catch (error) {
    if (error instanceof PaymentError) {
      throw error;
    }

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<any>;
      throw new PaymentError(
        PaymentErrorCode.GATEWAY_ERROR,
        axiosError.response?.data?.message || 'Failed to initiate Fonepay payment',
        'FONEPAY',
        axiosError.response?.data
      );
    }

    throw new PaymentError(
      PaymentErrorCode.UNKNOWN_ERROR,
      'Unknown error occurred while initiating Fonepay payment',
      'FONEPAY',
      error
    );
  }
}
