import axios from 'axios';
import { PaymentError, PaymentErrorCode } from '../types/payment.enums';
import { 
  KhaltiConfig, 
  KhaltiPaymentOptions, 
  KhaltiPaymentResponse,
  KhaltiVerificationOptions,
  PaymentVerificationResponse
} from '../types/payment.types';

interface ApiError {
  error_key?: string;
  detail?: string;
  [key: string]: any;
}

interface KhaltiApiResponse {
  pidx: string;
  payment_url: string;
  expires_at: string;
  expires_in: number;
}

interface KhaltiVerificationApiResponse {
  status: string;
  transaction_id: string;
  amount: number;
  [key: string]: any;
}

function isApiError(error: unknown): error is ApiError {
  return typeof error === 'object' && error !== null && 
    ('error_key' in error || 'detail' in error);
}

/**
 * Khalti payment gateway implementation
 */
export class KhaltiGateway {
  private readonly baseUrl: string;

  /**
   * Create a new Khalti gateway instance
   * @param config Khalti configuration
   */
  constructor(private readonly config: KhaltiConfig) {
    if (!config.secretKey) {
      throw new PaymentError(
        'Khalti secret key is required',
        PaymentErrorCode.INVALID_CONFIG
      );
    }

    // Set base URL based on environment
    this.baseUrl = config.environment === 'sandbox'
      ? 'https://dev.khalti.com/api/v2'
      : 'https://khalti.com/api/v2';
  }

  /**
   * Validate payment options
   * @private
   */
  private validatePaymentOptions(options: KhaltiPaymentOptions): void {
    // Validate amount
    if (options.amount < 1000) {
      throw new PaymentError(
        'Amount should be greater than Rs. 10 (1000 paisa)',
        PaymentErrorCode.INVALID_AMOUNT
      );
    }

    // Validate URLs
    if (!options.return_url || !options.website_url) {
      throw new PaymentError(
        'return_url and website_url are required',
        PaymentErrorCode.INVALID_URL
      );
    }

    try {
      new URL(options.return_url);
      new URL(options.website_url);
    } catch {
      throw new PaymentError(
        'Invalid return_url or website_url',
        PaymentErrorCode.INVALID_URL
      );
    }

    // Validate amount breakdown if provided
    if (options.amount_breakdown) {
      const total = options.amount_breakdown.reduce((sum, item) => sum + item.amount, 0);
      if (total !== options.amount) {
        throw new PaymentError(
          'Sum of amount_breakdown amounts must equal the total amount',
          PaymentErrorCode.INVALID_AMOUNT
        );
      }
    }

    // Validate product details if provided
    if (options.product_details) {
      for (const product of options.product_details) {
        if (product.total_price !== product.unit_price * product.quantity) {
          throw new PaymentError(
            'Product total_price must equal unit_price * quantity',
            PaymentErrorCode.INVALID_AMOUNT
          );
        }
      }
    }
  }

  /**
   * Create a new payment
   * @param options Payment options
   * @returns Payment response with payment URL and ID
   */
  async createPayment(options: KhaltiPaymentOptions): Promise<KhaltiPaymentResponse> {
    try {
      // Validate options
      this.validatePaymentOptions(options);

      const response = await axios.post(
        `${this.baseUrl}/epayment/initiate/`,
        {
          amount: options.amount,
          purchase_order_id: options.purchase_order_id,
          purchase_order_name: options.purchase_order_name,
          return_url: options.return_url,
          website_url: options.website_url,
          customer_info: options.customer_info,
          amount_breakdown: options.amount_breakdown,
          product_details: options.product_details,
          merchant_username: options.merchant_username,
          merchant_extra: options.merchant_extra
        },
        {
          headers: {
            Authorization: `Key ${this.config.secretKey}`
          }
        }
      );

      const data = response.data as KhaltiApiResponse;
      return {
        pidx: data.pidx,
        payment_url: data.payment_url,
        expires_at: data.expires_at,
        expires_in: data.expires_in
      };
    } catch (error) {
      if (isApiError(error)) {
        if (error.error_key === 'validation_error') {
          throw new PaymentError(
            Object.values(error).filter(v => typeof v === 'string').join(', '),
            PaymentErrorCode.VALIDATION_ERROR
          );
        }
        throw new PaymentError(
          error.detail || 'Failed to create payment',
          PaymentErrorCode.PAYMENT_FAILED
        );
      }
      throw error;
    }
  }

  /**
   * Verify a payment
   * @param options Verification options
   * @returns Payment verification response
   */
  async verifyPayment(options: KhaltiVerificationOptions): Promise<PaymentVerificationResponse> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/epayment/lookup/`,
        {
          pidx: options.pidx
        },
        {
          headers: {
            Authorization: `Key ${this.config.secretKey}`
          }
        }
      );

      const payment = response.data as KhaltiVerificationApiResponse;
      const allowedStatuses = ['COMPLETED', 'FAILED', 'PENDING', 'EXPIRED', 'CANCELED'] as const;
      let status = (payment.status || '').toUpperCase();
      if (!allowedStatuses.includes(status as any)) {
        status = 'FAILED';
      }
      return {
        status: status as PaymentVerificationResponse['status'],
        transaction_id: payment.transaction_id,
        amount: payment.amount,
        payment_details: payment
      };
    } catch (error) {
      if (isApiError(error)) {
        if (error.error_key === 'validation_error') {
          throw new PaymentError(
            Object.values(error).filter(v => typeof v === 'string').join(', '),
            PaymentErrorCode.VALIDATION_ERROR
          );
        }
        throw new PaymentError(
          error.detail || 'Failed to verify payment',
          PaymentErrorCode.VERIFICATION_FAILED
        );
      }
      throw error;
    }
  }
}
