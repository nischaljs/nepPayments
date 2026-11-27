import { randomUUID } from 'node:crypto';
import { connect, hmacSha256, safeEqual, tryRupees, type CommonOptions, type Paisa, type Plug } from '../../core';

/** A bank-provisioned Cybersource Secure Acceptance Hosted Checkout profile. */
export interface BankCardConfig {
  profileId: string;
  accessKey: string;
  secretKey: string;
}
type Input = { amount: Paisa; orderId: string };
type Notification = URLSearchParams | string | Record<string, string>;
const required = { type: 'string', required: true, hint: 'Copy this from the bank-provisioned Secure Acceptance profile.' } as const;

function sign(fields: Record<string, string>, names: string[], secret: string) {
  return hmacSha256(names.map(k => k + '=' + fields[k]).join(','), secret);
}

const plug: Plug<BankCardConfig, { checkout: string }, undefined, Input, Notification> = {
  name: 'bankcard', startKind: 'form', usesCallbackEvidence: true, reportsOrderId: true,
  endpoints: { sandbox: { checkout: 'https://testsecureacceptance.cybersource.com/pay' }, live: { checkout: 'https://secureacceptance.cybersource.com/pay' } },
  schema: { profileId: required, accessKey: required, secretKey: required },
  secrets: c => [c.secretKey],
  describe: i => i,
  async initiate(ctx, i) {
    if (!i.amount || i.amount > 999999999999 || !/^[A-Za-z0-9._-]{1,50}$/.test(i.orderId)) {
      return ctx.fail({ code: 'INVALID_INPUT', message: 'Supply a positive card sale amount of up to 12 digits in paisa and a unique reference of 1–50 letters, digits, dots, underscores or hyphens.' });
    }
    const ref = randomUUID();
    const fields: Record<string, string> = {
      access_key: ctx.config.accessKey, profile_id: ctx.config.profileId, transaction_uuid: ref,
      signed_date_time: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), locale: 'en', transaction_type: 'sale',
      reference_number: i.orderId, amount: (i.amount / 100).toFixed(2), currency: 'NPR', payment_method: 'card',
      unsigned_field_names: '', signed_field_names: ''
    };
    const names = Object.keys(fields);
    fields.signed_field_names = names.join(',');
    fields.signature = sign(fields, names, ctx.config.secretKey);
    return { kind: 'form', action: ctx.endpoints.checkout, method: 'POST', fields, ref, raw: null };
  },
  parseCallback(ctx, input) {
    const params = input instanceof URLSearchParams ? input : new URLSearchParams(input);
    const fields = Object.fromEntries(params);
    const names = (fields.signed_field_names ?? '').split(',');
    const requiredFields = ['signed_field_names', 'decision', 'reason_code', 'req_profile_id', 'req_transaction_uuid',
      'req_transaction_type', 'req_reference_number', 'req_currency', 'req_amount'];
    if (fields.decision === 'ACCEPT') requiredFields.push('auth_amount', 'transaction_id');
    if (new Set(names).size !== names.length || names.some(k => !/^\w+$/.test(k) || params.getAll(k).length !== 1)
        || requiredFields.some(k => !names.includes(k) || !fields[k]) || params.getAll('signature').length !== 1
        || !safeEqual(sign(fields, names, ctx.config.secretKey), fields.signature)) {
      return ctx.fail({ code: 'INVALID_SIGNATURE', message: 'Bank checkout notification is missing a valid signature over the required sale fields.' });
    }
    if (fields.req_profile_id !== ctx.config.profileId || fields.req_currency !== 'NPR' || fields.req_transaction_type !== 'sale') {
      return ctx.fail({ code: 'INVALID_RESPONSE', message: 'Bank notification is for another profile, currency or transaction type.' });
    }
    const accepted = fields.decision === 'ACCEPT' && fields.reason_code === '100';
    const amount = accepted ? tryRupees(fields.auth_amount) : null;
    if (accepted && (amount === null || amount !== tryRupees(fields.req_amount))) {
      return ctx.fail({ code: 'AMOUNT_MISMATCH', message: 'Bank checkout did not authorize the full requested sale amount.' });
    }
    const status = accepted ? 'paid' : fields.decision === 'DECLINE' ? 'failed' : fields.decision === 'CANCEL' ? 'canceled' : 'ambiguous';
    return { ref: fields.req_transaction_uuid, orderId: fields.req_reference_number, amount, status, signed: true,
      transactionId: names.includes('transaction_id') ? fields.transaction_id : null, rawStatus: fields.decision, raw: { reasonCode: fields.reason_code } };
  },
  async verify(ctx, input) {
    const cb = input.callback;
    if (!cb?.signed) return ctx.fail({ code: 'INVALID_INPUT', message: 'Pass the signed sale notification returned by this bankcard client’s parseCallback.' });
    return { ref: cb.ref, orderId: cb.orderId, amount: cb.amount, status: cb.status, transactionId: cb.transactionId, rawStatus: cb.rawStatus, raw: cb.raw };
  }
};
export function createBankCard(options: CommonOptions & (BankCardConfig | ({ mode: 'mock' } & Partial<BankCardConfig>))) {
  const { mode, fetch, timeoutMs, ...config } = options;
  return connect(plug, config as BankCardConfig, { mode, fetch, timeoutMs });
}
