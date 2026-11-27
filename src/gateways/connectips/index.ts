import { connect, type Client, type CommonOptions, type Mode } from '../../core';
import { connectIpsPlug, type ConnectIpsStatusInput, type ConnectIpsCallbackInput, type ConnectIpsConfig, type ConnectIpsInitiateInput } from './plug';

export { connectIpsPlug, connectIpsStatus, connectIpsDate, connectIpsFormMessage, connectIpsValidateMessage, CONNECTIPS_ENDPOINTS } from './plug';
export type { ConnectIpsStatusInput, ConnectIpsConfig, ConnectIpsEndpoints, ConnectIpsInitiateInput, ConnectIpsCallbackInput } from './plug';

/** A connected ConnectIPS client. Refund is not in this library, so `refund` throws NOT_SUPPORTED. */
export type ConnectIpsClient = Client<ConnectIpsInitiateInput, ConnectIpsCallbackInput, ConnectIpsStatusInput, never>;

/**
 * Create a ConnectIPS client. See the merchant guide for the limits of the amount check.
 * Use a new orderId for every payment attempt. The private key is read once, here; a wrong
 * pfx password throws INVALID_CONFIG now, not on the first payment.
 *
 * @example
 * import fs from 'node:fs';
 * import { createConnectIps, paisa } from 'nepal-payments/connectips';
 * const cips = createConnectIps({ mode: 'sandbox', merchantId: 123, appId: 'MER-123-APP-1', appName: 'Shop',
 *   password: process.env.CIPS_PASSWORD!, pfx: fs.readFileSync('CREDITOR.pfx'), pfxPassword: process.env.CIPS_PFX_PASSWORD! });
 * const start = await cips.initiate({ amount: paisa(50000), orderId: 'o-1' });
 */
export function createConnectIps(config: ConnectIpsConfig & { mode: Mode } & Partial<Omit<CommonOptions, 'mode'>>): ConnectIpsClient {
  const { mode, timeoutMs, fetch, ...rest } = config ?? ({} as typeof config);
  return connect(connectIpsPlug, rest, { mode, timeoutMs, fetch });
}
