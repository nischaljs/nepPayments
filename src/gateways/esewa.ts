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

function isApiError(error: any): error is ApiError {
  return error && typeof error.code === 'number' && typeof error.error_message === 'string';
}

/**
 * eSewa payment gateway implementation
 */
export class EsewaGateway {
  private readonly baseUrl: string;
  private readonly statusCheckUrl: string;

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

    // Set base URLs based on environment
    if (config.environment === 'sandbox') {
      this.baseUrl = 'https://rc-epay.esewa.com.np/api/epay/main/v2';
      this.statusCheckUrl = 'https://rc.esewa.com.np/api/epay/transaction/status/';
    } else {
      this.baseUrl = 'https://epay.esewa.com.np/api/epay/main/v2';
      this.statusCheckUrl = 'https://esewa.com.np/api/epay/transaction/status/';
    }
  }

  /**
   * Generate HMAC signature for the payment
   * @private
   */
  private generateSignature(data: string): string {
    try {
      const hmac = crypto.createHmac('sha256', this.config.secretKey);
      hmac.update(data);
      return hmac.digest('base64');
    } catch (error) {
      console.error('Error generating signature:', error);
      throw new PaymentError(
        'Failed to generate payment signature',
        PaymentErrorCode.SIGNATURE_GENERATION_FAILED
      );
    }
  }

  /**
   * Create a new payment
   * @param options Payment options
   * @returns Payment response with form HTML and transaction UUID
   */
  async createPayment(options: EsewaPaymentOptions): Promise<EsewaPaymentResponse> {
    try {
      // Validate required fields
      if (!options.transaction_uuid || !options.total_amount) {
        throw new PaymentError(
          'Transaction UUID and total amount are required',
          PaymentErrorCode.INVALID_PAYMENT_OPTIONS
        );
      }

      // Generate signature
      const signedFields = options.signed_field_names.split(',');
      const signatureData = signedFields
        .map(field => `${field}=${String(options[field as keyof EsewaPaymentOptions])}`)
        .join(',');
      
      const signature = this.generateSignature(signatureData);

      // Create form data
      const formData = new URLSearchParams();
      Object.entries(options).forEach(([key, value]) => {
        formData.append(key, String(value));
      });
      formData.append('signature', signature);

      // Make request to eSewa
      const response = await axios.post(
        `${this.baseUrl}/form`,
        formData,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          validateStatus: (status: number) => status >= 200 && status < 400
        }
      );

      // Check if we got a valid HTML response
      if (!response.data || typeof response.data !== 'string') {
        throw new PaymentError(
          'Invalid response from eSewa: Expected HTML form',
          PaymentErrorCode.INVALID_RESPONSE
        );
      }

      // Return the form HTML and transaction details
      return {
        form_html: response.data,
        transaction_uuid: options.transaction_uuid,
        signature
      };
    } catch (error: any) {
      if (error instanceof PaymentError) {
        throw error;
      }
      
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
      // Validate required fields
      if (!options.transaction_uuid || !options.total_amount) {
        throw new PaymentError(
          'Transaction UUID and total amount are required for verification',
          PaymentErrorCode.INVALID_VERIFICATION_OPTIONS
        );
      }

      const response = await axios.get<StatusCheckResponse>(
        this.statusCheckUrl,
        {
          params: {
            product_code: this.config.productCode,
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
      if (error instanceof PaymentError) {
        throw error;
      }

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
