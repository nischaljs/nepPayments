import type { GatewayName } from './types';

/**
 * Every error code the library throws.
 *
 * - `INVALID_CONFIG`: a config field is missing or wrong. The message names the field and the fix.
 * - `INVALID_INPUT`: an argument to a method is missing or wrong.
 * - `AMOUNT_MISMATCH`: the gateway's amount is not the amount you expected.
 * - `ORDER_MISMATCH`: the gateway's order id is not the order id you expected.
 * - `INVALID_SIGNATURE`: a callback's signature does not match.
 * - `AUTH_ERROR`: the gateway rejected your credentials.
 * - `GATEWAY_ERROR`: the gateway answered with an error.
 * - `INVALID_RESPONSE`: the gateway's answer is not in the documented shape.
 * - `NETWORK_ERROR` / `TIMEOUT`: the gateway did not answer.
 * - `NOT_SUPPORTED`: the gateway or the mode has no such operation.
 */
export type PaymentErrorCode =
  | 'INVALID_CONFIG'
  | 'INVALID_INPUT'
  | 'AMOUNT_MISMATCH'
  | 'ORDER_MISMATCH'
  | 'INVALID_SIGNATURE'
  | 'AUTH_ERROR'
  | 'GATEWAY_ERROR'
  | 'INVALID_RESPONSE'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'NOT_SUPPORTED';

export interface PaymentErrorInit {
  code: PaymentErrorCode;
  message: string;
  gateway?: GatewayName;
  /** The config or input field at fault, such as `khalti.secretKey`. */
  field?: string;
  /** The gateway's HTTP status and body, when it answered. Never the request. */
  response?: { status: number; data: unknown };
}

/**
 * The one error class. It never holds request headers, config or secrets,
 * so it is safe to log and to send to an error tracker.
 *
 * @example
 * try {
 *   await payments.khalti.verify({ ref, expectedAmount, expectedOrderId });
 * } catch (err) {
 *   if (err instanceof PaymentError && err.code === 'AMOUNT_MISMATCH') flagOrder(orderId);
 *   throw err;
 * }
 */
export class PaymentError extends Error {
  readonly code: PaymentErrorCode;
  readonly gateway?: GatewayName;
  readonly field?: string;
  readonly response?: { status: number; data: unknown };

  constructor(init: PaymentErrorInit) {
    super(init.message);
    this.name = 'PaymentError';
    this.code = init.code;
    if (init.gateway) this.gateway = init.gateway;
    if (init.field) this.field = init.field;
    if (init.response) this.response = { status: init.response.status, data: init.response.data };
  }

  toJSON(): PaymentErrorInit & { name: string } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      gateway: this.gateway,
      field: this.field,
      response: this.response
    };
  }
}

/**
 * True when `err` is a PaymentError, also across two copies of the library.
 *
 * @example
 * try { await payments.khalti.verify(input); } catch (e) { if (isPaymentError(e) && e.code === 'AMOUNT_MISMATCH') refuse(); else throw e; }
 */
export function isPaymentError(err: unknown): err is PaymentError {
  return err instanceof PaymentError || (err instanceof Error && err.name === 'PaymentError' && 'code' in err);
}
