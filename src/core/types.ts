import type { Paisa } from './money';

/** The gateways this library has plugs for. */
export type GatewayName = 'khalti' | 'esewa' | 'connectips' | 'hamropay';

/**
 * Where calls go.
 * - `sandbox`: the gateway's test hosts.
 * - `live`: real money.
 * - `mock`: no network and no keys; results follow `mockOutcome`.
 */
export type Mode = 'sandbox' | 'live' | 'mock';

/** The outcome a mock payment takes. */
export type MockOutcome = 'paid' | 'pending' | 'failed';

/**
 * Payment states. Every state is a returned value, never a throw.
 * Only `paid` means the money arrived. `ambiguous` means the gateway itself
 * is not sure (eSewa AMBIGUOUS) or answered a state this library does not know;
 * do not ship the order, check again later.
 */
export type PaymentStatus = 'paid' | 'pending' | 'failed' | 'canceled' | 'refunded' | 'expired' | 'ambiguous';

/** Send the buyer to this URL (Khalti). */
export interface RedirectStart {
  kind: 'redirect';
  url: string;
}

/** Render this as an auto-submitting HTML form (eSewa, ConnectIPS, Hamro Pay). */
export interface FormStart {
  kind: 'form';
  action: string;
  method: 'POST';
  fields: Record<string, string>;
}

/** Reserved for QR gateways. No plug returns it yet. */
export interface QrStart {
  kind: 'qr';
  payload: string;
  poll: { ref: string; intervalMs: number };
}

/** What `initiate` returns: how to send the buyer to the gateway, plus the ref to store with your order. */
export type InitiateResult = (RedirectStart | FormStart | QrStart) & {
  gateway: GatewayName;
  /** Store this with your order. Pass it to `verify` later. */
  ref: string;
  /** ISO time the payment link expires, when the gateway says. */
  expiresAt?: string;
  /** The gateway's own answer, secrets removed. */
  raw: unknown;
};

/** What every `verify` takes. */
export interface VerifyInput {
  /** The ref from `initiate` (Khalti pidx, eSewa transaction_uuid, ConnectIPS TXNID, Hamro Pay merchantTxnId). */
  ref: string;
  /** The amount you charged, from your own database. Never from the callback. */
  expectedAmount: Paisa;
  /** Your order id, from your own database. */
  expectedOrderId: string;
}

/** What every `verify` returns. */
export interface VerifyResult {
  gateway: GatewayName;
  status: PaymentStatus;
  /** Same as `status === 'paid'`. */
  paid: boolean;
  ref: string;
  /** The gateway's order id. `null` when the gateway does not report one (Khalti lookup). */
  orderId: string | null;
  /** The gateway's amount. `null` only when the gateway reports none for an unpaid state. */
  amount: Paisa | null;
  /** The gateway's transaction id, when there is one. */
  transactionId: string | null;
  /** Which checks ran: the amount always when the gateway reports one; the order id when the gateway reports one. */
  checked: { amount: boolean; orderId: boolean };
  /** The gateway's own status word, unchanged. */
  rawStatus: string;
  /** The gateway's full answer, secrets removed. */
  raw: unknown;
}

/** What `parseCallback` returns. A callback is a hint; call `verify` before you ship. */
export interface CallbackResult {
  gateway: GatewayName;
  ref: string;
  orderId: string | null;
  status: PaymentStatus;
  amount: Paisa | null;
  transactionId: string | null;
  /** True when the library checked the gateway's signature on this callback. */
  signed: boolean;
  rawStatus: string;
  raw: unknown;
}

/** What `status` returns: the same as verify, without your expected values checked. */
export type StatusResult = Omit<VerifyResult, 'checked'>;

/** What `refund` returns. */
export interface RefundResult {
  gateway: GatewayName;
  ok: true;
  raw: unknown;
}

/** Options every gateway client takes besides its own config. */
export interface CommonOptions {
  mode: Mode;
  /** Milliseconds before a call to the gateway gives up. Default 15000. */
  timeoutMs?: number;
  /** A fetch to use instead of the global one, for tests (see `nepal-payments/testing`). */
  fetch?: typeof fetch;
}

/** Fields every `initiate` input may carry. */
export interface InitiateCommon {
  /** Mock mode only: the outcome this payment takes. Ignored in sandbox and live. Default `paid`. */
  mockOutcome?: MockOutcome;
}
