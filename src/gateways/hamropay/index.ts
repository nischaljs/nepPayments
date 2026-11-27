import { connect, type Client, type CommonOptions, type Mode } from '../../core';
import { hamroPayPlug, type HamroPayCallbackInput, type HamroPayConfig, type HamroPayInitiateInput } from './plug';

export { hamroPayPlug, hamroPayStatus, hamroPaySignature, HAMROPAY_ENDPOINTS, HAMROPAY_MIN_AMOUNT, HAMROPAY_MAX_AMOUNT } from './plug';
export type { HamroPayConfig, HamroPayEndpoints, HamroPayInitiateInput, HamroPayCallbackInput } from './plug';

/** A connected Hamro Pay client. Hamro Pay has no refund API, so `refund` throws NOT_SUPPORTED. */
export type HamroPayClient = Client<HamroPayInitiateInput, HamroPayCallbackInput, { ref: string }, never>;

/**
 * Create a Hamro Pay checkout client. `initiate` creates the session on the
 * server and returns the signed form for the browser.
 *
 * @example
 * import { createHamroPay, paisa } from 'nepal-payments/hamropay';
 * const hp = createHamroPay({ mode: 'sandbox', merchantId: process.env.HP_MERCHANT_ID!, clientId: process.env.HP_CLIENT_ID!,
 *   clientApiKey: process.env.HP_CLIENT_API_KEY!, clientSecret: process.env.HP_CLIENT_SECRET! });
 * const start = await hp.initiate({ amount: paisa(1000), orderId: 'o-1-a1',
 *   successUrl: 'https://shop.example/hp/ok', failureUrl: 'https://shop.example/hp/fail' });
 */
export function createHamroPay(config: HamroPayConfig & { mode: Mode } & Partial<Omit<CommonOptions, 'mode'>>): HamroPayClient {
  const { mode, timeoutMs, fetch, ...rest } = config ?? ({} as typeof config);
  return connect(hamroPayPlug, rest, { mode, timeoutMs, fetch });
}
