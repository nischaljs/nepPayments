import { validateConfig, type Schema } from './config';
import { isPaymentError, PaymentError, type PaymentErrorInit } from './errors';
import { createHttp, type Http, type HttpResponse } from './http';
import { MOCK_HOST, mockRef, readMockRef } from './mock';
import { paisa, type Paisa } from './money';
import { Redactor } from './redact';
import type {
  CallbackResult,
  CommonOptions,
  GatewayName,
  InitiateCommon,
  InitiateResult,
  Mode,
  MockOutcome,
  PaymentStatus,
  RefundResult,
  StatusResult,
  VerifyInput,
  VerifyResult
} from './types';

/** What a plug gets on every call. */
export interface PlugContext<C, E, S> {
  gateway: GatewayName;
  mode: Exclude<Mode, 'mock'>;
  config: C;
  endpoints: E;
  /** What the plug's `prepare` returned (for example a loaded RSA key). */
  state: S;
  http: Http;
  redactor: Redactor;
  /** Throw a PaymentError for this gateway. */
  fail(init: Omit<PaymentErrorInit, 'gateway'>): never;
  /** Throw the right PaymentError for a gateway HTTP error answer. */
  failFrom(res: HttpResponse, what: string): never;
}

/** What a plug's verify and status report. The socket checks it. */
export type PlugVerify = Omit<StatusResult, 'gateway' | 'paid'>;

/**
 * A gateway plug. The socket (`connect`) does config validation, secret
 * redaction, mock mode and the verify checks; a plug only speaks to its gateway.
 */
export interface Plug<C, E, S, I, CB = never, SI = never, RI = never> {
  name: GatewayName;
  schema: Schema;
  endpoints: { sandbox: E; live: E | null };
  /** Config values that must never leave the library. */
  secrets(config: C): Array<string | undefined>;
  /** False when the gateway's verify answer has no order id (Khalti). */
  reportsOrderId: boolean;
  startKind: 'redirect' | 'form';
  /** Amount and order id of an initiate input. Used by mock mode and the input check. */
  describe(input: I): { amount: Paisa; orderId: string };
  prepare?(config: C, mode: Exclude<Mode, 'mock'>): S;
  initiate(ctx: PlugContext<C, E, S>, input: I): Promise<Omit<InitiateResult, 'gateway'>>;
  parseCallback?(ctx: PlugContext<C, E, S>, input: CB): Omit<CallbackResult, 'gateway'>;
  verify(ctx: PlugContext<C, E, S>, input: VerifyInput): Promise<PlugVerify>;
  status?(ctx: PlugContext<C, E, S>, input: SI): Promise<PlugVerify>;
  refund?(ctx: PlugContext<C, E, S>, input: RI): Promise<unknown>;
}

/** The client a plug becomes once connected. Each gateway narrows it with its own types. */
export interface Client<I, CB, SI, RI> {
  readonly gateway: GatewayName;
  readonly mode: Mode;
  initiate(input: I & InitiateCommon): Promise<InitiateResult>;
  verify(input: VerifyInput): Promise<VerifyResult>;
  parseCallback(input: CB): Promise<CallbackResult>;
  status(input: SI): Promise<StatusResult>;
  refund(input: RI): Promise<RefundResult>;
}

const STATUSES: readonly PaymentStatus[] = ['paid', 'pending', 'failed', 'canceled', 'refunded', 'expired', 'ambiguous'];
const MOCK_STATUS: Record<MockOutcome, PaymentStatus> = { paid: 'paid', pending: 'pending', failed: 'failed' };

/**
 * Plug a gateway into the socket.
 *
 * @example
 * const client = connect(khaltiPlug, { secretKey }, { mode: 'sandbox' });
 */
export function connect<C, E, S, I, CB, SI, RI>(
  plug: Plug<C, E, S, I, CB, SI, RI>,
  config: C & { endpoints?: Partial<E> },
  options: CommonOptions
): Client<I, CB, SI, RI> {
  const gateway = plug.name;
  const mode = options.mode;
  validateConfig(gateway, plug.schema, config, mode);

  const redactor = new Redactor();
  redactor.add(...plug.secrets(config));

  const fail = (init: Omit<PaymentErrorInit, 'gateway'>): never => {
    throw new PaymentError({ ...init, gateway });
  };

  // Turn anything thrown inside a plug into a clean PaymentError with secrets removed.
  const clean = (err: unknown): PaymentError => {
    if (isPaymentError(err)) {
      return new PaymentError({
        code: err.code,
        gateway: err.gateway ?? gateway,
        field: err.field,
        message: redactor.text(err.message),
        response: err.response ? { status: err.response.status, data: redactor.value(err.response.data) } : undefined
      });
    }
    return new PaymentError({ code: 'INVALID_RESPONSE', gateway, message: `${gateway} sent an answer this library could not read.` });
  };
  const guard = async <T>(fn: () => T | Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      throw clean(err);
    }
  };

  let ctx: PlugContext<C, E, S> | null = null;
  if (mode !== 'mock') {
    const endpoints = { ...(plug.endpoints[mode === 'live' ? 'live' : 'sandbox'] ?? {}), ...(config.endpoints ?? {}) } as E;
    if (mode === 'live' && !plug.endpoints.live && !hasAll(endpoints as object, plug.endpoints.sandbox as object)) {
      fail({
        code: 'INVALID_CONFIG',
        field: `${gateway}.endpoints`,
        message: `${gateway} does not publish its live hosts. Set ${gateway}.endpoints to the hosts ${gateway} gave you (keys: ${Object.keys(plug.endpoints.sandbox as object).join(', ')}).`
      });
    }
    let state: S;
    try {
      state = plug.prepare ? plug.prepare(config, mode) : (undefined as S);
    } catch (err) {
      throw clean(err);
    }
    ctx = {
      gateway,
      mode,
      config,
      endpoints,
      state,
      redactor,
      http: createHttp({ gateway, timeoutMs: options.timeoutMs ?? 15000, fetch: options.fetch, redactor }),
      fail,
      failFrom(res, what) {
        const code = res.status === 401 || res.status === 403 ? 'AUTH_ERROR' : 'GATEWAY_ERROR';
        return fail({ code, message: `${gateway} ${what} failed (HTTP ${res.status})${gatewayMessage(res.data)}.`, response: { status: res.status, data: res.data } });
      }
    };
  }

  const check = (input: VerifyInput) => {
    if (!input || typeof input.ref !== 'string' || !input.ref) fail({ code: 'INVALID_INPUT', field: 'ref', message: 'verify needs ref: the ref initiate returned, stored with your order.' });
    if (typeof input.expectedOrderId !== 'string' || !input.expectedOrderId) {
      fail({ code: 'INVALID_INPUT', field: 'expectedOrderId', message: 'verify needs expectedOrderId: your order id, from your database.' });
    }
    if (input.expectedAmount === undefined) fail({ code: 'INVALID_INPUT', field: 'expectedAmount', message: 'verify needs expectedAmount in paisa, from your database. Never take it from the callback.' });
    paisa(input.expectedAmount);
  };

  const finish = (r: PlugVerify): StatusResult => {
    if (!STATUSES.includes(r.status)) fail({ code: 'INVALID_RESPONSE', message: `${gateway} plug returned an unknown status.` });
    return Object.freeze({ gateway, ...r, raw: redactor.value(r.raw), paid: r.status === 'paid' });
  };

  const mockVerify = (ref: string): PlugVerify => {
    const m = readMockRef(gateway, ref);
    const status = MOCK_STATUS[m.outcome];
    return { status, ref, orderId: m.orderId, amount: m.amount, transactionId: status === 'paid' ? `mock-txn-${ref.split('.')[4]}` : null, rawStatus: `MOCK_${m.outcome.toUpperCase()}`, raw: { mock: true, outcome: m.outcome } };
  };

  const notSupported = (op: string): never =>
    fail({ code: 'NOT_SUPPORTED', message: `${gateway} has no ${op} in this library.` });

  const client: Client<I, CB, SI, RI> = {
    gateway,
    mode,

    initiate: input =>
      guard(async () => {
        const { amount, orderId } = plug.describe(input);
        paisa(amount);
        if (!orderId) fail({ code: 'INVALID_INPUT', field: 'orderId', message: 'initiate needs orderId: your own unique order id.' });
        if (!ctx) {
          const ref = mockRef(input.mockOutcome, amount, orderId);
          const start =
            plug.startKind === 'redirect'
              ? { kind: 'redirect' as const, url: `${MOCK_HOST}/${gateway}/pay?ref=${encodeURIComponent(ref)}` }
              : { kind: 'form' as const, action: `${MOCK_HOST}/${gateway}/pay`, method: 'POST' as const, fields: { ref } };
          return Object.freeze({ gateway, ...start, ref, raw: { mock: true } });
        }
        const r = await plug.initiate(ctx, input);
        if (!r || !['redirect', 'form', 'qr'].includes(r.kind) || !r.ref) fail({ code: 'INVALID_RESPONSE', message: `${gateway} plug returned no start shape.` });
        return Object.freeze({ gateway, ...r, raw: redactor.value(r.raw) } as InitiateResult);
      }),

    verify: input =>
      guard(async () => {
        check(input);
        const r = finish(ctx ? await plug.verify(ctx, input) : mockVerify(input.ref));
        if (r.ref !== input.ref) {
          fail({ code: 'INVALID_RESPONSE', message: `${gateway} answered for a different ref than the one asked.`, response: { status: 200, data: r.raw } });
        }
        let amountChecked = false;
        if (r.amount !== null) {
          amountChecked = true;
          if (r.amount !== input.expectedAmount) {
            fail({
              code: 'AMOUNT_MISMATCH',
              message: `${gateway} reports ${r.amount} paisa for ref ${input.ref}, but you expected ${input.expectedAmount} paisa. Do not ship this order.`,
              response: { status: 200, data: r.raw }
            });
          }
        } else if (r.status === 'paid') {
          fail({ code: 'INVALID_RESPONSE', message: `${gateway} reports paid with no amount; cannot check it.`, response: { status: 200, data: r.raw } });
        }
        let orderChecked = false;
        const reportsOrderId = ctx ? plug.reportsOrderId : true;
        if (reportsOrderId) {
          if (r.orderId === null) {
            if (r.status === 'paid') fail({ code: 'INVALID_RESPONSE', message: `${gateway} reports paid with no order id; cannot check it.`, response: { status: 200, data: r.raw } });
          } else {
            orderChecked = true;
            if (r.orderId !== input.expectedOrderId) {
              fail({
                code: 'ORDER_MISMATCH',
                message: `${gateway} reports order ${JSON.stringify(r.orderId)} for ref ${input.ref}, but you expected ${JSON.stringify(input.expectedOrderId)}. Do not ship this order.`,
                response: { status: 200, data: r.raw }
              });
            }
          }
        }
        return Object.freeze({ ...r, checked: { amount: amountChecked, orderId: orderChecked } });
      }),

    parseCallback: input =>
      guard(() => {
        if (!ctx) {
          const values = Object.values((input ?? {}) as Record<string, unknown>).filter((v): v is string => typeof v === 'string');
          const ref = values.find(v => v.startsWith('mock.'));
          if (!ref) fail({ code: 'INVALID_INPUT', message: 'In mock mode, parseCallback needs an object with the mock ref as one of its values, such as { ref }.' });
          const v = mockVerify(ref as string);
          return Object.freeze({ gateway, ...v, signed: false });
        }
        if (!plug.parseCallback) return notSupported('callback');
        const r = plug.parseCallback(ctx, input);
        if (!STATUSES.includes(r.status)) fail({ code: 'INVALID_RESPONSE', message: `${gateway} plug returned an unknown status.` });
        return Object.freeze({ gateway, ...r, raw: redactor.value(r.raw) });
      }),

    status: input =>
      guard(async () => {
        if (!ctx) {
          const ref = typeof input === 'string' ? input : (input as { ref?: string } | null)?.ref;
          return finish(mockVerify(String(ref)));
        }
        if (!plug.status) return notSupported('status call');
        return finish(await plug.status(ctx, input));
      }),

    refund: input =>
      guard(async () => {
        if (!plug.refund) return notSupported('refund');
        if (!ctx) return Object.freeze({ gateway, ok: true as const, raw: { mock: true } });
        const raw = await plug.refund(ctx, input);
        return Object.freeze({ gateway, ok: true as const, raw: redactor.value(raw) });
      })
  };
  return Object.freeze(client);
}

function hasAll(obj: object, keys: object): boolean {
  return Object.keys(keys).every(k => typeof (obj as Record<string, unknown>)[k] === 'string' && (obj as Record<string, string>)[k]);
}

function gatewayMessage(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const d = data as Record<string, unknown>;
  const text = [d.detail, d.error_message, d.message, d.statusDesc].find(v => typeof v === 'string');
  return text ? `: ${String(text)}` : '';
}
