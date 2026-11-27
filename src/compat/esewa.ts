import { hmacSha256 } from '../core';
import { ESEWA_ENDPOINTS } from '../gateways/esewa';
import { CompatHttp, isRecord, rethrow } from './http';
import { PaymentError, PaymentErrorCode } from './enums';
import type { EsewaConfig, EsewaPaymentOptions, EsewaPaymentResponse, EsewaVerificationOptions, PaymentVerificationResponse } from './types';

interface StatusCheckResponse {
  product_code: string;
  transaction_uuid: string;
  total_amount: number | string;
  status: 'COMPLETE' | 'PENDING' | 'FULL_REFUND' | 'PARTIAL_REFUND' | 'AMBIGUOUS' | 'NOT_FOUND' | 'CANCELED';
  ref_id: string | null;
}

/**
 * The 2.0.8 eSewa gateway, on the v3 core. Same inputs, outputs and errors as 2.0.8.
 *
 * @example
 * const esewa = new EsewaGateway({ productCode: 'EPAYTEST', secretKey: '8gBm/:&EnhH.1/q', environment: 'sandbox' });
 */
export class EsewaGateway {
  private readonly baseUrl: string;
  private readonly statusCheckUrl: string;
  private readonly productCode: string;
  /** Private fields, so console.log, util.inspect and JSON.stringify never show the key. */
  readonly #secretKey: string;
  readonly #http: CompatHttp;

  constructor(config: EsewaConfig) {
    if (!config || !config.productCode || !config.secretKey) {
      throw new PaymentError('eSewa product code and secret key are required', PaymentErrorCode.INVALID_CONFIG);
    }
    if (config.environment !== undefined && config.environment !== 'sandbox' && config.environment !== 'production') {
      throw new PaymentError(`eSewa environment must be 'sandbox' or 'production', got '${String(config.environment)}'`, PaymentErrorCode.INVALID_CONFIG);
    }
    const hosts = config.environment === 'sandbox' ? ESEWA_ENDPOINTS.sandbox : ESEWA_ENDPOINTS.live;
    // 2.x posted to `${baseUrl}/form`.
    this.baseUrl = hosts.form.replace(/\/form$/, '');
    this.statusCheckUrl = hosts.status;
    this.productCode = config.productCode;
    this.#secretKey = config.secretKey;
    this.#http = new CompatHttp('esewa', [config.secretKey]);
  }

  private generateSignature(data: string): string {
    try {
      return hmacSha256(data, this.#secretKey);
    } catch {
      throw new PaymentError('Failed to generate payment signature', PaymentErrorCode.SIGNATURE_GENERATION_FAILED);
    }
  }

  /**
   * Post the signed form to eSewa from the server and return eSewa's HTML (2.x shape).
   * New code should use `createEsewa().initiate()`, which returns the fields for the browser to post.
   */
  async createPayment(options: EsewaPaymentOptions): Promise<EsewaPaymentResponse> {
    // Input is checked before the try, so bad input never looks like a network error.
    if (!isRecord(options) || !options.transaction_uuid || !options.total_amount) {
      throw new PaymentError('Transaction UUID and total amount are required', PaymentErrorCode.INVALID_PAYMENT_OPTIONS);
    }
    if (typeof options.signed_field_names !== 'string' || options.signed_field_names.trim() === '') {
      throw new PaymentError(
        'signed_field_names is required, for example "total_amount,transaction_uuid,product_code"',
        PaymentErrorCode.INVALID_PAYMENT_OPTIONS
      );
    }
    try {
      const signatureData = options.signed_field_names
        .split(',')
        .map(field => `${field}=${String(options[field as keyof EsewaPaymentOptions])}`)
        .join(',');
      const signature = this.generateSignature(signatureData);
      const form: Record<string, string> = {};
      for (const [key, value] of Object.entries(options)) form[key] = String(value);
      form.signature = signature;

      const res = await this.#http.send(
        { method: 'POST', url: `${this.baseUrl}/form`, form },
        'Failed to create payment',
        PaymentErrorCode.PAYMENT_FAILED,
        s => s >= 200 && s < 400
      );
      if (!res.data || typeof res.data !== 'string') {
        throw new PaymentError('Invalid response from eSewa: Expected HTML form', PaymentErrorCode.INVALID_RESPONSE);
      }
      return { form_html: res.data, transaction_uuid: options.transaction_uuid, signature };
    } catch (error) {
      return rethrow(error, 'Failed to create payment', PaymentErrorCode.PAYMENT_FAILED);
    }
  }

  /**
   * Check an eSewa payment (2.x shape). Pass `expectedAmount` in rupees.
   *
   * @example
   * const r = await payments.esewa.verifyPayment({ transaction_uuid: 'o-1', total_amount: 100, expectedAmount: 100 });
   */
  async verifyPayment(options: EsewaVerificationOptions): Promise<PaymentVerificationResponse> {
    if (!isRecord(options) || !options.transaction_uuid || !options.total_amount) {
      throw new PaymentError('Transaction UUID and total amount are required for verification', PaymentErrorCode.INVALID_VERIFICATION_OPTIONS);
    }
    try {
      const res = await this.#http.send(
        {
          method: 'GET',
          url: this.statusCheckUrl,
          query: { product_code: this.productCode, transaction_uuid: options.transaction_uuid, total_amount: String(options.total_amount) }
        },
        'Failed to verify payment',
        PaymentErrorCode.VERIFICATION_FAILED,
        s => s >= 200 && s < 300
      );
      const payment = res.data as StatusCheckResponse;

      let status: PaymentVerificationResponse['status'];
      switch (payment.status) {
        case 'COMPLETE':
          status = 'COMPLETED';
          break;
        case 'PENDING':
        case 'AMBIGUOUS':
          // eSewa has not settled the payment yet. Pending, not failed, so the
          // buyer is not asked to pay twice. raw_status still says AMBIGUOUS.
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
            { status: res.status, data: payment }
          );
        }
        if (toRupees(payment.total_amount) !== Number(options.expectedAmount)) {
          throw new PaymentError(
            `eSewa amount ${String(payment.total_amount)} does not match the expected amount ${String(options.expectedAmount)} (rupees)`,
            PaymentErrorCode.AMOUNT_MISMATCH,
            { status: res.status, data: payment }
          );
        }
      }

      return { status, transaction_id: payment.ref_id || '', amount: payment.total_amount as number, payment_details: payment, raw_status: payment.status };
    } catch (error) {
      return rethrow(error, 'Failed to verify payment', PaymentErrorCode.VERIFICATION_FAILED);
    }
  }
}

function toRupees(value: number | string): number {
  return typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
}
