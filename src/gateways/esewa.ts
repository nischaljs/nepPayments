import axios from 'axios';
import crypto from 'crypto';
import { isRecord, toPaymentError } from '../utils/httpError';
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
  private readonly productCode: string;
  /** Held in a private field so console.log, util.inspect and JSON.stringify never show it. */
  readonly #secretKey: string;

  /**
   * Create a new eSewa gateway instance
   * @param config eSewa configuration
   */
  constructor(config: EsewaConfig) {
    if (!config || !config.productCode || !config.secretKey) {
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

    this.productCode = config.productCode;
    this.#secretKey = config.secretKey;

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
      const hmac = crypto.createHmac('sha256', this.#secretKey);
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
    if (!isRecord(options) || !options.transaction_uuid || !options.total_amount) {
      throw new PaymentError(
        'Transaction UUID and total amount are required',
        PaymentErrorCode.INVALID_PAYMENT_OPTIONS
      );
    }
    if (typeof options.signed_field_names !== 'string' || options.signed_field_names.trim() === '') {
      throw new PaymentError(
        'signed_field_names is required, for example "total_amount,transaction_uuid,product_code"',
        PaymentErrorCode.INVALID_PAYMENT_OPTIONS
      );
    }

    try {
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
    if (!isRecord(options) || !options.transaction_uuid || !options.total_amount) {
      throw new PaymentError(
        'Transaction UUID and total amount are required for verification',
        PaymentErrorCode.INVALID_VERIFICATION_OPTIONS
      );
    }

    try {
      const response = await axios.get<StatusCheckResponse>(
        this.statusCheckUrl,
        {
          params: {
            product_code: this.productCode,
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
        case 'AMBIGUOUS':
          // AMBIGUOUS means eSewa has not settled the payment yet. Treat it as
          // pending, not failed, so the buyer is not asked to pay twice.
          status = 'PENDING';
          break;
        case 'FULL_REFUND':
        case 'PARTIAL_REFUND':
        case 'CANCELED':
          status = 'CANCELED';
          break;
        default:
          // NOT_FOUND and any status eSewa adds later.
          status = 'FAILED';
      }

      // Only a completed payment has an amount worth checking.
      if (options.expectedAmount !== undefined && status === 'COMPLETED') {
        if (typeof payment.total_amount !== 'number' && typeof payment.total_amount !== 'string') {
          throw new PaymentError(
            'eSewa marked the payment complete but sent no amount, so it cannot be checked against the expected amount',
            PaymentErrorCode.INVALID_RESPONSE,
            { status: response.status, data: payment }
          );
        }
        if (toRupees(payment.total_amount) !== Number(options.expectedAmount)) {
          throw new PaymentError(
            `eSewa amount ${String(payment.total_amount)} does not match the expected amount ${String(options.expectedAmount)} (rupees)`,
            PaymentErrorCode.AMOUNT_MISMATCH,
            { status: response.status, data: payment }
          );
        }
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
