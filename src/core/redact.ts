/** Key names whose values are never shown in errors or debug output. */
const SECRET_KEY = /secret|password|passphrase|api[-_]?key|authorization|private[-_]?key|pfx/i;

export const REDACTED = '[redacted]';

/**
 * Holds the secret strings of one gateway client and removes them from any
 * value before it leaves the library (errors, `raw` bodies, messages).
 */
export class Redactor {
  private readonly secrets: string[] = [];

  add(...values: Array<string | undefined | null>): void {
    for (const v of values) {
      if (typeof v === 'string' && v.length >= 4 && !this.secrets.includes(v)) this.secrets.push(v);
    }
    // Longest first, so a secret that contains another is removed whole.
    this.secrets.sort((a, b) => b.length - a.length);
  }

  /**
   * A new redactor that starts with this one's secrets. Values added to the
   * copy stay in the copy, so per-call values never pile up in a shared one.
   */
  fork(): Redactor {
    const r = new Redactor();
    r.secrets.push(...this.secrets);
    return r;
  }

  /** How many secret strings it holds. */
  get size(): number {
    return this.secrets.length;
  }

  text(value: string): string {
    let out = value;
    for (const s of this.secrets) out = out.split(s).join(REDACTED);
    return out;
  }

  /** Deep copy of `value` with secret keys and secret strings removed. */
  value<T>(value: T): T {
    return this.walk(value, 0) as T;
  }

  private walk(value: unknown, depth: number): unknown {
    if (depth > 20) return '[too deep]';
    if (typeof value === 'string') return this.text(value);
    if (Array.isArray(value)) return value.map(v => this.walk(v, depth + 1));
    if (value && typeof value === 'object') {
      if (typeof (value as { byteLength?: unknown }).byteLength === 'number') return REDACTED;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = SECRET_KEY.test(k) && v !== null && v !== undefined ? REDACTED : this.walk(v, depth + 1);
      }
      return out;
    }
    return value;
  }
}
