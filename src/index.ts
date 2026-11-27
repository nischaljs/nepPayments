import { PaymentError, type CommonOptions, type GatewayName, type Mode } from './core';
import { createConnectIps, type ConnectIpsClient, type ConnectIpsConfig } from './gateways/connectips';
import { createEsewa, type EsewaClient, type EsewaConfig } from './gateways/esewa';
import { createHamroPay, type HamroPayClient, type HamroPayConfig } from './gateways/hamropay';
import { createKhalti, type KhaltiClient, type KhaltiConfig } from './gateways/khalti';

export * from './core/public';
export * from './gateways/khalti';
export * from './gateways/esewa';
export * from './gateways/connectips';
export * from './gateways/hamropay';

interface Configs {
  khalti: KhaltiConfig;
  esewa: EsewaConfig;
  connectips: ConnectIpsConfig;
  hamropay: HamroPayConfig;
}

interface Clients {
  khalti: KhaltiClient;
  esewa: EsewaClient;
  connectips: ConnectIpsClient;
  hamropay: HamroPayClient;
}

/** Options for `createPayments`. Set `mode` once at the top, or per gateway. */
export type PaymentsOptions = {
  /** Default mode for every gateway below. */
  mode?: Mode;
  timeoutMs?: number;
  fetch?: typeof fetch;
} & { [K in GatewayName]?: Configs[K] & { mode?: Mode; timeoutMs?: number } };

/** The result of `createPayments`: only the gateways you configured. */
export type Payments<O extends PaymentsOptions> = {
  readonly [K in GatewayName as O[K] extends object ? K : never]: Clients[K];
};

const MAKERS = { khalti: createKhalti, esewa: createEsewa, connectips: createConnectIps, hamropay: createHamroPay } as const;

/**
 * Create clients for the gateways you use. Only the gateways in `options` exist
 * on the result, and TypeScript knows which.
 *
 * @example
 * import { createPayments, paisa } from 'nepal-payments';
 * const payments = createPayments({ mode: 'sandbox', khalti: { secretKey: process.env.KHALTI_SECRET_KEY! } });
 * const start = await payments.khalti.initiate({ amount: paisa(1000), orderId: 'o-1', orderName: 'Tea',
 *   returnUrl: 'https://shop.example/paid', websiteUrl: 'https://shop.example' });
 * // later, on your server:
 * const result = await payments.khalti.verify({ ref: start.ref, expectedAmount: paisa(1000), expectedOrderId: 'o-1' });
 * if (result.paid) shipOrder();
 */
export function createPayments<const O extends PaymentsOptions>(options: O): Payments<O> {
  if (!options || typeof options !== 'object') {
    throw new PaymentError({ code: 'INVALID_CONFIG', message: 'createPayments needs an options object, such as { mode: "sandbox", khalti: { secretKey } }.' });
  }
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(MAKERS) as GatewayName[]) {
    const cfg = options[name];
    if (cfg === undefined) continue;
    const merged = { timeoutMs: options.timeoutMs, fetch: options.fetch, ...cfg, mode: cfg?.mode ?? options.mode } as Configs[typeof name] & CommonOptions;
    out[name] = (MAKERS[name] as (c: typeof merged) => unknown)(merged);
  }
  if (Object.keys(out).length === 0) {
    throw new PaymentError({ code: 'INVALID_CONFIG', message: 'createPayments needs at least one gateway: khalti, esewa, connectips or hamropay.' });
  }
  return Object.freeze(out) as Payments<O>;
}
