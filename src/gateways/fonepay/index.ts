import { PaymentError, connect, hmacSha512, safeEqual, tryRupees, toRupeeString, type CommonOptions, type Paisa, type Plug, type PlugContext, type PlugVerify, type CallbackResult, type InitiateResult } from '../../core';

export interface FonepayConfig {
  merchantCode: string;
  username: string;
  password: string;
  secretKey: string;
  /** Node versions without a built-in WebSocket can supply a compatible constructor. */
  webSocket?: typeof WebSocket;
}
type Input = { orderId: string; amount: Paisa; remarks1?: string; remarks2?: string };
type SocketInput = { socketUrl: string; ref: string; timeoutMs?: number };
type Context = PlugContext<FonepayConfig, { base: string }, undefined>;
const required = { type: 'string', required: true, hint: 'Use the credential from Fonepay merchant enrollment.' } as const;

function request(ctx: Context, operation: string, body: Record<string, string>, values: string[]) {
  const c = ctx.config;
  const signature = Buffer.from(hmacSha512(values.join(','), c.secretKey), 'base64').toString('hex');
  ctx.redactor.add(signature);
  return ctx.http.send({ method: 'POST', url: ctx.endpoints.base + '/merchant/merchantDetailsForThirdParty/' + operation,
    json: { ...body, merchantCode: c.merchantCode, username: c.username, password: c.password, dataValidation: signature } });
}

function traceId(value: unknown) {
  return (typeof value === 'string' && value.length > 0) || Number.isSafeInteger(value) ? String(value) : null;
}

async function lookup(ctx: Context, ref: string, callback?: CallbackResult): Promise<PlugVerify> {
  const res = await request(ctx, 'thirdPartyDynamicQrGetStatus', { prn: ref }, [ref, ctx.config.merchantCode]);
  if (res.status !== 200) ctx.failFrom(res, 'QR payment status');
  const d = res.data as Record<string, unknown> | null;
  if (!d || d.merchantCode !== ctx.config.merchantCode || d.prn !== ref || typeof d.paymentStatus !== 'string') {
    return ctx.fail({ code: 'INVALID_RESPONSE', message: 'Fonepay status must identify the requested merchant and PRN.' });
  }
  const rawStatus = d.paymentStatus;
  const transactionId = traceId(d.fonepayTraceId);
  if (callback && (!transactionId || callback.transactionId !== transactionId)) {
    return ctx.fail({ code: 'INVALID_RESPONSE', message: 'Fonepay payment event and status lookup have different trace IDs.' });
  }
  const amount = d.amount == null ? callback?.amount ?? null : tryRupees(d.amount);
  if (d.amount != null && (amount === null || (callback && callback.amount !== amount))) {
    return ctx.fail({ code: 'INVALID_RESPONSE', message: 'Fonepay returned inconsistent payment amounts.' });
  }
  const status = rawStatus.toLowerCase();
  return { ref, orderId: ref, amount, transactionId, rawStatus,
    status: status === 'success' && amount !== null && transactionId ? 'paid' : status === 'failed' ? 'failed' : status === 'pending' ? 'pending' : 'ambiguous',
    raw: { paymentStatus: rawStatus, fonepayTraceId: transactionId } };
}

function receiptSignature(ctx: Context, body: string) {
  return hmacSha512(JSON.stringify(['fonepay-payment-event-v1', ctx.mode, ctx.config.merchantCode, body]), ctx.config.secretKey);
}

async function paymentEvent(ctx: Context, input: SocketInput | { receipt: string }): Promise<Omit<CallbackResult, 'gateway'>> {
  if ('receipt' in input) {
    const [body, mac, extra] = input.receipt.split('.');
    if (extra !== undefined || !body || !mac || !safeEqual(mac, receiptSignature(ctx, body))) {
      return ctx.fail({ code: 'INVALID_SIGNATURE', message: 'Fonepay stored payment receipt does not match this merchant.' });
    }
    const { ref, amount, transactionId } = JSON.parse(Buffer.from(body, 'base64url').toString());
    return { ref, orderId: ref, amount, transactionId, status: 'pending', signed: false, rawStatus: 'PAYMENT_NOTIFICATION', raw: { receipt: input.receipt } };
  }
  const url = new URL(input.socketUrl);
  if (url.protocol !== 'wss:' || !url.hostname.endsWith('.fonepay.com') || url.username || url.password || (url.port && url.port !== '443')) {
    return ctx.fail({ code: 'INVALID_INPUT', message: 'Use the secure Fonepay socket URL saved by your server at initiation.' });
  }
  const Socket = ctx.config.webSocket ?? globalThis.WebSocket;
  if (!Socket) return ctx.fail({ code: 'INVALID_CONFIG', message: 'Fonepay notifications need Node 22+ or a compatible webSocket constructor.' });
  const timeoutMs = input.timeoutMs ?? 120000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) {
    return ctx.fail({ code: 'INVALID_INPUT', field: 'timeoutMs', message: 'Use a positive socket timeout in milliseconds.' });
  }
  const message = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const socket = new Socket(url.href);
    const timer = setTimeout(() => stop('TIMEOUT'), timeoutMs);
    function close() {
      clearTimeout(timer);
      socket.onclose = socket.onerror = socket.onmessage = null;
      socket.close();
    }
    function stop(code: 'TIMEOUT' | 'NETWORK_ERROR' | 'INVALID_RESPONSE') {
      close();
      reject(new PaymentError({ code, message: 'Fonepay payment notification could not be confirmed.' }));
    }
    socket.onerror = socket.onclose = () => stop('NETWORK_ERROR');
    socket.onmessage = e => {
      try {
        const envelope = JSON.parse(e.data);
        const event = typeof envelope.transactionStatus === 'string' ? JSON.parse(envelope.transactionStatus) : envelope.transactionStatus;
        if (!event || typeof event !== 'object') return stop('INVALID_RESPONSE');
        if (event.paymentSuccess !== true) return;
        close();
        resolve(event);
      } catch { stop('INVALID_RESPONSE'); }
    };
  });
  const amount = tryRupees(message.amount);
  const transactionId = traceId(message.traceId);
  if (message.success !== true || message.productNumber !== input.ref || !transactionId || amount === null) {
    return ctx.fail({ code: 'INVALID_RESPONSE', message: 'Fonepay payment notification must identify this PRN, its amount and trace ID.' });
  }
  const body = Buffer.from(JSON.stringify({ ref: input.ref, amount, transactionId })).toString('base64url');
  const receipt = body + '.' + receiptSignature(ctx, body);
  return { ref: input.ref, orderId: input.ref, amount, transactionId, status: 'pending', signed: false, rawStatus: 'PAYMENT_NOTIFICATION', raw: { receipt } };
}

const plug: Plug<FonepayConfig, { base: string }, undefined, Input, SocketInput | { receipt: string }, { ref: string }> = {
  name: 'fonepay', startKind: 'qr', usesCallbackEvidence: true, reportsOrderId: true,
  endpoints: { sandbox: { base: 'https://uat-new-merchant-api.fonepay.com/api' }, live: { base: 'https://merchantapi.fonepay.com/api' } },
  schema: { merchantCode: required, username: required, password: required, secretKey: required },
  secrets: c => [c.secretKey, c.password],
  describe: i => i,
  async initiate(ctx, i) {
    const amount = toRupeeString(i.amount);
    const remarks1 = i.remarks1 ?? i.orderId;
    const remarks2 = i.remarks2 ?? i.orderId;
    if (!i.amount || amount.length > 10 || [i.orderId, remarks1, remarks2].some(v => typeof v !== 'string' || !v || v.length > 25 || v.includes(','))) {
      return ctx.fail({ code: 'INVALID_INPUT', message: 'Fonepay requires a positive amount of up to 10 characters and a PRN and remarks of 1–25 characters without commas.' });
    }
    const res = await request(ctx, 'thirdPartyDynamicQrDownload', { amount, prn: i.orderId, remarks1, remarks2 },
      [amount, i.orderId, ctx.config.merchantCode, remarks1, remarks2]);
    if (res.status !== 200 && res.status !== 201) ctx.failFrom(res, 'issue QR');
    const d = res.data as Record<string, unknown> | null;
    if (d?.success !== true || d.status !== 'CREATED' || typeof d.qrMessage !== 'string' || !d.qrMessage || typeof d.thirdpartyQrWebSocketUrl !== 'string') {
      return ctx.fail({ code: 'INVALID_RESPONSE', message: 'Fonepay did not issue the requested QR and payment notification URL.' });
    }
    return { kind: 'qr', payload: d.qrMessage, ref: i.orderId, poll: { ref: i.orderId, intervalMs: 5000 }, raw: { socketUrl: d.thirdpartyQrWebSocketUrl } };
  },
  parseCallback: paymentEvent,
  verify: (ctx, i) => lookup(ctx, i.ref, i.callback),
  status: (ctx, i) => lookup(ctx, i.ref)
};
export function createFonepay(options: CommonOptions & (FonepayConfig | ({ mode: 'mock' } & Partial<FonepayConfig>))) {
  const { mode, fetch, timeoutMs, ...config } = options;
  const client = connect(plug, config as FonepayConfig, { mode, fetch, timeoutMs });
  return Object.freeze({ ...client,
    /** Start listening on the server as soon as the QR is issued. Save receipt for retries. */
    async watchPayment(start: InitiateResult, waitMs?: number) {
      if (start.gateway !== 'fonepay' || start.kind !== 'qr') {
        throw new PaymentError({ code: 'INVALID_INPUT', gateway: 'fonepay', message: 'watchPayment needs the QR returned by fonepay.initiate.' });
      }
      const raw = start.raw as { socketUrl?: string } | null;
      if (mode !== 'mock' && typeof raw?.socketUrl !== 'string') {
        throw new PaymentError({ code: 'INVALID_INPUT', gateway: 'fonepay', message: 'Keep the server-side QR result to watch its payment notification.' });
      }
      const callback = await client.parseCallback({ ref: start.ref, socketUrl: raw?.socketUrl ?? '', timeoutMs: waitMs });
      const receipt = (callback.raw as { receipt?: string } | null)?.receipt;
      return { callback, receipt };
    }
  });
}
