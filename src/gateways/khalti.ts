import axios from 'axios';
import { isRecord, toPaymentError } from '../utils/httpError';
import { PaymentError, PaymentErrorCode } from '../types/payment.enums';
import { 
  KhaltiConfig, 
  KhaltiPaymentOptions, 
  KhaltiPaymentResponse,
  KhaltiVerificationOptions,
  PaymentVerificationResponse
} from '../types/payment.types';

interface KhaltiApiResponse {
  pidx: string;
  payment_url: string;
  expires_at: string;
  expires_in: number;
}

interface KhaltiLookupResponse {
  pidx?: string;
  total_amount?: number;
  amount?: number;
  status?: string;
  transaction_id?: string | null;
  [key: string]: unknown;
}

/**
 * Khalti lookup statuses mapped to the 2.x status values.
 * Refunded and Partially Refunded keep the old value FAILED; read raw_status to tell them apart.
 */
const STATUS_MAP: Record<string, PaymentVerificationResponse['status']> = {
  'COMPLETED': 'COMPLETED',
  'PENDING': 'PENDING',
  'INITIATED': 'PENDING',
  'EXPIRED': 'EXPIRED',
  'USER CANCELED': 'CANCELED',
  'CANCELED': 'CANCELED',
  'REFUNDED': 'FAILED',
  'PARTIALLY REFUNDED': 'FAILED'
};

/**
 * Khalti payment gateway implementation
 */
export class KhaltiGateway {
  private readonly baseUrl: string;
  /** Held in a private field so console.log, util.inspect and JSON.stringify never show it. */
  readonly #secretKey: string;

  /**
   * Create a new Khalti gateway instance
   * @param config Khalti configuration
   */
  constructor(config: KhaltiConfig) {
    if (!config || !config.secretKey) {
      throw new PaymentError(
        'Khalti secret key is required',
        PaymentErrorCode.INVALID_CONFIG
      );
    }

    if (config.environment !== undefined && config.environment !== 'sandbox' && config.environment !== 'production') {
      throw new PaymentError(
        `Khalti environment must be 'sandbox' or 'production', got '${String(config.environment)}'`,
        PaymentErrorCode.INVALID_CONFIG
      );
    }

    this.#secretKey = config.secretKey;

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
    if (!isRecord(options)) {
      throw new PaymentError('Payment options must be an object', PaymentErrorCode.INVALID_PAYMENT_OPTIONS);
    }

    // Validate amount
    // A numeric string (as from a form body) is accepted, as in 2.0.7, and sent unchanged.
    const raw: unknown = options.amount;
    const amount =
      typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
    if (!Number.isFinite(amount)) {
      throw new PaymentError('Amount must be a number in paisa', PaymentErrorCode.INVALID_AMOUNT);
    }
    if (amount < 1000) {
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
    if (options.amount_breakdown != null) {
      if (!Array.isArray(options.amount_breakdown) || !options.amount_breakdown.every(isRecord)) {
        throw new PaymentError('amount_breakdown must be an array of { label, amount }', PaymentErrorCode.INVALID_PAYMENT_OPTIONS);
      }
      const total = options.amount_breakdown.reduce((sum, item) => sum + item.amount, 0);
      if (total !== amount) {
        throw new PaymentError(
          'Sum of amount_breakdown amounts must equal the total amount',
          PaymentErrorCode.INVALID_AMOUNT
        );
      }
    }

    // Validate product details if provided
    if (options.product_details != null) {
      if (!Array.isArray(options.product_details) || !options.product_details.every(isRecord)) {
        throw new PaymentError('product_details must be an array of products', PaymentErrorCode.INVALID_PAYMENT_OPTIONS);
      }
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
    this.validatePaymentOptions(options);

    try {
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
            Authorization: `Key ${this.#secretKey}`
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
      throw toPaymentError(error, 'Failed to create payment', PaymentErrorCode.PAYMENT_FAILED);
    }
  }

  /**
   * Verify a payment
   * @param options Verification options
   * @returns Payment verification response
   */
  async verifyPayment(options: KhaltiVerificationOptions): Promise<PaymentVerificationResponse> {
    let payment: KhaltiLookupResponse;
    let httpStatus = 200;
    try {
      const response = await axios.post(
        `${this.baseUrl}/epayment/lookup/`,
        {
          pidx: options.pidx
        },
        {
          headers: {
            Authorization: `Key ${this.#secretKey}`
          }
        }
      );
      payment = response.data as KhaltiLookupResponse;
      httpStatus = response.status;
    } catch (error) {
      // Khalti answers HTTP 400 for Expired and User canceled payments. Those are statuses, not errors.
      const body = (error as { response?: { status?: number; data?: unknown } } | null)?.response;
      if (body && body.status === 400 && isRecord(body.data) && typeof body.data.status === 'string') {
        payment = body.data as KhaltiLookupResponse;
        httpStatus = 400;
      } else {
        throw toPaymentError(error, 'Failed to verify payment', PaymentErrorCode.VERIFICATION_FAILED);
      }
    }

    const rawStatus = typeof payment.status === 'string' ? payment.status : '';
    const status = STATUS_MAP[rawStatus.toUpperCase()] || 'FAILED';
    const amount = (payment.total_amount ?? payment.amount) as number;

    // Only a completed payment has an amount worth checking.
    if (options.expectedAmount !== undefined && status === 'COMPLETED') {
      if (typeof amount !== 'number' && typeof amount !== 'string') {
        throw new PaymentError(
          'Khalti marked the payment completed but sent no amount, so it cannot be checked against the expected amount',
          PaymentErrorCode.INVALID_RESPONSE,
          { status: httpStatus, data: payment }
        );
      }
      if (Number(amount) !== Number(options.expectedAmount)) {
        throw new PaymentError(
          `Khalti amount ${String(amount)} does not match the expected amount ${String(options.expectedAmount)} (paisa)`,
          PaymentErrorCode.AMOUNT_MISMATCH,
          { status: httpStatus, data: payment }
        );
      }
    }

    return {
      status,
      transaction_id: typeof payment.transaction_id === 'string' ? payment.transaction_id : '',
      amount,
      payment_details: payment,
      raw_status: rawStatus
    };
  }
}
