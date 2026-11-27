import { hmacSha256, safeEqual, toRupeeString, tryRupees, paisa, type Paisa, type PaymentStatus, type Plug, type PlugContext, type PlugVerify } from '../../core';

/** eSewa ePay v2 config. Test values from the eSewa docs: productCode `EPAYTEST`, secretKey `8gBm/:&EnhH.1/q`. */
export interface EsewaConfig {
  /** Your merchant code (eSewa `product_code`). */
  productCode: string;
  /** The HMAC secret eSewa gave you. */
  secretKey: string;
  endpoints?: Partial<EsewaEndpoints>;
}

export interface EsewaEndpoints {
  /** The form the buyer's browser posts to. */
  form: string;
  /** The status check API. */
  status: string;
}

export const ESEWA_ENDPOINTS: { sandbox: EsewaEndpoints; live: EsewaEndpoints } = {
  sandbox: { form: 'https://rc-epay.esewa.com.np/api/epay/main/v2/form', status: 'https://rc.esewa.com.np/api/epay/transaction/status/' },
  live: { form: 'https://epay.esewa.com.np/api/epay/main/v2/form', status: 'https://esewa.com.np/api/epay/transaction/status/' }
};

export interface EsewaInitiateInput {
  /** The total the buyer pays, in paisa. Must equal amount + taxAmount + serviceCharge + deliveryCharge. */
  amount: Paisa;
  /** Your unique order id. eSewa calls it `transaction_uuid`; letters, digits and hyphens only. It is also the ref. */
  orderId: string;
  successUrl: string;
  failureUrl: string;
  /** Parts of `amount`, in paisa. Default: everything is the base amount. */
  breakdown?: { amount?: Paisa; taxAmount?: Paisa; serviceCharge?: Paisa; deliveryCharge?: Paisa };
}

/** What eSewa sends to `successUrl`: the `data` query param, the whole query, or the URL. */
export type EsewaCallbackInput = string | URL | URLSearchParams | { data?: unknown; [k: string]: unknown };

export interface EsewaStatusInput {
  /** The transaction_uuid (your order id). */
  ref: string;
  /** The total in paisa. The eSewa status API needs it. */
  amount: Paisa;
}

const STATUS: Record<string, PaymentStatus> = {
  COMPLETE: 'paid',
  PENDING: 'pending',
  FULL_REFUND: 'refunded',
  PARTIAL_REFUND: 'refunded',
  CANCELED: 'canceled',
  AMBIGUOUS: 'ambiguous',
  NOT_FOUND: 'failed'
};

/**
 * eSewa status word to the library's status. AMBIGUOUS stays `ambiguous`; unknown words too.
 *
 * @example
 * esewaStatus('AMBIGUOUS'); // 'ambiguous'
 */
export function esewaStatus(raw: string): PaymentStatus {
  return STATUS[raw.trim().toUpperCase()] ?? 'ambiguous';
}

/**
 * The eSewa signature: base64 HMAC-SHA256 of `name=value` pairs joined by commas,
 * in the order of `signed_field_names`.
 *
 * @example
 * esewaSignature({ total_amount: '100', transaction_uuid: '11-201-13', product_code: 'EPAYTEST' },
 *   'total_amount,transaction_uuid,product_code', '8gBm/:&EnhH.1/q');
 */
export function esewaSignature(values: Record<string, unknown>, signedFieldNames: string, secretKey: string): string {
  const message = signedFieldNames
    .split(',')
    .map(name => `${name}=${values[name] === undefined || values[name] === null ? '' : String(values[name])}`)
    .join(',');
  return hmacSha256(message, secretKey);
}

/**
 * The form fields for an eSewa payment, signed. Used by the plug and by `nepal-payments/compat`.
 *
 * @example
 * const fields = esewaFormFields('EPAYTEST', '8gBm/:&EnhH.1/q', { amount: rupees(100), orderId: 'o-1', successUrl, failureUrl });
 */
export function esewaFormFields(productCode: string, secretKey: string, i: EsewaInitiateInput): Record<string, string> {
  const b = i.breakdown ?? {};
  const tax = b.taxAmount ?? 0;
  const service = b.serviceCharge ?? 0;
  const delivery = b.deliveryCharge ?? 0;
  const base = b.amount ?? i.amount - tax - service - delivery;
  const fields: Record<string, string> = {
    amount: toRupeeString(paisa(base)),
    tax_amount: toRupeeString(paisa(tax)),
    total_amount: toRupeeString(paisa(i.amount)),
    transaction_uuid: i.orderId,
    product_code: productCode,
    product_service_charge: toRupeeString(paisa(service)),
    product_delivery_charge: toRupeeString(paisa(delivery)),
    success_url: i.successUrl,
    failure_url: i.failureUrl,
    signed_field_names: 'total_amount,transaction_uuid,product_code'
  };
  fields.signature = esewaSignature(fields, fields.signed_field_names, secretKey);
  return fields;
}

type Ctx = PlugContext<EsewaConfig, EsewaEndpoints, undefined>;

async function check(ctx: Ctx, ref: string, amount: Paisa): Promise<PlugVerify> {
  const res = await ctx.http.send({
    method: 'GET',
    url: ctx.endpoints.status,
    query: { product_code: ctx.config.productCode, total_amount: toRupeeString(amount), transaction_uuid: ref }
  });
  const d = res.data as Record<string, unknown> | null;
  if (res.status !== 200) ctx.failFrom(res, 'status check');
  if (!d || typeof d !== 'object' || typeof d.status !== 'string') {
    ctx.fail({ code: 'INVALID_RESPONSE', message: 'eSewa status check answered with no status.', response: { status: res.status, data: res.data } });
  }
  const rawStatus = String(d!.status);
  const status = esewaStatus(rawStatus);
  const reported = d!.total_amount === undefined || d!.total_amount === null || d!.total_amount === '' ? null : tryRupees(d!.total_amount);
  if (reported === null && d!.total_amount !== undefined && d!.total_amount !== null && d!.total_amount !== '') {
    ctx.fail({ code: 'INVALID_RESPONSE', message: 'eSewa sent a total_amount this library could not read.', response: { status: res.status, data: res.data } });
  }
  return {
    status,
    ref: typeof d!.transaction_uuid === 'string' ? d!.transaction_uuid : ref,
    orderId: typeof d!.transaction_uuid === 'string' ? d!.transaction_uuid : null,
    // NOT_FOUND echoes the amount that was asked, not one eSewa holds.
    amount: status === 'failed' && rawStatus.toUpperCase() === 'NOT_FOUND' ? null : reported,
    transactionId: typeof d!.ref_id === 'string' && d!.ref_id ? d!.ref_id : null,
    rawStatus,
    raw: d
  };
}

function dataParam(input: EsewaCallbackInput): string | undefined {
  if (typeof input === 'string') {
    if (/^https?:|^\//.test(input) || input.includes('data=')) return new URL(input, 'http://x.invalid').searchParams.get('data') ?? undefined;
    return input;
  }
  if (input instanceof URL) return input.searchParams.get('data') ?? undefined;
  if (input instanceof URLSearchParams) return input.get('data') ?? undefined;
  return typeof input?.data === 'string' ? input.data : undefined;
}

export const esewaPlug: Plug<EsewaConfig, EsewaEndpoints, undefined, EsewaInitiateInput, EsewaCallbackInput, EsewaStatusInput, never> = {
  name: 'esewa',
  schema: {
    productCode: { type: 'string', required: true, hint: "Your eSewa merchant code. For sandbox use 'EPAYTEST'." },
    secretKey: { type: 'string', required: true, hint: 'The HMAC secret from eSewa. The sandbox secret is in the eSewa ePay docs.' },
    endpoints: { type: 'object', hint: 'Pass { form, status } URLs, or leave it out.' }
  },
  endpoints: ESEWA_ENDPOINTS,
  secrets: c => [c.secretKey],
  reportsOrderId: true,
  startKind: 'form',
  describe: i => ({ amount: i?.amount, orderId: i?.orderId }),

  async initiate(ctx, i) {
    if (!/^[A-Za-z0-9-]+$/.test(i.orderId)) {
      ctx.fail({ code: 'INVALID_INPUT', field: 'orderId', message: 'eSewa orderId (transaction_uuid) may hold only letters, digits and hyphens.' });
    }
    for (const f of ['successUrl', 'failureUrl'] as const) {
      if (typeof i[f] !== 'string' || !i[f]) ctx.fail({ code: 'INVALID_INPUT', field: f, message: `eSewa initiate needs ${f}.` });
    }
    const b = i.breakdown ?? {};
    const others = (b.taxAmount ?? 0) + (b.serviceCharge ?? 0) + (b.deliveryCharge ?? 0);
    const base = b.amount ?? i.amount - others;
    if (base < 0 || base + others !== i.amount) {
      ctx.fail({ code: 'INVALID_INPUT', field: 'breakdown', message: 'eSewa breakdown parts must add up to amount.' });
    }
    const fields = esewaFormFields(ctx.config.productCode, ctx.config.secretKey, i);
    const { signature: _s, ...unsigned } = fields;
    void _s;
    return { kind: 'form', action: ctx.endpoints.form, method: 'POST', fields, ref: i.orderId, raw: unsigned };
  },

  parseCallback(ctx, input) {
    const data = dataParam(input);
    if (!data) ctx.fail({ code: 'INVALID_INPUT', field: 'data', message: 'The eSewa callback has no data param. eSewa sends it only to successUrl.' });
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(Buffer.from(String(data), 'base64').toString('utf8'));
    } catch {
      return ctx.fail({ code: 'INVALID_INPUT', field: 'data', message: 'The eSewa callback data is not base64 JSON.' });
    }
    if (!body || typeof body !== 'object' || typeof body.signed_field_names !== 'string' || typeof body.signature !== 'string') {
      ctx.fail({ code: 'INVALID_SIGNATURE', message: 'The eSewa callback has no signature.' });
    }
    const names = String(body.signed_field_names);
    if (!names.split(',').includes('transaction_uuid') || !names.split(',').includes('total_amount') || !names.split(',').includes('status')) {
      ctx.fail({ code: 'INVALID_SIGNATURE', message: 'The eSewa callback does not sign the amount, the order and the status.' });
    }
    const expected = esewaSignature(body, names, ctx.config.secretKey);
    if (!safeEqual(expected, String(body.signature))) {
      ctx.fail({ code: 'INVALID_SIGNATURE', message: 'The eSewa callback signature does not match. Do not trust this callback.' });
    }
    if (body.product_code !== ctx.config.productCode) {
      ctx.fail({ code: 'INVALID_SIGNATURE', message: 'The eSewa callback is for another merchant code.' });
    }
    const rawStatus = String(body.status ?? '');
    return {
      ref: String(body.transaction_uuid),
      orderId: String(body.transaction_uuid),
      status: esewaStatus(rawStatus),
      amount: tryRupees(body.total_amount),
      transactionId: typeof body.transaction_code === 'string' ? body.transaction_code : null,
      signed: true,
      rawStatus,
      raw: body
    };
  },

  verify: (ctx, input) => check(ctx, input.ref, input.expectedAmount),

  async status(ctx, input) {
    if (!input || typeof input.ref !== 'string' || !input.ref) ctx.fail({ code: 'INVALID_INPUT', field: 'ref', message: 'eSewa status needs ref.' });
    return check(ctx, input.ref, paisa(input.amount));
  }
};
