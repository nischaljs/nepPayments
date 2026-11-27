import type { KeyObject } from 'node:crypto';
import { connect, loadPrivateKey, rsaSha256Sign, tryRupees, PaymentError, type Plug, type PlugContext, type PlugVerify, type Paisa, type CommonOptions } from '../../core';

export interface NepalPayConfig {
  userId: string;
  password: string;
  acquirerId: string;
  merchantId: string;
  merchantName: string;
  merchantCategoryCode: number;
  city: string;
  postalCode: string;
  storeLabel: string;
  generateUrl: string;
  reportUrl: string;
  /** Override when the acquirer issues a separate reporting credential. */
  reportAuthorization?: () => Promise<string>;
  pfx?: Uint8Array;
  pfxPassword?: string;
  privateKeyPem?: string;
}
type Input = { orderId: string; amount: Paisa };
type Context = PlugContext<NepalPayConfig, Record<string, never>, KeyObject>;
const required = { type: 'string', required: true, hint: 'Use the value from your NEPALPAY QR enrollment.' } as const;

function basic(c: NepalPayConfig) {
  return 'Basic ' + Buffer.from(c.userId + ':' + c.password).toString('base64');
}

async function report(ctx: Context, ref: string): Promise<PlugVerify> {
  const c = ctx.config;
  const authorization = c.reportAuthorization ? await c.reportAuthorization() : basic(c);
  ctx.redactor.add(authorization);
  const res = await ctx.http.send({ method: 'POST', url: c.reportUrl, headers: { authorization },
    json: { validationTraceId: ref, merchantId: c.merchantId, acquirerId: c.acquirerId } });
  if (res.status !== 200) ctx.failFrom(res, 'transaction report');
  const d = res.data as { responseStatus?: string; responseCode?: string; responseBody?: Record<string, unknown>[] } | null;
  if (d?.responseStatus !== 'SUCCESS' || String(d.responseCode) !== '200' || !Array.isArray(d.responseBody)) {
    return ctx.fail({ code: 'INVALID_RESPONSE', message: 'NEPALPAY returned no successful transaction report.' });
  }
  const result: PlugVerify = { ref, status: 'pending', orderId: null, amount: null, transactionId: null, rawStatus: 'NO_RECORD', raw: null };
  if (!d.responseBody.length) return result;
  const rows = d.responseBody;
  if (rows.some(row => !row || row.acquirerId !== c.acquirerId ||
      (row.validationTraceId != null && row.validationTraceId !== ref) ||
      (row.merchantId != null && row.merchantId !== c.merchantId))) {
    return ctx.fail({ code: 'INVALID_RESPONSE', message: 'NEPALPAY returned a report for a different payment or merchant.' });
  }
  const isFinal = (row: Record<string, unknown>) => row.debitStatus === '000' && ['000', '999', 'DEFER'].includes(String(row.creditStatus));
  const payments = rows.filter(row => row.tranType === 'PMT' && isFinal(row));
  // A trace can have failed attempts followed by a successful payment. Multiple
  // credits or a mixed payment/refund report require merchant reconciliation.
  if (rows.length > 1 && (payments.length !== 1 || rows.some(row => row.tranType !== 'PMT'))) {
    return { ...result, status: 'ambiguous', rawStatus: 'MULTIPLE_RECORDS' };
  }
  const row = payments[0] ?? rows[0];
  const settled = payments.length === 1;
  const transactionId = typeof row.nQrTxnId === 'string' && row.nQrTxnId ? row.nQrTxnId : null;
  if (settled && !transactionId) return ctx.fail({ code: 'INVALID_RESPONSE', message: 'NEPALPAY settled report is missing its transaction ID.' });
  return { ref, orderId: typeof row.merchantBillNo === 'string' ? row.merchantBillNo : null, amount: tryRupees(row.amount),
    transactionId, status: row.tranType === 'RFND' && isFinal(row) ? 'refunded' : settled ? 'paid' : 'ambiguous',
    rawStatus: [row.tranType, row.debitStatus, row.creditStatus].join('/'), raw: { debitStatus: row.debitStatus, creditStatus: row.creditStatus } };
}

const plug: Plug<NepalPayConfig, Record<string, never>, KeyObject, Input, never, { ref: string }> = {
  name: 'nepalpay', startKind: 'qr', reportsOrderId: true,
  endpoints: { sandbox: {}, live: {} },
  schema: { userId: required, password: required, merchantId: required, acquirerId: required, merchantName: required,
    merchantCategoryCode: { ...required, type: 'number' }, city: required, postalCode: required, storeLabel: required, generateUrl: required, reportUrl: required },
  secrets: c => [c.password, c.privateKeyPem, c.pfxPassword, basic(c)],
  prepare(c) {
    if (![c.generateUrl, c.reportUrl].every(value => {
      try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
      catch { return false; }
    }) ||
        !/^\d{4}$/.test(String(c.merchantCategoryCode)) || c.storeLabel.length > 25 || c.merchantName.length > 25 ||
        [c.userId, c.acquirerId, c.merchantId].some(v => v.includes(','))) {
      throw new PaymentError({ code: 'INVALID_CONFIG', message: 'Check NEPALPAY HTTPS URLs, four-digit category code, merchant identity and store label.' });
    }
    return loadPrivateKey({ pfx: c.pfx, password: c.pfxPassword, pem: c.privateKeyPem }, 'nepalpay.pfx');
  },
  describe: i => i,
  async initiate(ctx, i) {
    if (!i.amount || i.amount > 999999999999 || i.orderId.length > 25 || i.orderId.includes(',')) {
      return ctx.fail({ code: 'INVALID_INPUT', message: 'NEPALPAY requires a positive amount of up to 12 digits in paisa and a unique bill number of up to 25 characters without commas.' });
    }
    const c = ctx.config;
    const amount = (i.amount / 100).toFixed(2);
    const token = rsaSha256Sign([c.acquirerId, c.merchantId, c.merchantCategoryCode, 524, amount, i.orderId, c.userId].join(','), ctx.state);
    ctx.redactor.add(token);
    const res = await ctx.http.send({ method: 'POST', url: c.generateUrl, headers: { authorization: basic(c) }, json: {
      pointOfInitialization: 12, acquirerId: c.acquirerId, merchantId: c.merchantId, merchantName: c.merchantName,
      merchantCategoryCode: c.merchantCategoryCode, merchantCity: c.city, merchantCountry: 'NP', merchantPostalCode: c.postalCode,
      transactionCurrency: 524, transactionAmount: amount, billNumber: i.orderId, storeLabel: c.storeLabel, qrImage: false, token
    } });
    if (res.status !== 200) ctx.failFrom(res, 'generate QR');
    const d = res.data as { responseStatus?: string; responseCode?: string; data?: { qrString?: string; validationTraceId?: string } } | null;
    const ref = d?.data?.validationTraceId;
    const payload = d?.data?.qrString;
    if (d?.responseStatus !== 'SUCCESS' || d.responseCode !== '000' || typeof ref !== 'string' || !ref || typeof payload !== 'string' || !payload) {
      return ctx.fail({ code: 'INVALID_RESPONSE', message: 'NEPALPAY could not issue a QR and validation trace ID.' });
    }
    return { kind: 'qr', ref, payload, poll: { ref, intervalMs: 5000 }, raw: { validationTraceId: ref } };
  },
  verify: (ctx, i) => report(ctx, i.ref),
  status: (ctx, i) => report(ctx, i.ref)
};
export function createNepalPay(options: CommonOptions & (NepalPayConfig | ({ mode: 'mock' } & Partial<NepalPayConfig>))) {
  const { mode, fetch, timeoutMs, ...config } = options;
  return connect(plug, config as NepalPayConfig, { mode, fetch, timeoutMs });
}
