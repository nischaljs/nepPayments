import { createHmac, randomBytes } from 'node:crypto';
import { safeEqual } from './crypto';
import { PaymentError } from './errors';
import type { Paisa } from './money';
import type { GatewayName, MockOutcome } from './types';

const PREFIX = 'mock';
const OUTCOMES: readonly MockOutcome[] = ['paid', 'pending', 'failed'];

/** The host mock payment links point at. `.invalid` never resolves. */
export const MOCK_HOST = 'https://mock.nepal-payments.invalid';

// Made once per process. A ref typed by hand, or made by another process, fails the check.
// Kept on globalThis so the ESM and CommonJS builds, loaded in one process, share one key.
const KEY_SLOT = Symbol.for('nepal-payments.mockKey');
const store = globalThis as unknown as Record<symbol, Buffer | undefined>;
const KEY: Buffer = store[KEY_SLOT] ?? (store[KEY_SLOT] = randomBytes(32));
const sign = (body: string) => createHmac('sha256', KEY).update(body).digest('base64url');

/**
 * A mock ref holds everything verify needs, so mock mode keeps no state:
 * mock.<outcome>.<amount>.<orderId as base64url>.<random>.<HMAC of the rest>
 * The HMAC key is made per process, so a mock ref works only in the process
 * that made it: not after a restart and not on another server instance.
 */
export function mockRef(gateway: GatewayName, outcome: MockOutcome | undefined, amount: Paisa, orderId: string): string {
  const pick = outcome ?? 'paid';
  if (!OUTCOMES.includes(pick)) {
    throw new PaymentError({ code: 'INVALID_INPUT', field: 'mockOutcome', message: `mockOutcome must be 'paid', 'pending' or 'failed', got '${String(outcome)}'.` });
  }
  const rand = randomBytes(6).toString('base64url');
  const body = [PREFIX, pick, String(amount), Buffer.from(orderId, 'utf8').toString('base64url'), rand].join('.');
  return `${body}.${sign(gateway + ':' + body)}`;
}

export function readMockRef(gateway: GatewayName, ref: string): { outcome: MockOutcome; amount: Paisa; orderId: string } {
  const parts = String(ref).split('.');
  const outcome = parts[1] as MockOutcome;
  const body = parts.slice(0, 5).join('.');
  if (parts.length !== 6 || parts[0] !== PREFIX || !OUTCOMES.includes(outcome) || !/^\d+$/.test(parts[2]) || !safeEqual(parts[5], sign(gateway + ':' + body))) {
    throw new PaymentError({ code: 'INVALID_INPUT', gateway, field: 'ref', message: `In mock mode, ref must be a ref that initiate returned in mock mode, in this process.` });
  }
  return { outcome, amount: Number(parts[2]) as Paisa, orderId: Buffer.from(parts[3], 'base64url').toString('utf8') };
}
