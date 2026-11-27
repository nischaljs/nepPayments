import { PaymentError } from './errors';

declare const PAISA: unique symbol;

/**
 * An amount in paisa (1 rupee = 100 paisa): a safe, non-negative integer.
 * Every amount in this library is a Paisa. Make one with `paisa()` or `rupees()`.
 */
export type Paisa = number & { readonly [PAISA]: true };

/**
 * Make a Paisa from a whole number of paisa.
 *
 * @example
 * const amount = paisa(1000); // Rs 10
 */
export function paisa(value: number): Paisa {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new PaymentError({
      code: 'INVALID_INPUT',
      message: `Amount must be a whole number of paisa (0 or more), got ${String(value)}. Use rupees(10.5) to convert from rupees.`
    });
  }
  return value as Paisa;
}

/**
 * Make a Paisa from rupees. Accepts a number or a decimal string with at most
 * two decimals; commas are allowed ("1,000.50"). No floating point is used.
 *
 * @example
 * rupees(10.5);       // 1050 paisa
 * rupees('1,000.0');  // 100000 paisa
 */
export function rupees(value: number | string): Paisa {
  const text = typeof value === 'number' ? numberText(value) : String(value).trim().replace(/,/g, '');
  const match = /^(\d+)(?:\.(\d{0,2})0*)?$/.exec(text);
  if (!match) {
    throw new PaymentError({
      code: 'INVALID_INPUT',
      message: `Rupee amount must be 0 or more with at most two decimals, got ${JSON.stringify(value)}.`
    });
  }
  const whole = Number(match[1]);
  const frac = Number((match[2] || '').padEnd(2, '0'));
  return paisa(whole * 100 + frac);
}

/** Like rupees(), but returns null instead of throwing. For reading gateway bodies. */
export function tryRupees(value: unknown): Paisa | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  try {
    return rupees(value);
  } catch {
    return null;
  }
}

/** Like paisa(), but accepts a numeric string and returns null instead of throwing. */
export function tryPaisa(value: unknown): Paisa | null {
  const n = typeof value === 'string' && /^\d+(\.0+)?$/.test(value.trim()) ? Number(value) : value;
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? (n as Paisa) : null;
}

/**
 * Rupees as the shortest decimal string: 1000 -> "10", 1050 -> "10.5", 1005 -> "10.05".
 *
 * @example
 * toRupeeString(paisa(1050)); // "10.5"
 */
export function toRupeeString(amount: Paisa): string {
  const whole = Math.floor(amount / 100);
  const frac = amount % 100;
  if (frac === 0) return String(whole);
  return `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`;
}

/** Rupees as a number, for gateways whose JSON wants a number (Hamro Pay product prices). */
export function toRupeeNumber(amount: Paisa): number {
  return Number(toRupeeString(amount));
}

function numberText(n: number): string {
  if (!Number.isFinite(n)) return 'NaN';
  // toFixed(2) rounds; reject values with more than two decimals instead.
  const fixed = n.toFixed(2);
  return Math.abs(Number(fixed) - n) < 1e-9 ? fixed : String(n);
}
