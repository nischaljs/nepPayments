import { paisa, tryPaisa, type Paisa, type Plug, type PlugContext, type PaymentStatus, type PlugVerify } from '../../core';

/** Khalti config. */
export interface KhaltiConfig {
  /** The live or test secret key from the Khalti merchant dashboard. Sent as `Authorization: Key <secretKey>`. */
  secretKey: string;
  /** Override the hosts, for example to point tests at a fake server. */
  endpoints?: Partial<KhaltiEndpoints>;
}

export interface KhaltiEndpoints {
  /** ePayment API base, such as `https://dev.khalti.com/api/v2`. */
  api: string;
  /** Merchant API base for refunds, such as `https://dev.khalti.com/api`. */
  merchant: string;
}

export const KHALTI_ENDPOINTS: { sandbox: KhaltiEndpoints; live: KhaltiEndpoints } = {
  sandbox: { api: 'https://dev.khalti.com/api/v2', merchant: 'https://dev.khalti.com/api' },
  live: { api: 'https://khalti.com/api/v2', merchant: 'https://khalti.com/api' }
};

/** Khalti's smallest payment: Rs 10. */
export const KHALTI_MIN_AMOUNT = 1000 as Paisa;

export interface KhaltiInitiateInput {
  /** Amount in paisa. At least 1000 (Rs 10). */
  amount: Paisa;
  /** Your unique order id (Khalti `purchase_order_id`). */
  orderId: string;
  /** Order name shown to the buyer (Khalti `purchase_order_name`). */
  orderName: string;
  /** Where Khalti sends the buyer back. Khalti adds pidx, status and the amount as query params. */
  returnUrl: string;
  /** Your site's root URL. */
  websiteUrl: string;
  customer?: { name?: string; email?: string; phone?: string };
  /** Lines that add up to `amount`, each in paisa. */
  amountBreakdown?: Array<{ label: string; amount: Paisa }>;
  productDetails?: Array<{ identity: string; name: string; total_price: Paisa; quantity: number; unit_price: Paisa }>;
  /** Extra fields Khalti echoes back. Each key must start with `merchant_`. */
  merchantExtra?: Record<string, string>;
}

export interface KhaltiRefundInput {
  /** The `transactionId` from verify (Khalti `transaction_id`), not the pidx. */
  transactionId: string;
  /** Paisa, for a partial refund. Leave out for a full refund. */
  amount?: Paisa;
  /** The buyer's Khalti mobile number. Khalti needs it for bank payments. */
  mobile?: string;
}

/** The query Khalti adds to `returnUrl`. A URLSearchParams, a URL or a plain object (Express `req.query`). */
export type KhaltiCallbackInput = URLSearchParams | URL | string | Record<string, unknown>;

const STATUS: Record<string, PaymentStatus> = {
  completed: 'paid',
  pending: 'pending',
  initiated: 'pending',
  expired: 'expired',
  'user canceled': 'canceled',
  refunded: 'refunded',
  'partially refunded': 'refunded'
};

/**
 * Khalti status word to the library's status. Unknown words are `ambiguous`.
 *
 * @example
 * khaltiStatus('User canceled'); // 'canceled'
 */
export function khaltiStatus(raw: string): PaymentStatus {
  return STATUS[raw.trim().toLowerCase()] ?? 'ambiguous';
}

type Ctx = PlugContext<KhaltiConfig, KhaltiEndpoints, undefined>;

function auth(ctx: Ctx) {
  return { authorization: `Key ${ctx.config.secretKey}` };
}

/** Khalti answers HTTP 400 with a status body for Expired and User canceled; that is a state, not an error. */
async function lookup(ctx: Ctx, pidx: string): Promise<PlugVerify> {
  const res = await ctx.http.send({ method: 'POST', url: `${ctx.endpoints.api}/epayment/lookup/`, headers: auth(ctx), json: { pidx } });
  const body = res.data as Record<string, unknown> | null;
  const isState = body && typeof body === 'object' && typeof body.status === 'string';
  if (!(res.status === 200 || (res.status === 400 && isState))) ctx.failFrom(res, 'lookup');
  if (!isState) ctx.fail({ code: 'INVALID_RESPONSE', message: 'Khalti lookup answered with no status.', response: { status: res.status, data: res.data } });
  const rawStatus = String(body!.status);
  const amount = body!.total_amount === undefined || body!.total_amount === null ? null : tryPaisa(body!.total_amount);
  if (body!.total_amount !== undefined && body!.total_amount !== null && amount === null) {
    ctx.fail({ code: 'INVALID_RESPONSE', message: 'Khalti lookup sent a total_amount that is not whole paisa.', response: { status: res.status, data: res.data } });
  }
  return {
    status: khaltiStatus(rawStatus),
    ref: typeof body!.pidx === 'string' ? body!.pidx : pidx,
    orderId: null,
    amount,
    transactionId: typeof body!.transaction_id === 'string' && body!.transaction_id ? body!.transaction_id : null,
    rawStatus,
    raw: body
  };
}

function params(input: KhaltiCallbackInput): Record<string, string> {
  let sp: URLSearchParams;
  if (input instanceof URLSearchParams) sp = input;
  else if (input instanceof URL) sp = input.searchParams;
  else if (typeof input === 'string') sp = new URL(input, 'http://x.invalid').searchParams;
  else {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(input ?? {})) if (typeof v === 'string') out[k] = v;
    return out;
  }
  return Object.fromEntries(sp.entries());
}

export const khaltiPlug: Plug<KhaltiConfig, KhaltiEndpoints, undefined, KhaltiInitiateInput, KhaltiCallbackInput, { ref: string }, KhaltiRefundInput> = {
  name: 'khalti',
  schema: {
    secretKey: { type: 'string', required: true, hint: 'Copy the secret key from the Khalti merchant dashboard (test key for sandbox).' },
    endpoints: { type: 'object', hint: 'Pass { api, merchant } URLs, or leave it out.' }
  },
  endpoints: KHALTI_ENDPOINTS,
  secrets: c => [c.secretKey],
  reportsOrderId: false,
  startKind: 'redirect',
  describe: i => ({ amount: i?.amount, orderId: i?.orderId }),

  async initiate(ctx, i) {
    if (paisa(i.amount) < KHALTI_MIN_AMOUNT) ctx.fail({ code: 'INVALID_INPUT', field: 'amount', message: 'Khalti needs at least 1000 paisa (Rs 10).' });
    for (const f of ['orderName', 'returnUrl', 'websiteUrl'] as const) {
      if (typeof i[f] !== 'string' || !i[f]) ctx.fail({ code: 'INVALID_INPUT', field: f, message: `Khalti initiate needs ${f}.` });
    }
    if (i.amountBreakdown && i.amountBreakdown.reduce((s, l) => s + l.amount, 0) !== i.amount) {
      ctx.fail({ code: 'INVALID_INPUT', field: 'amountBreakdown', message: 'The amountBreakdown lines must add up to amount.' });
    }
    for (const k of Object.keys(i.merchantExtra ?? {})) {
      if (!k.startsWith('merchant_')) ctx.fail({ code: 'INVALID_INPUT', field: 'merchantExtra', message: `Khalti extra field "${k}" must start with merchant_.` });
    }
    const res = await ctx.http.send({
      method: 'POST',
      url: `${ctx.endpoints.api}/epayment/initiate/`,
      headers: auth(ctx),
      json: {
        return_url: i.returnUrl,
        website_url: i.websiteUrl,
        amount: i.amount,
        purchase_order_id: i.orderId,
        purchase_order_name: i.orderName,
        customer_info: i.customer,
        amount_breakdown: i.amountBreakdown,
        product_details: i.productDetails,
        ...i.merchantExtra
      }
    });
    if (res.status !== 200) ctx.failFrom(res, 'initiate');
    const d = res.data as { pidx?: unknown; payment_url?: unknown; expires_at?: unknown };
    if (typeof d?.pidx !== 'string' || typeof d.payment_url !== 'string') {
      ctx.fail({ code: 'INVALID_RESPONSE', message: 'Khalti initiate answered with no pidx or payment_url.', response: { status: res.status, data: res.data } });
    }
    return { kind: 'redirect', url: d.payment_url as string, ref: d.pidx as string, expiresAt: typeof d.expires_at === 'string' ? d.expires_at : undefined, raw: d };
  },

  parseCallback(ctx, input) {
    const q = params(input);
    if (!q.pidx) ctx.fail({ code: 'INVALID_INPUT', field: 'pidx', message: 'The Khalti callback has no pidx.' });
    const rawStatus = q.status ?? '';
    return {
      ref: q.pidx,
      orderId: q.purchase_order_id || null,
      status: khaltiStatus(rawStatus),
      amount: tryPaisa(q.total_amount ?? q.amount),
      transactionId: q.transaction_id || q.txnId || null,
      signed: false,
      rawStatus,
      raw: q
    };
  },

  verify: (ctx, input) => lookup(ctx, input.ref),
  status: (ctx, input) => lookup(ctx, typeof input === 'string' ? input : input.ref),

  async refund(ctx, i) {
    if (!i || typeof i.transactionId !== 'string' || !i.transactionId) {
      ctx.fail({ code: 'INVALID_INPUT', field: 'transactionId', message: 'Khalti refund needs transactionId (from verify), not the pidx.' });
    }
    const body: Record<string, unknown> = {};
    if (i.amount !== undefined) body.amount = paisa(i.amount);
    if (i.mobile) body.mobile = i.mobile;
    const res = await ctx.http.send({
      method: 'POST',
      url: `${ctx.endpoints.merchant}/merchant-transaction/${encodeURIComponent(i.transactionId)}/refund/`,
      headers: auth(ctx),
      json: body
    });
    if (res.status < 200 || res.status >= 300) ctx.failFrom(res, 'refund');
    return res.data;
  }
};
