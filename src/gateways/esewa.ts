import axios from 'axios';
import crypto from 'crypto';
import { toPaymentError } from '../utils/httpError';
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
  total_amount: number | string;
  status: 'COMPLETE' | 'PENDING' | 'FULL_REFUND' | 'PARTIAL_REFUND' | 'AMBIGUOUS' | 'NOT_FOUND' | 'CANCELED';
  ref_id: string | null;
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

    if (config.environment !== undefined && config.environment !== 'sandbox' && config.environment !== 'production') {
      throw new PaymentError(
        `eSewa environment must be 'sandbox' or 'production', got '${String(config.environment)}'`,
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
    } catch {
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
    } catch (error) {
      throw toPaymentError(error, 'Failed to create payment', PaymentErrorCode.PAYMENT_FAILED);
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

      if (options.expectedAmount !== undefined && toRupees(payment.total_amount) !== Number(options.expectedAmount)) {
        throw new PaymentError(
          `eSewa amount ${String(payment.total_amount)} does not match the expected amount ${String(options.expectedAmount)} (rupees)`,
          PaymentErrorCode.AMOUNT_MISMATCH,
          { status: response.status, data: payment }
        );
      }

      return {
        status,
        transaction_id: payment.ref_id || '',
        amount: payment.total_amount as number,
        payment_details: payment,
        raw_status: payment.status
      };
    } catch (error) {
      throw toPaymentError(error, 'Failed to verify payment', PaymentErrorCode.VERIFICATION_FAILED);
    }
  }
}

/** eSewa may format amounts with thousands separators, such as "1,000.0". */
function toRupees(value: number | string): number {
  return typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
}
