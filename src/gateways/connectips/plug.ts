import type { KeyObject } from 'node:crypto';
import { PaymentError, paisa, loadPrivateKey, rsaSha256Sign, tryPaisa, type Paisa, type PaymentStatus, type Plug, type PlugContext, type PlugVerify } from '../../core';

/** ConnectIPS (NCHL) config. NCHL gives you each value when you sign up as a creditor. */
export interface ConnectIpsConfig {
  merchantId: string | number;
  appId: string;
  appName: string;
  /** The API password for `appId`. Sent as HTTP Basic auth to validatetxn. */
  password: string;
  /** The creditor .pfx file NCHL gave you, as a Buffer. */
  pfx?: Buffer | Uint8Array;
  pfxPassword?: string;
  /** Or the private key as PEM, instead of `pfx`. */
  privateKeyPem?: string;
  endpoints?: Partial<ConnectIpsEndpoints>;
}

export interface ConnectIpsEndpoints {
  /** Base URL, such as `https://uat.connectips.com`. The form is `/connectipswebgw/loginpage`; the API is `/connectipswebws/api/creditor/...`. */
  base: string;
}

/** Not in NCHL's public docs: NCHL gives the hosts to each creditor. These are the hosts in common use. */
export const CONNECTIPS_ENDPOINTS: { sandbox: ConnectIpsEndpoints; live: ConnectIpsEndpoints } = {
  sandbox: { base: 'https://uat.connectips.com' },
  live: { base: 'https://login.connectips.com' }
};

export interface ConnectIpsInitiateInput {
  /** Paisa. */
  amount: Paisa;
  /** Your unique order id. Sent as TXNID and REFERENCEID; it is also the ref. */
  orderId: string;
  remarks?: string;
  particulars?: string;
  /** The transaction date. Default: now, as a date in Nepal (UTC+5:45). */
  date?: Date;
}

/** The query ConnectIPS adds to your success or failure URL (`?TXNID=...`). */
export type ConnectIpsCallbackInput = string | URL | URLSearchParams | Record<string, unknown>;

/**
 * ConnectIPS validatetxn status to the library's status.
 *
 * @example
 * connectIpsStatus('ERROR', 'Transaction not found'); // 'failed'
 */
export function connectIpsStatus(raw: string, desc = ''): PaymentStatus {
  const s = raw.trim().toUpperCase();
  if (s === 'SUCCESS') return 'paid';
  if (s === 'FAILED') return 'failed';
  if (s === 'ERROR' && /not\s*found/i.test(desc)) return 'failed';
  return 'ambiguous';
}

/**
 * DD-MM-YYYY in Nepal time.
 *
 * @example
 * connectIpsDate(new Date('2026-01-01T20:00:00Z')); // '02-01-2026'
 */
export function connectIpsDate(d: Date): string {
  const nepal = new Date(d.getTime() + (5 * 60 + 45) * 60_000);
  const dd = String(nepal.getUTCDate()).padStart(2, '0');
  const mm = String(nepal.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${nepal.getUTCFullYear()}`;
}

/**
 * The comma-joined message ConnectIPS signs for the payment form.
 *
 * @example
 * connectIpsFormMessage(start.fields); // 'MERCHANTID=123,APPID=...,TOKEN=TOKEN'
 */
export function connectIpsFormMessage(f: Record<string, string>): string {
  return `MERCHANTID=${f.MERCHANTID},APPID=${f.APPID},APPNAME=${f.APPNAME},TXNID=${f.TXNID},TXNDATE=${f.TXNDATE},TXNCRNCY=${f.TXNCRNCY},TXNAMT=${f.TXNAMT},REFERENCEID=${f.REFERENCEID},REMARKS=${f.REMARKS},PARTICULARS=${f.PARTICULARS},TOKEN=TOKEN`;
}

/**
 * The message ConnectIPS signs for validatetxn.
 *
 * @example
 * connectIpsValidateMessage('123', 'MER-123-APP-1', 'o-1', '500'); // 'MERCHANTID=123,APPID=MER-123-APP-1,REFERENCEID=o-1,TXNAMT=500'
 */
export function connectIpsValidateMessage(merchantId: string, appId: string, referenceId: string, txnAmt: string): string {
  return `MERCHANTID=${merchantId},APPID=${appId},REFERENCEID=${referenceId},TXNAMT=${txnAmt}`;
}

type Ctx = PlugContext<ConnectIpsConfig, ConnectIpsEndpoints, KeyObject>;

function query(input: ConnectIpsCallbackInput): Record<string, string> {
  if (input instanceof URLSearchParams) return Object.fromEntries(input.entries());
  if (input instanceof URL) return Object.fromEntries(input.searchParams.entries());
  if (typeof input === 'string') return Object.fromEntries(new URL(input, 'http://x.invalid').searchParams.entries());
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input ?? {})) if (typeof v === 'string') out[k] = v;
  return out;
}

function basicAuth(config: ConnectIpsConfig): string | undefined {
  if (typeof config?.appId !== 'string' || typeof config?.password !== 'string') return undefined;
  return Buffer.from(`${config.appId}:${config.password}`, 'utf8').toString('base64');
}

export interface ConnectIpsStatusInput {
  ref: string;
  amount: Paisa;
  /** Request NCHL transaction and settlement details for reconciliation. */
  details?: boolean;
}

function checkField(field: string, value: unknown, limit: number, config = false): void {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) {
    throw new PaymentError({ code: config ? 'INVALID_CONFIG' : 'INVALID_INPUT', field, message: `ConnectIPS ${field} requires 1 to ${limit} characters.` });
  }
}

async function validate(ctx: Ctx, ref: string, amount: Paisa, details = false): Promise<PlugVerify> {
  const merchantId = String(Number(ctx.config.merchantId));
  checkField('ref', ref, 20);
  const txnAmt = String(paisa(amount));
  const operation = details ? 'gettxndetail' : 'validatetxn';
  const token = rsaSha256Sign(connectIpsValidateMessage(merchantId, ctx.config.appId, ref, txnAmt), ctx.state);
  const basic = basicAuth(ctx.config) as string;
  // ctx.redactor lives for this call only, so the per-order token does not pile up.
  ctx.redactor.add(token);
  const res = await ctx.http.send({
    method: 'POST',
    url: `${ctx.endpoints.base}/connectipswebws/api/creditor/${operation}`,
    headers: { authorization: `Basic ${basic}` },
    json: { merchantId: Number(merchantId), appId: ctx.config.appId, referenceId: ref, txnAmt: Number(txnAmt), token }
  });
  if (res.status !== 200) ctx.failFrom(res, operation);
  const d = res.data as Record<string, unknown> | null;
  if (!d || typeof d !== 'object' || typeof d.status !== 'string') {
    ctx.fail({ code: 'INVALID_RESPONSE', message: `ConnectIPS ${operation} answered with no status.`, response: { status: res.status, data: res.data } });
  }
  const rawStatus = String(d!.status);
  const status = connectIpsStatus(rawStatus, String(d!.statusDesc ?? ''));
  const reported = d!.txnAmt === undefined || d!.txnAmt === null ? null : tryPaisa(d!.txnAmt);
  return {
    status,
    ref: typeof d!.referenceId === 'string' ? d!.referenceId : ref,
    orderId: typeof d!.referenceId === 'string' ? d!.referenceId : null,
    amount: reported,
    transactionId: details && (typeof d!.txnId === 'string' || Number.isSafeInteger(d!.txnId)) ? String(d!.txnId) : null,
    rawStatus,
    raw: d
  };
}

export const connectIpsPlug: Plug<ConnectIpsConfig, ConnectIpsEndpoints, KeyObject, ConnectIpsInitiateInput, ConnectIpsCallbackInput, ConnectIpsStatusInput, never> = {
  name: 'connectips',
  schema: {
    merchantId: { type: 'number', required: true, hint: 'The merchant id NCHL gave you.' },
    appId: { type: 'string', required: true, hint: 'The app id NCHL gave you, such as MER-123-APP-1.' },
    appName: { type: 'string', required: true, hint: 'The app name NCHL registered for appId.' },
    password: { type: 'string', required: true, hint: 'The API password for appId (used for validatetxn).' },
    pfx: { type: 'bytes', hint: "Pass the .pfx as a Buffer: fs.readFileSync('CREDITOR.pfx')." },
    pfxPassword: { type: 'string', hint: 'The password of the .pfx file.' },
    privateKeyPem: { type: 'string', hint: 'A PEM private key, instead of pfx.' },
    endpoints: { type: 'object', hint: 'Pass { base } with the host NCHL gave you, or leave it out.' }
  },
  endpoints: CONNECTIPS_ENDPOINTS,
  secrets: c => [c.password, c.pfxPassword, c.privateKeyPem, basicAuth(c)],
  reportsOrderId: true,
  startKind: 'form',
  describe: i => ({ amount: i?.amount, orderId: i?.orderId }),

  prepare(config) {
    const merchantId = String(config.merchantId);
    if (!/^\d{1,20}$/.test(merchantId) || !Number.isSafeInteger(Number(merchantId))) {
      throw new PaymentError({ code: 'INVALID_CONFIG', field: 'connectips.merchantId', message: 'ConnectIPS merchantId must be a safely representable non-negative integer of up to 20 digits.' });
    }
    checkField('connectips.appId', config.appId, 15, true);
    checkField('connectips.appName', config.appName, 30, true);
    return loadPrivateKey({ pfx: config.pfx, password: config.pfxPassword, pem: config.privateKeyPem }, 'connectips.pfx');
  },

  async initiate(ctx, i) {
    checkField('orderId', i.orderId, 20);
    checkField('remarks', i.remarks ?? i.orderId, 50);
    checkField('particulars', i.particulars ?? i.orderId, 100);
    if (i.date !== undefined && (!(i.date instanceof Date) || !Number.isFinite(i.date.getTime()))) {
      ctx.fail({ code: 'INVALID_INPUT', field: 'date', message: 'ConnectIPS date must be a valid Date.' });
    }
    const fields: Record<string, string> = {
      MERCHANTID: String(Number(ctx.config.merchantId)),
      APPID: ctx.config.appId,
      APPNAME: ctx.config.appName,
      TXNID: i.orderId,
      TXNDATE: connectIpsDate(i.date ?? new Date()),
      TXNCRNCY: 'NPR',
      TXNAMT: String(i.amount),
      REFERENCEID: i.orderId,
      REMARKS: i.remarks ?? i.orderId,
      PARTICULARS: i.particulars ?? i.orderId
    };
    fields.TOKEN = rsaSha256Sign(connectIpsFormMessage(fields), ctx.state);
    const { TOKEN: _t, ...unsigned } = fields;
    void _t;
    return { kind: 'form', action: `${ctx.endpoints.base}/connectipswebgw/loginpage`, method: 'POST', fields, ref: i.orderId, raw: unsigned };
  },

  parseCallback(ctx, input) {
    const q = query(input);
    const ref = q.TXNID ?? q.txnId ?? q.txnid;
    if (!ref) ctx.fail({ code: 'INVALID_INPUT', field: 'TXNID', message: 'The ConnectIPS redirect has no TXNID.' });
    return { ref, orderId: ref, status: 'pending', amount: null, transactionId: null, signed: false, rawStatus: '', raw: q };
  },

  verify: (ctx, input) => validate(ctx, input.ref, input.expectedAmount),
  status: (ctx, input) => validate(ctx, input.ref, input.amount, input.details)
};
