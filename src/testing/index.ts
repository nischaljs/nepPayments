import { hmacSha256, hmacSha512, safeEqual, toRupeeString, type Paisa } from '../core';

/**
 * A request handler in the shape MSW and `fakeFetch` use: return a Response
 * for a request it knows, or undefined to pass.
 */
export type Handler = (request: Request) => Promise<Response | undefined>;

/** One fake payment. Change `status` (the gateway's own word) to test each outcome. */
export interface FakePayment {
  ref: string;
  orderId: string;
  /** Paisa. */
  amount: number;
  status: string;
  transactionId: string;
}

/** A fake gateway: its handler and the payments it holds. */
export interface FakeGateway {
  handler: Handler;
  payments: Map<string, FakePayment>;
  /** Set what the gateway reports for `ref`, and anything else about it, such as a wrong amount. */
  set(ref: string, patch: Partial<FakePayment>): void;
  /** Every request the fake answered, in order. */
  calls: Array<{ method: string; path: string; body: unknown; headers: Record<string, string> }>;
}

/**
 * A fetch that answers from the handlers and fails any other request, so a
 * test can never reach a real gateway.
 *
 * @example
 * const khalti = fakeKhalti();
 * const payments = createPayments({ mode: 'sandbox', fetch: fakeFetch(khalti.handler), khalti: { secretKey: 'test' } });
 */
export function fakeFetch(...handlers: Handler[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input as RequestInfo, init);
    for (const h of handlers) {
      const res = await h(request.clone());
      if (res) return res;
    }
    throw new TypeError(`fakeFetch: no handler for ${request.method} ${new URL(request.url).pathname}`);
  }) as typeof fetch;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function makeGateway(route: (req: Request, path: string, body: unknown, g: FakeGateway) => Response | undefined): FakeGateway {
  const g: FakeGateway = {
    payments: new Map(),
    calls: [],
    set(ref, patch) {
      const p = g.payments.get(ref) ?? { ref, orderId: ref, amount: 0, status: '', transactionId: `txn-${ref}` };
      g.payments.set(ref, { ...p, ...patch });
    },
    async handler(req) {
      const url = new URL(req.url);
      const text = req.method === 'GET' ? '' : await req.text();
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : Object.fromEntries(url.searchParams.entries());
      } catch {
        body = Object.fromEntries(new URLSearchParams(text).entries());
      }
      const res = route(req, url.pathname, body, g);
      if (res) g.calls.push({ method: req.method, path: url.pathname, body, headers: Object.fromEntries(req.headers.entries()) });
      return res;
    }
  };
  return g;
}

let counter = 0;
const nextId = (p: string) => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;

/**
 * A fake Khalti ePayment API: initiate, lookup and refund. New payments report
 * `status` (default `Completed`). Expired and User canceled answer HTTP 400, as Khalti does.
 * @example
 * const khalti = fakeKhalti({ status: 'Pending' });
 * const payments = createPayments({ mode: 'sandbox', fetch: fakeFetch(khalti.handler), khalti: { secretKey: 'test' } });
 */
export function fakeKhalti(opts: { status?: string } = {}): FakeGateway {
  return makeGateway((req, path, body, g) => {
    const b = body as Record<string, unknown>;
    if (req.method === 'POST' && path.endsWith('/epayment/initiate/')) {
      if (!req.headers.get('authorization')?.startsWith('Key ')) return json(401, { detail: 'Authentication credentials were not provided.', status_code: 401 });
      const pidx = nextId('pidx');
      g.set(pidx, { orderId: String(b.purchase_order_id), amount: Number(b.amount), status: opts.status ?? 'Completed' });
      return json(200, { pidx, payment_url: `https://test-pay.khalti.com/?pidx=${pidx}`, expires_at: new Date(Date.now() + 1800e3).toISOString(), expires_in: 1800 });
    }
    if (req.method === 'POST' && path.endsWith('/epayment/lookup/')) {
      const p = g.payments.get(String(b.pidx));
      if (!p) return json(404, { detail: 'Not found.', error_key: 'validation_error' });
      const http = /^(expired|user canceled)$/i.test(p.status) ? 400 : 200;
      return json(http, { pidx: p.ref, total_amount: p.amount, status: p.status, transaction_id: /completed|refunded/i.test(p.status) ? p.transactionId : null, fee: 0, refunded: /refunded/i.test(p.status) });
    }
    const refund = /\/merchant-transaction\/([^/]+)\/refund\/$/.exec(path);
    if (req.method === 'POST' && refund) return json(200, { detail: 'Transaction refund successful.' });
    return undefined;
  });
}

/**
 * A fake eSewa status API. Every payment it is asked about reports `status`
 * (default `COMPLETE`) unless you `set` it first.
 * @example
 * const esewa = fakeEsewa();
 * esewa.set('o-1', { status: 'AMBIGUOUS', amount: rupees(100) });
 */
export function fakeEsewa(opts: { status?: string } = {}): FakeGateway {
  return makeGateway((req, path, body, g) => {
    if (req.method !== 'GET' || !path.endsWith('/api/epay/transaction/status/')) return undefined;
    const q = body as Record<string, string>;
    const ref = q.transaction_uuid;
    if (!g.payments.has(ref)) g.set(ref, { orderId: ref, amount: Math.round(Number(q.total_amount) * 100), status: opts.status ?? 'COMPLETE' });
    const p = g.payments.get(ref)!;
    return json(200, {
      product_code: q.product_code,
      transaction_uuid: p.ref,
      total_amount: Number(toRupeeString(p.amount as Paisa)),
      status: p.status,
      ref_id: p.status === 'COMPLETE' ? p.transactionId : null
    });
  });
}

/**
 * A signed eSewa success callback, as eSewa sends it to your successUrl.
 *
 * @example
 * const data = esewaCallback({ orderId: 'o-1', amount: rupees(100), secretKey: '8gBm/:&EnhH.1/q' });
 * await payments.esewa.parseCallback({ data });
 */
export function esewaCallback(i: { orderId: string; amount: Paisa; secretKey: string; productCode?: string; status?: string; transactionCode?: string }): string {
  const body: Record<string, string> = {
    transaction_code: i.transactionCode ?? '000AWEO',
    status: i.status ?? 'COMPLETE',
    total_amount: toRupeeString(i.amount),
    transaction_uuid: i.orderId,
    product_code: i.productCode ?? 'EPAYTEST',
    signed_field_names: 'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names'
  };
  const message = body.signed_field_names.split(',').map(k => `${k}=${body[k]}`).join(',');
  return Buffer.from(JSON.stringify({ ...body, signature: hmacSha256(message, i.secretKey) }), 'utf8').toString('base64');
}

/**
 * A fake ConnectIPS validatetxn API. Payments report `status` (default `SUCCESS`) unless you `set` them.
 *
 * @example
 * const cips = fakeConnectIps({ status: 'FAILED' });
 */
export function fakeConnectIps(opts: { status?: string } = {}): FakeGateway {
  return makeGateway((req, path, body, g) => {
    if (req.method !== 'POST' || !path.endsWith('/connectipswebws/api/creditor/validatetxn')) return undefined;
    if (!req.headers.get('authorization')?.startsWith('Basic ')) return json(401, { message: 'Unauthorized' });
    const b = body as Record<string, unknown>;
    const ref = String(b.referenceId);
    if (!g.payments.has(ref)) g.set(ref, { amount: Number(b.txnAmt), status: opts.status ?? 'SUCCESS' });
    const p = g.payments.get(ref)!;
    return json(200, { merchantId: b.merchantId, appId: b.appId, referenceId: p.ref, txnAmt: p.amount, token: null, status: p.status, statusDesc: p.status === 'SUCCESS' ? 'TRANSACTION SUCCESSFUL' : p.status });
  });
}

/**
 * A fake Hamro Pay checkout API: create session and transaction status.
 * With `clientSecret`, it checks the Signature header like Hamro Pay does.
 * @example
 * const hamro = fakeHamroPay({ clientSecret: 'test-secret' }); // checks the Signature header too
 */
export function fakeHamroPay(opts: { status?: string; clientSecret?: string } = {}): FakeGateway {
  return makeGateway((req, path, body, g) => {
    const b = body as Record<string, unknown>;
    const sig = req.headers.get('signature') ?? '';
    const clientId = req.headers.get('client-id') ?? '';
    const apiKey = req.headers.get('client-api-key') ?? '';
    const bad = (values: string[]) => opts.clientSecret !== undefined && !safeEqual(hmacSha512(values.join(','), opts.clientSecret), sig);
    if (req.method === 'POST' && path.endsWith('/v1/checkout/sessionId')) {
      if (bad([String(b.merchantTxnId), String(b.transactionAmount), String(b.merchantId), clientId, apiKey])) return json(401, { code: 16, message: 'Unauthorized Request', details: [] });
      if (g.payments.has(String(b.merchantTxnId))) return json(409, { code: 6, message: 'ALREADY_EXISTS', details: [] });
      g.set(String(b.merchantTxnId), { amount: Number(b.transactionAmount), status: opts.status ?? 'COMPLETED' });
      return json(200, { sessionId: nextId('sess-'), merchantId: b.merchantId });
    }
    if (req.method === 'POST' && path.endsWith('/v1/checkout/transaction')) {
      if (bad([String(b.merchantTxnId), String(b.merchantId), clientId, apiKey])) return json(401, { code: 16, message: 'Unauthorized Request', details: [] });
      const p = g.payments.get(String(b.merchantTxnId));
      if (!p) return json(200, { merchantTxnId: b.merchantTxnId, trackingId: '', status: 'NOT_INITIATED', amount: 0, remarks: '', message: 'TRANSACTION NOT INITIATED YET' });
      const done = p.status === 'COMPLETED';
      return json(200, { merchantTxnId: p.ref, trackingId: done ? p.transactionId : '', status: p.status, amount: done ? p.amount / 100 : 0, remarks: '', message: p.status });
    }
    return undefined;
  });
}

/**
 * A signed Hamro Pay webhook, as Hamro Pay posts it.
 *
 * @example
 * const hook = hamroPayWebhook({ orderId: 'o-1', merchantId: 'M', amount: paisa(1000), webhookSecret: 'whsec' });
 * await payments.hamropay.parseCallback(hook);
 */
export function hamroPayWebhook(i: { orderId: string; merchantId: string; amount: Paisa; webhookSecret: string; status?: string; amountText?: string }): { body: string; signature: string } {
  const status = i.status ?? 'COMPLETED';
  const amountText = i.amountText ?? toRupeeString(i.amount);
  const body = `{"merchantTxnId":${JSON.stringify(i.orderId)},"merchantId":${JSON.stringify(i.merchantId)},"amount":${amountText},"status":${JSON.stringify(status)},"metadata":{}}`;
  return { body, signature: hmacSha512([i.orderId, i.merchantId, status, amountText].join(','), i.webhookSecret) };
}
