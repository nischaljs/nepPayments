import { connect, type Client, type CommonOptions, type Mode } from '../../core';
import { khaltiPlug, type KhaltiCallbackInput, type KhaltiConfig, type KhaltiInitiateInput, type KhaltiRefundInput } from './plug';

export { khaltiPlug, khaltiStatus, KHALTI_ENDPOINTS, KHALTI_MIN_AMOUNT } from './plug';
export type { KhaltiConfig, KhaltiEndpoints, KhaltiInitiateInput, KhaltiRefundInput, KhaltiCallbackInput } from './plug';

/** A connected Khalti client. */
export type KhaltiClient = Client<KhaltiInitiateInput, KhaltiCallbackInput, { ref: string }, KhaltiRefundInput>;

/**
 * Create a Khalti client (KPG-2 ePayment).
 *
 * @example
 * import { createKhalti, paisa } from 'nepal-payments/khalti';
 * const khalti = createKhalti({ secretKey: process.env.KHALTI_SECRET_KEY!, mode: 'sandbox' });
 * const start = await khalti.initiate({ amount: paisa(1000), orderId: 'o-1', orderName: 'Tea',
 *   returnUrl: 'https://shop.example/paid', websiteUrl: 'https://shop.example' });
 * // save start.ref with the order, then redirect to start.url
 */
export function createKhalti(config: KhaltiConfig & { mode: Mode } & Partial<Omit<CommonOptions, 'mode'>>): KhaltiClient {
  const { mode, timeoutMs, fetch, ...rest } = config ?? ({} as typeof config);
  return connect(khaltiPlug, rest, { mode, timeoutMs, fetch });
}
