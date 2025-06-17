import axios from 'axios';
import crypto from 'crypto';
import { PaymentError, PaymentErrorCode } from '../types/payment.enums';
import { 
  EsewaConfig, 
  EsewaPaymentOptions, 
  EsewaPaymentResponse,
  EsewaVerificationOptions,
  PaymentVerificationResponse
} from '../types/payment.types';

interface StatusCheckResponse {
  product_code: string;
  transaction_uuid: string;
  total_amount: number;
  status: 'COMPLETE' | 'PENDING' | 'FULL_REFUND' | 'PARTIAL_REFUND' | 'AMBIGUOUS' | 'NOT_FOUND' | 'CANCELED';
  ref_id: string | null;
}

interface ApiError {
  code: number;
  error_message: string;
}

function isApiError(error: unknown): error is ApiError {
  return typeof error === 'object' && error !== null && 
    ('error_message' in error || 'code' in error);
}

/**
 * eSewa payment gateway implementation
 */
export class EsewaGateway {
  private readonly baseUrl: string;

  /**
   * Create a new eSewa gateway instance
   * @param config eSewa configuration
   */
  constructor(private readonly config: EsewaConfig) {
    if (!config.productCode || !config.secretKey) {
      throw new PaymentError(
        'eSewa product code and secret key are required',
        PaymentErrorCode.INVALID_CONFIG
      );
    }

    // Set base URL based on environment
    this.baseUrl = config.environment === 'sandbox'
      ? 'https://rc-epay.esewa.com.np/api/epay/main/v2'
      : 'https://epay.esewa.com.np/api/epay/main/v2';
  }

  /**
   * Generate HMAC signature for the payment
   * @private
   */
  private generateSignature(data: string): string {
    const hmac = crypto.createHmac('sha256', this.config.secretKey);
    hmac.update(data);
    return hmac.digest('base64');
  }

  /**
   * Create a new payment
   * @param options Payment options
   * @returns Payment response with payment URL and transaction UUID
   */
  async createPayment(options: EsewaPaymentOptions): Promise<EsewaPaymentResponse> {
    try {
      // Generate signature
      const signedFields = options.signed_field_names.split(',');
      const signatureData = signedFields
        .map(field => `${field}=${String(options[field as keyof EsewaPaymentOptions])}`)
        .join(',');
      // Log the signature string and payload for debugging
      console.log('eSewa Signature String:', signatureData);
      console.log('eSewa Payload:', options);
      const signature = this.generateSignature(signatureData);

      // Create form data
      const formData = new URLSearchParams();
      Object.entries(options).forEach(([key, value]) => {
        formData.append(key, String(value));
      });
      formData.append('signature', signature);

      // Make request to eSewa
      const response = await axios.post<string>(
        `${this.baseUrl}/form`,
        formData,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      // Extract payment URL from response
      const paymentUrl = response.data;

      return {
        payment_url: paymentUrl,
        transaction_uuid: options.transaction_uuid,
        signature
      };
    } catch (error: any) {
      // Log the error response for debugging
      if (error.response) {
        console.error('eSewa API Error:', error.response.status, error.response.data);
      } else if (error.request) {
        console.error('eSewa API No Response:', error.request);
      } else {
        console.error('eSewa API Error:', error.message);
      }
      if (isApiError(error)) {
        throw new PaymentError(
          error.error_message || 'Failed to create payment',
          PaymentErrorCode.PAYMENT_FAILED
        );
      }
      throw new PaymentError('Failed to create payment', PaymentErrorCode.PAYMENT_FAILED);
    }
  }

  /**
   * Verify a payment
   * @param options Verification options
   * @returns Payment verification response
   */
  async verifyPayment(options: EsewaVerificationOptions): Promise<PaymentVerificationResponse> {
    try {
      const response = await axios.get<StatusCheckResponse>(
        `${this.baseUrl}/transaction/status`,
        {
          params: {
            product_code: options.product_code,
            transaction_uuid: options.transaction_uuid,
            total_amount: options.total_amount
          }
        }
      );

      const payment = response.data;

      // Map eSewa status to normalized status
      let status: PaymentVerificationResponse['status'];
      switch (payment.status) {
        case 'COMPLETE':
          status = 'COMPLETED';
          break;
        case 'PENDING':
          status = 'PENDING';
          break;
        case 'FULL_REFUND':
        case 'PARTIAL_REFUND':
        case 'CANCELED':
          status = 'CANCELED';
          break;
        default:
          status = 'FAILED';
      }

      return {
        status,
        transaction_id: payment.ref_id || '',
        amount: payment.total_amount,
        payment_details: payment
      };
    } catch (error) {
      if (isApiError(error)) {
        throw new PaymentError(
          error.error_message || 'Failed to verify payment',
          PaymentErrorCode.VERIFICATION_FAILED
        );
      }
      throw new PaymentError('Failed to verify payment', PaymentErrorCode.VERIFICATION_FAILED);
    }
  }
}
