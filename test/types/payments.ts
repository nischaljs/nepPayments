// Type tests: `npm run typecheck` fails if these stop holding.
import { createPayments, rupees, type StatusResult, type VerifyResult } from '../../src';

const p = createPayments({ mode: 'sandbox', khalti: { secretKey: 'x' }, esewa: { productCode: 'EPAYTEST', secretKey: 'y' } });
p.khalti.initiate({ amount: rupees(10), orderId: 'o', orderName: 'n', returnUrl: 'https://a.example', websiteUrl: 'https://a.example' });
p.esewa.initiate({ amount: rupees(10), orderId: 'o', successUrl: 'https://a.example', failureUrl: 'https://a.example' });
// @ts-expect-error connectips was not configured
p.connectips;
// @ts-expect-error amounts are Paisa, not plain numbers
p.khalti.verify({ ref: 'r', expectedAmount: 100, expectedOrderId: 'o' });
export const check = (r: VerifyResult): boolean => r.paid && r.status === 'paid';
// @ts-expect-error status() has no paid field: ship only on verify().paid
export const notForShipping = (s: StatusResult): boolean => s.paid;

createPayments({ mode: 'mock', connectips: {}, hamropay: {} }).connectips;
createPayments({ mode: 'sandbox', hamropay: { mode: 'mock' } }).hamropay;
// @ts-expect-error A live override still needs merchant credentials.
createPayments({ mode: 'mock', hamropay: { mode: 'live' } });
