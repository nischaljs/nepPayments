import { KHALTI_ENDPOINTS } from '../gateways/khalti';
import { CompatHttp, isRecord, responseError, rethrow } from './http';
import { PaymentError, PaymentErrorCode } from './enums';
import type { KhaltiConfig, KhaltiPaymentOptions, KhaltiPaymentResponse, KhaltiVerificationOptions, PaymentVerificationResponse } from './types';

interface KhaltiLookupResponse {
  pidx?: string;
  total_amount?: number;
  amount?: number;
  status?: string;
  transaction_id?: string | null;
  [key: string]: unknown;
}

const STATUS_MAP: Record<string, PaymentVerificationResponse['status']> = {
  COMPLETED: 'COMPLETED',
  PENDING: 'PENDING',
  INITIATED: 'PENDING',
  EXPIRED: 'EXPIRED',
  'USER CANCELED': 'CANCELED',
  CANCELED: 'CANCELED',
  REFUNDED: 'FAILED',
  'PARTIALLY REFUNDED': 'FAILED'
};

/**
 * The 2.0.7 Khalti gateway, on the v3 core. Same inputs, outputs and errors as 2.0.7.
 *
 * @example
 * const khalti = new KhaltiGateway({ secretKey: process.env.KHALTI_SECRET_KEY!, environment: 'sandbox' });
 */
export class KhaltiGateway {
  private readonly baseUrl: string;
  private readonly http: CompatHttp;
  private readonly secretKey!: string;

  constructor(config: KhaltiConfig) {
    if (!config.secretKey) {
      throw new PaymentError('Khalti secret key is required', PaymentErrorCode.INVALID_CONFIG);
    }
    if (config.environment !== undefined && config.environment !== 'sandbox' && config.environment !== 'production') {
      throw new PaymentError(`Khalti environment must be 'sandbox' or 'production', got '${String(config.environment)}'`, PaymentErrorCode.INVALID_CONFIG);
    }
    // 2.x: no environment means production.
    this.baseUrl = config.environment === 'sandbox' ? KHALTI_ENDPOINTS.sandbox.api : KHALTI_ENDPOINTS.live.api;
    // Kept off the instance's enumerable fields so util.inspect does not print it.
    Object.defineProperty(this, 'secretKey', { value: config.secretKey, enumerable: false });
    this.http = new CompatHttp('khalti', [config.secretKey]);
  }

  private validatePaymentOptions(options: KhaltiPaymentOptions): void {
    if (options.amount < 1000) {
      throw new PaymentError('Amount should be greater than Rs. 10 (1000 paisa)', PaymentErrorCode.INVALID_AMOUNT);
    }
    if (!options.return_url || !options.website_url) {
      throw new PaymentError('return_url and website_url are required', PaymentErrorCode.INVALID_URL);
    }
    try {
      new URL(options.return_url);
      new URL(options.website_url);
    } catch {
      throw new PaymentError('Invalid return_url or website_url', PaymentErrorCode.INVALID_URL);
    }
    if (options.amount_breakdown) {
      const total = options.amount_breakdown.reduce((sum, item) => sum + item.amount, 0);
      if (total !== options.amount) {
        throw new PaymentError('Sum of amount_breakdown amounts must equal the total amount', PaymentErrorCode.INVALID_AMOUNT);
      }
    }
    if (options.product_details) {
      for (const product of options.product_details) {
        if (product.total_price !== product.unit_price * product.quantity) {
          throw new PaymentError('Product total_price must equal unit_price * quantity', PaymentErrorCode.INVALID_AMOUNT);
        }
      }
    }
  }

  /**
   * Start a Khalti payment (2.x shape).
   *
   * @example
   * const { pidx, payment_url } = await payments.khalti.createPayment({ amount: 1000, purchase_order_id: 'o-1',
   *   purchase_order_name: 'Tea', return_url: 'https://shop.example/paid', website_url: 'https://shop.example' });
   */
  async createPayment(options: KhaltiPaymentOptions): Promise<KhaltiPaymentResponse> {
    try {
      this.validatePaymentOptions(options);
      const res = await this.http.send(
        {
          method: 'POST',
          url: `${this.baseUrl}/epayment/initiate/`,
          headers: { authorization: `Key ${this.secretKey}` },
          json: {
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
          }
        },
        'Failed to create payment',
        PaymentErrorCode.PAYMENT_FAILED,
        s => s >= 200 && s < 300
      );
      const data = res.data as KhaltiPaymentResponse;
      return { pidx: data.pidx, payment_url: data.payment_url, expires_at: data.expires_at, expires_in: data.expires_in };
    } catch (error) {
      return rethrow(error, 'Failed to create payment');
    }
  }

  /**
   * Look up a Khalti payment (2.x shape). Pass `expectedAmount` in paisa.
   *
   * @example
   * const r = await payments.khalti.verifyPayment({ pidx, expectedAmount: 1000 });
   * if (r.status === 'COMPLETED') shipOrder();
   */
  async verifyPayment(options: KhaltiVerificationOptions): Promise<PaymentVerificationResponse> {
    let payment: KhaltiLookupResponse;
    let httpStatus = 200;
    try {
      const res = await this.http.send(
        { method: 'POST', url: `${this.baseUrl}/epayment/lookup/`, headers: { authorization: `Key ${this.secretKey}` }, json: { pidx: options.pidx } },
        'Failed to verify payment',
        PaymentErrorCode.VERIFICATION_FAILED,
        // Khalti answers HTTP 400 for Expired and User canceled payments. Those are statuses, not errors.
        s => (s >= 200 && s < 300) || s === 400
      );
      if (res.status === 400 && !(isRecord(res.data) && typeof res.data.status === 'string')) {
        throw responseError(res.status, res.data, 'Failed to verify payment', PaymentErrorCode.VERIFICATION_FAILED);
      }
      payment = res.data as KhaltiLookupResponse;
      httpStatus = res.status;
    } catch (error) {
      return rethrow(error, 'Failed to verify payment');
    }

    const rawStatus = typeof payment.status === 'string' ? payment.status : '';
    const status = STATUS_MAP[rawStatus.toUpperCase()] || 'FAILED';
    const amount = (payment.total_amount ?? payment.amount) as number;

    if (options.expectedAmount !== undefined && Number(amount) !== Number(options.expectedAmount)) {
      throw new PaymentError(
        `Khalti amount ${String(amount)} does not match the expected amount ${String(options.expectedAmount)} (paisa)`,
        PaymentErrorCode.AMOUNT_MISMATCH,
        { status: httpStatus, data: payment }
      );
    }

    return { status, transaction_id: payment.transaction_id as string, amount, payment_details: payment, raw_status: rawStatus };
  }
}
