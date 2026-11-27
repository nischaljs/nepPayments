import { PaymentError } from './errors';
import type { Mode } from './types';

/** One config field rule. `hint` tells the user how to fix it. */
export interface FieldRule {
  type: 'string' | 'number' | 'url' | 'bytes' | 'object';
  /** Required in sandbox and live. Mock never requires secrets. */
  required?: boolean;
  /** Also required in mock mode. */
  requiredInMock?: boolean;
  /** Only these values. */
  oneOf?: readonly string[];
  hint: string;
}

export type Schema = Record<string, FieldRule>;

const MODES: readonly Mode[] = ['sandbox', 'live', 'mock'];

/**
 * Check `config` against `schema`. Throws INVALID_CONFIG that names the
 * field (`khalti.secretKey`) and how to fix it. Never prints a value.
 */
export function validateConfig(gateway: string, schema: Schema, config: unknown, mode: unknown): asserts config is Record<string, unknown> {
  if (!MODES.includes(mode as Mode)) {
    throw new PaymentError({
      code: 'INVALID_CONFIG',
      field: `${gateway}.mode`,
      message: `${gateway}.mode must be 'sandbox', 'live' or 'mock', got ${describe(mode, true)}. Use 'sandbox' while testing.`
    });
  }
  if (mode === 'mock' && typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
    throw new PaymentError({
      code: 'INVALID_CONFIG',
      field: `${gateway}.mode`,
      message: `${gateway}.mode is 'mock' while NODE_ENV is 'production'. Mock mode accepts payments that never happened, so it is refused in production. Use 'live'.`
    });
  }
  if (!config || typeof config !== 'object') {
    throw new PaymentError({ code: 'INVALID_CONFIG', field: gateway, message: `${gateway} config must be an object.` });
  }
  const cfg = config as Record<string, unknown>;
  for (const [key, rule] of Object.entries(schema)) {
    const field = `${gateway}.${key}`;
    const value = cfg[key];
    const missing = value === undefined || value === null || value === '';
    if (missing) {
      const needed = mode === 'mock' ? rule.requiredInMock : rule.required;
      if (needed) throw new PaymentError({ code: 'INVALID_CONFIG', field, message: `${field} is missing. ${rule.hint}` });
      continue;
    }
    if (!fits(rule, value)) {
      throw new PaymentError({ code: 'INVALID_CONFIG', field, message: `${field} must be ${what(rule)}, got ${describe(value, Boolean(rule.oneOf))}. ${rule.hint}` });
    }
  }
}

function fits(rule: FieldRule, value: unknown): boolean {
  switch (rule.type) {
    case 'string':
      return typeof value === 'string' && (!rule.oneOf || rule.oneOf.includes(value));
    case 'number':
      return (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && /^\d+$/.test(value));
    case 'url':
      return typeof value === 'string' && /^https?:\/\/[^\s/]+/.test(value);
    case 'bytes':
      return value instanceof Uint8Array;
    case 'object':
      return typeof value === 'object' && !Array.isArray(value);
  }
}

function what(rule: FieldRule): string {
  if (rule.oneOf) return `one of ${rule.oneOf.map(v => `'${v}'`).join(', ')}`;
  return { string: 'a string', number: 'a number', url: 'an http(s) URL', bytes: 'a Buffer', object: 'an object' }[rule.type];
}

/** Type of a value for an error message. Never the value itself, which may be a secret. */
function describe(value: unknown, showText = false): string {
  if (value === undefined) return 'nothing';
  if (value === null) return 'null';
  if (typeof value === 'string') return showText && value.length <= 20 ? `'${value}'` : `a string of ${value.length} characters`;
  return Array.isArray(value) ? 'an array' : `a ${typeof value}`;
}
