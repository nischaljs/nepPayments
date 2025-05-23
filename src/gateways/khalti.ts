import axios, { AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { paymentConfig, API_ENDPOINTS } from '../config';
import { PaymentError, PaymentErrorCode } from '../errors/PaymentError';
import { KhaltiPaymentOptions } from '../types/payment.types';
import { validateAmount, validateUrl, validateRequiredField } from '../utils/validators';

export async function initiateKhaltiPayment(options: KhaltiPaymentOptions): Promise<string> {
  // Validate required fields
  validateAmount(options.amount, 'KHALTI');
  validateUrl(options.returnUrl, 'return', 'KHALTI');
  validateUrl(options.websiteUrl, 'website', 'KHALTI');
  validateRequiredField(options.customerName, 'customerName', 'KHALTI');
  validateRequiredField(options.productIdentity, 'productIdentity', 'KHALTI');
  validateRequiredField(options.productName, 'productName', 'KHALTI');

  const payload = {
    return_url: options.returnUrl,
    website_url: options.websiteUrl,
    amount: options.amount * 100, // convert rupees to paisa
    purchase_order_id: options.purchaseOrderId || options.productIdentity,
    purchase_order_name: options.purchaseOrderName || `Order for ${options.productName}`,
    customer_name: options.customerName,
    customer_email: options.customerEmail || 'customer@example.com',
    customer_phone: options.customerPhone || '98XXXXXXXX',
    merchant_username: paymentConfig.khalti?.secretKey,
    transaction_uuid: uuidv4(),
    product_identity: options.productIdentity,
    product_name: options.productName,
    product_url: options.productUrl || options.websiteUrl
  };

  try {
    if (!paymentConfig.khalti) {
      throw new PaymentError(
        PaymentErrorCode.GATEWAY_NOT_CONFIGURED,
        'Khalti gateway is not configured',
        'KHALTI'
      );
    }

    const response = await axios.post(
      paymentConfig.isTest ? API_ENDPOINTS.KHALTI.TEST : API_ENDPOINTS.KHALTI.LIVE,
      payload,
      {
        headers: {
          Authorization: `Key ${paymentConfig.khalti.publicKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.data?.payment_url) {
      throw new PaymentError(
        PaymentErrorCode.GATEWAY_ERROR,
        'Invalid response from Khalti: payment_url not found',
        'KHALTI'
      );
    }

    return response.data.payment_url;
  } catch (error) {
    if (error instanceof PaymentError) {
      throw error;
    }

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<any>;
      throw new PaymentError(
        PaymentErrorCode.GATEWAY_ERROR,
        axiosError.response?.data?.message || 'Failed to initiate Khalti payment',
        'KHALTI',
        axiosError.response?.data
      );
    }

    throw new PaymentError(
      PaymentErrorCode.UNKNOWN_ERROR,
      'Unknown error occurred while initiating Khalti payment',
      'KHALTI',
      error
    );
  }
}
