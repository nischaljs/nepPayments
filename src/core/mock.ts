import { PaymentError } from './errors';
import type { Paisa } from './money';
import type { GatewayName, MockOutcome } from './types';

const PREFIX = 'mock';
const OUTCOMES: readonly MockOutcome[] = ['paid', 'pending', 'failed'];

/** The host mock payment links point at. `.invalid` never resolves. */
export const MOCK_HOST = 'https://mock.nepal-payments.invalid';

/**
 * A mock ref holds everything verify needs, so mock mode keeps no state and
 * works across server restarts and serverless calls:
 * mock.<outcome>.<amount>.<orderId as base64url>.<random>
 */
export function mockRef(outcome: MockOutcome | undefined, amount: Paisa, orderId: string): string {
  const pick = outcome ?? 'paid';
  if (!OUTCOMES.includes(pick)) {
    throw new PaymentError({ code: 'INVALID_INPUT', field: 'mockOutcome', message: `mockOutcome must be 'paid', 'pending' or 'failed', got '${String(outcome)}'.` });
  }
  const rand = Math.random().toString(36).slice(2, 10);
  return [PREFIX, pick, String(amount), Buffer.from(orderId, 'utf8').toString('base64url'), rand].join('.');
}

export function readMockRef(gateway: GatewayName, ref: string): { outcome: MockOutcome; amount: Paisa; orderId: string } {
  const parts = String(ref).split('.');
  const outcome = parts[1] as MockOutcome;
  if (parts.length !== 5 || parts[0] !== PREFIX || !OUTCOMES.includes(outcome) || !/^\d+$/.test(parts[2])) {
    throw new PaymentError({ code: 'INVALID_INPUT', gateway, field: 'ref', message: `In mock mode, ref must be a ref that initiate returned in mock mode.` });
  }
  return { outcome, amount: Number(parts[2]) as Paisa, orderId: Buffer.from(parts[3], 'base64url').toString('utf8') };
}
