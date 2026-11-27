import { hmacSha512, safeEqual, tryRupees, paisa, type Paisa, type PaymentStatus, type Plug, type PlugContext, type PlugVerify } from '../../core';

/** Hamro Pay checkout config. All values are in the Hamro Pay merchant portal under Client Credentials. */
export interface HamroPayConfig {
  merchantId: string;
  clientId: string;
  clientApiKey: string;
  /** Signs every API call. */
  clientSecret: string;
  /** Signs the webhooks Hamro Pay sends you. Shown when you save a webhook URL in the portal. */
  webhookSecret?: string;
  /** Required in live mode: Hamro Pay does not publish its live hosts. */
  endpoints?: Partial<HamroPayEndpoints>;
}

export interface HamroPayEndpoints {
  /** API base, such as `https://uat-payclient.hamropatro.com`. */
  api: string;
  /** Checkout base; the form posts to `{gateway}/api/checkout`. */
  gateway: string;
}

export const HAMROPAY_ENDPOINTS: { sandbox: HamroPayEndpoints; live: null } = {
  sandbox: { api: 'https://uat-payclient.hamropatro.com', gateway: 'https://uat-checkout-pay.hamropatro.com' },
  live: null
};

/** Hamro Pay's limits: Rs 10 to Rs 50,000. */
export const HAMROPAY_MIN_AMOUNT = 1000 as Paisa;
export const HAMROPAY_MAX_AMOUNT = 5_000_000 as Paisa;

export interface HamroPayInitiateInput {
  /** Paisa, 1000 to 5,000,000. */
  amount: Paisa;
  /** Your unique id for this attempt (Hamro Pay `merchantTxnId`): at most 25 characters, no commas. Use a new one for every retry. */
  orderId: string;
  successUrl: string;
  failureUrl: string;
  /** Shown to the buyer, at most 250 characters. Default: the orderId. */
  remarks?: string;
  /** The buyer's Hamro Pay number, to fill it in. */
  phone?: string;
  /** Lines shown to the buyer. Default: one line for the whole amount. Prices in paisa. */
  products?: Array<{ name: string; price: Paisa; quantity: number; description?: string; imageUrl?: string }>;
  /** Echoed back in the webhook. */
  metadata?: Record<string, string>;
}

/**
 * Either the redirect query (`?MerchantTxnId=...`), or a webhook:
 * `{ body, signature }` with the raw request body text and the `Signature` header.
 */
export type HamroPayCallbackInput =
  | string
  | URL
  | URLSearchParams
  | Record<string, unknown>
  | { body: string | Record<string, unknown>; signature: string };

const STATUS: Record<string, PaymentStatus> = {
  COMPLETED: 'paid',
  PENDING: 'pending',
  PROCESSING: 'pending',
  NOT_INITIATED: 'pending',
  FAILED: 'failed'
};

/**
 * Hamro Pay status word to the library's status. NOT_INITIATED (buyer has not paid yet) is `pending`.
 *
 * @example
 * hamroPayStatus('PROCESSING'); // 'pending'
 */
export function hamroPayStatus(raw: string): PaymentStatus {
  return STATUS[raw.trim().toUpperCase()] ?? 'ambiguous';
}

/**
 * Hamro Pay's signature: base64 HMAC-SHA512 of the values joined by commas.
 *
 * @example
 * hamroPaySignature(['T1', '1000', 'M', 'C', 'K'], 'abcdefg');
 */
export function hamroPaySignature(values: string[], secret: string): string {
  return hmacSha512(values.join(','), secret);
}

type Ctx = PlugContext<HamroPayConfig, HamroPayEndpoints, undefined>;

function headers(ctx: Ctx, values: string[]) {
  return {
    'client-id': ctx.config.clientId,
    'client-api-key': ctx.config.clientApiKey,
    signature: hamroPaySignature(values, ctx.config.clientSecret)
  };
}

function noComma(ctx: Ctx, field: string, value: string) {
  if (value.includes(',')) ctx.fail({ code: 'INVALID_INPUT', field, message: `Hamro Pay signs comma-joined values, so ${field} may not hold a comma.` });
}

async function transaction(ctx: Ctx, ref: string): Promise<PlugVerify> {
  noComma(ctx, 'ref', ref);
  const c = ctx.config;
  const res = await ctx.http.send({
    method: 'POST',
    url: `${ctx.endpoints.api}/v1/checkout/transaction`,
    headers: headers(ctx, [ref, c.merchantId, c.clientId, c.clientApiKey]),
    json: { merchantId: c.merchantId, merchantTxnId: ref }
  });
  if (res.status !== 200) ctx.failFrom(res, 'transaction status');
  const d = res.data as Record<string, unknown> | null;
  if (!d || typeof d !== 'object' || typeof d.status !== 'string') {
    ctx.fail({ code: 'INVALID_RESPONSE', message: 'Hamro Pay transaction status answered with no status.', response: { status: res.status, data: res.data } });
  }
  const rawStatus = String(d!.status);
  const status = hamroPayStatus(rawStatus);
  const echo = typeof d!.merchantTxnId === 'string' ? d!.merchantTxnId : typeof d!.merchantTransactionId === 'string' ? d!.merchantTransactionId : null;
  let amount: Paisa | null = null;
  // The amount is rupees, and 0 until the payment finishes.
  if (status === 'paid') {
    amount = tryRupees(d!.amount);
    if (amount === null) ctx.fail({ code: 'INVALID_RESPONSE', message: 'Hamro Pay sent an amount this library could not read.', response: { status: res.status, data: res.data } });
  }
  return {
    status,
    ref: echo ?? ref,
    orderId: echo,
    amount,
    transactionId: typeof d!.trackingId === 'string' && d!.trackingId ? d!.trackingId : null,
    rawStatus,
    raw: d
  };
}

/** The texts Hamro Pay may have signed for a JSON number: its literal in the body, then 10, 10.0 and 10.00. */
function amountTexts(raw: string | null, n: number): string[] {
  const out: string[] = [];
  const lit = raw ? /"amount"\s*:\s*(-?\d+(?:\.\d+)?)/.exec(raw)?.[1] : undefined;
  if (lit) out.push(lit);
  out.push(String(n), n.toFixed(1), n.toFixed(2));
  return [...new Set(out)];
}

function isWebhook(input: HamroPayCallbackInput): input is { body: string | Record<string, unknown>; signature: string } {
  return !!input && typeof input === 'object' && !(input instanceof URL) && !(input instanceof URLSearchParams) && 'body' in input && 'signature' in input;
}

export const hamroPayPlug: Plug<HamroPayConfig, HamroPayEndpoints, undefined, HamroPayInitiateInput, HamroPayCallbackInput, { ref: string }, never> = {
  name: 'hamropay',
  schema: {
    merchantId: { type: 'string', required: true, hint: 'In the Hamro Pay merchant portal under Client Credentials.' },
    clientId: { type: 'string', required: true, hint: 'In the Hamro Pay merchant portal under Client Credentials.' },
    clientApiKey: { type: 'string', required: true, hint: 'In the Hamro Pay merchant portal under Client Credentials.' },
    clientSecret: { type: 'string', required: true, hint: 'In the Hamro Pay merchant portal under Client Credentials.' },
    webhookSecret: { type: 'string', hint: 'Shown in the portal when you save a webhook URL. Needed only to read webhooks.' },
    endpoints: { type: 'object', hint: 'Pass { api, gateway }. Required in live mode: ask Hamro Pay for the live hosts.' }
  },
  endpoints: HAMROPAY_ENDPOINTS,
  secrets: c => [c.clientSecret, c.webhookSecret, c.clientApiKey],
  reportsOrderId: true,
  startKind: 'form',
  describe: i => ({ amount: i?.amount, orderId: i?.orderId }),

  async initiate(ctx, i) {
    if (i.amount < HAMROPAY_MIN_AMOUNT || i.amount > HAMROPAY_MAX_AMOUNT) {
      ctx.fail({ code: 'INVALID_INPUT', field: 'amount', message: 'Hamro Pay takes 1000 to 5,000,000 paisa (Rs 10 to Rs 50,000).' });
    }
    if (i.orderId.length > 25) ctx.fail({ code: 'INVALID_INPUT', field: 'orderId', message: 'Hamro Pay merchantTxnId may be at most 25 characters.' });
    noComma(ctx, 'orderId', i.orderId);
    for (const f of ['successUrl', 'failureUrl'] as const) {
      if (typeof i[f] !== 'string' || !i[f]) ctx.fail({ code: 'INVALID_INPUT', field: f, message: `Hamro Pay initiate needs ${f}.` });
    }
    const remarks = i.remarks ?? i.orderId;
    if (remarks.length > 250) ctx.fail({ code: 'INVALID_INPUT', field: 'remarks', message: 'Hamro Pay remarks may be at most 250 characters.' });
    const c = ctx.config;
    const amount = String(i.amount);
    const products = (i.products ?? [{ name: remarks, price: i.amount, quantity: 1 }]).map(p => ({
      name: p.name,
      description: p.description ?? p.name,
      imageUrl: p.imageUrl,
      price: Number((paisa(p.price) / 100).toFixed(2)),
      quantity: p.quantity
    }));
    const res = await ctx.http.send({
      method: 'POST',
      url: `${ctx.endpoints.api}/v1/checkout/sessionId`,
      headers: headers(ctx, [i.orderId, amount, c.merchantId, c.clientId, c.clientApiKey]),
      json: {
        merchantTxnId: i.orderId,
        merchantId: c.merchantId,
        transactionAmount: amount,
        successRedirectionUrl: i.successUrl,
        failedRedirectionUrl: i.failureUrl,
        productList: products,
        phone_number: i.phone,
        metadata: i.metadata
      }
    });
    if (res.status !== 200) ctx.failFrom(res, 'create session');
    const d = res.data as { sessionId?: unknown };
    if (typeof d?.sessionId !== 'string' || !d.sessionId) {
      ctx.fail({ code: 'INVALID_RESPONSE', message: 'Hamro Pay create session answered with no sessionId.', response: { status: res.status, data: res.data } });
    }
    const sessionId = d.sessionId as string;
    const fields: Record<string, string> = {
      merchant_id: c.merchantId,
      session_id: sessionId,
      token: hamroPaySignature([c.merchantId, i.orderId, sessionId, amount, c.clientId, c.clientApiKey], c.clientSecret),
      merchant_transaction_id: i.orderId,
      remarks
    };
    if (i.phone) fields.phone_number = i.phone;
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    return { kind: 'form', action: `${ctx.endpoints.gateway}/api/checkout`, method: 'POST', fields, ref: i.orderId, expiresAt, raw: d };
  },

  parseCallback(ctx, input) {
    if (isWebhook(input)) {
      const secret = ctx.config.webhookSecret;
      if (!secret) ctx.fail({ code: 'INVALID_CONFIG', field: 'hamropay.webhookSecret', message: 'hamropay.webhookSecret is missing. Copy it from the portal (Configuration, Webhook).' });
      const rawText = typeof input.body === 'string' ? input.body : null;
      let body: Record<string, unknown>;
      try {
        body = rawText !== null ? JSON.parse(rawText) : input.body;
      } catch {
        return ctx.fail({ code: 'INVALID_INPUT', field: 'body', message: 'The Hamro Pay webhook body is not JSON.' });
      }
      const id = String(body?.merchantTxnId ?? '');
      const status = String(body?.status ?? '');
      const amountNumber = Number(body?.amount);
      if (!id || !status || !Number.isFinite(amountNumber)) ctx.fail({ code: 'INVALID_SIGNATURE', message: 'The Hamro Pay webhook is missing signed fields.' });
      const ok = amountTexts(rawText, amountNumber).some(a =>
        safeEqual(hamroPaySignature([id, String(body.merchantId ?? ''), status, a], secret as string), String(input.signature ?? ''))
      );
      if (!ok) ctx.fail({ code: 'INVALID_SIGNATURE', message: 'The Hamro Pay webhook signature does not match. Do not trust this webhook.' });
      if (body.merchantId !== ctx.config.merchantId) ctx.fail({ code: 'INVALID_SIGNATURE', message: 'The Hamro Pay webhook is for another merchant.' });
      const mapped = hamroPayStatus(status);
      return { ref: id, orderId: id, status: mapped, amount: mapped === 'paid' ? tryRupees(amountNumber) : null, transactionId: null, signed: true, rawStatus: status, raw: body };
    }
    let q: Record<string, string>;
    if (input instanceof URLSearchParams) q = Object.fromEntries(input.entries());
    else if (input instanceof URL) q = Object.fromEntries(input.searchParams.entries());
    else if (typeof input === 'string') q = Object.fromEntries(new URL(input, 'http://x.invalid').searchParams.entries());
    else q = Object.fromEntries(Object.entries(input ?? {}).filter((e): e is [string, string] => typeof e[1] === 'string'));
    const ref = q.MerchantTxnId ?? q.merchantTxnId;
    if (!ref) ctx.fail({ code: 'INVALID_INPUT', field: 'MerchantTxnId', message: 'The Hamro Pay redirect has no MerchantTxnId.' });
    return { ref, orderId: ref, status: 'pending', amount: null, transactionId: null, signed: false, rawStatus: '', raw: q };
  },

  verify: (ctx, input) => transaction(ctx, input.ref),
  status: (ctx, input) => transaction(ctx, typeof input === 'string' ? input : input.ref)
};
