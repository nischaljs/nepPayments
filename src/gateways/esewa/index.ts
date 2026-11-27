import { connect, type Client, type CommonOptions, type Mode } from '../../core';
import { esewaPlug, type EsewaCallbackInput, type EsewaConfig, type EsewaInitiateInput, type EsewaStatusInput } from './plug';

export { esewaPlug, esewaStatus, esewaSignature, esewaFormFields, ESEWA_ENDPOINTS } from './plug';
export type { EsewaConfig, EsewaEndpoints, EsewaInitiateInput, EsewaCallbackInput, EsewaStatusInput } from './plug';

/** A connected eSewa client. eSewa has no refund API, so `refund` throws NOT_SUPPORTED. */
export type EsewaClient = Client<EsewaInitiateInput, EsewaCallbackInput, EsewaStatusInput, never>;

/**
 * Create an eSewa ePay v2 client.
 *
 * @example
 * import { createEsewa, rupees } from 'nepal-payments/esewa';
 * const esewa = createEsewa({ productCode: 'EPAYTEST', secretKey: process.env.ESEWA_SECRET!, mode: 'sandbox' });
 * const start = await esewa.initiate({ amount: rupees(100), orderId: 'o-1',
 *   successUrl: 'https://shop.example/esewa/ok', failureUrl: 'https://shop.example/esewa/fail' });
 * // render start.fields as hidden inputs in a form that posts to start.action
 */
export function createEsewa(config: EsewaConfig & { mode: Mode } & Partial<Omit<CommonOptions, 'mode'>>): EsewaClient {
  const { mode, timeoutMs, fetch, ...rest } = config ?? ({} as typeof config);
  return connect(esewaPlug, rest, { mode, timeoutMs, fetch });
}
