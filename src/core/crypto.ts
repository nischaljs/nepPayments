import { createHmac, createPrivateKey, createSign, timingSafeEqual, type KeyObject } from 'node:crypto';
import { PaymentError } from './errors';
import { privateKeyFromPfx } from './pkcs12';

export type Encoding = 'base64' | 'hex';

/**
 * HMAC-SHA256 of `message` with `secret`.
 *
 * @example
 * hmacSha256('total_amount=100,transaction_uuid=11-201-13,product_code=EPAYTEST', secret, 'base64');
 */
export function hmacSha256(message: string, secret: string, encoding: Encoding = 'base64'): string {
  return createHmac('sha256', secret).update(message, 'utf8').digest(encoding);
}

/**
 * HMAC-SHA512 of `message` with `secret`.
 *
 * @example
 * hmacSha512('T1,1000,M,C,K', clientSecret, 'base64');
 */
export function hmacSha512(message: string, secret: string, encoding: Encoding = 'base64'): string {
  return createHmac('sha512', secret).update(message, 'utf8').digest(encoding);
}

/**
 * Compare two strings in constant time. False when the lengths differ.
 *
 * @example
 * if (!safeEqual(received, expected)) throw new Error('bad signature');
 */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  if (x.length !== y.length) {
    timingSafeEqual(x, x);
    return false;
  }
  return timingSafeEqual(x, y);
}

/**
 * Load an RSA private key from a PKCS#12 (.pfx/.p12) file or from PEM.
 * Runs once per client; keep the returned KeyObject, not the password.
 *
 * @example
 * const key = loadPrivateKey({ pfx: fs.readFileSync('CREDITOR.pfx'), password: process.env.CIPS_PFX_PASSWORD });
 */
export function loadPrivateKey(source: { pfx?: Buffer | Uint8Array; password?: string; pem?: string }, field = 'privateKey'): KeyObject {
  try {
    if (source.pem) return createPrivateKey({ key: source.pem, format: 'pem' });
    if (source.pfx) return privateKeyFromPfx(Buffer.from(source.pfx), source.password ?? '');
  } catch (err) {
    if (err instanceof PaymentError) throw err;
    throw new PaymentError({
      code: 'INVALID_CONFIG',
      field,
      message: `${field} could not be read. Check that the file is the .pfx NCHL gave you and that the password is right.`
    });
  }
  throw new PaymentError({ code: 'INVALID_CONFIG', field, message: `${field} is missing. Pass pfx and pfxPassword, or privateKeyPem.` });
}

/**
 * RSA-SHA256 (PKCS#1 v1.5) signature of `message`, base64.
 *
 * @example
 * rsaSha256Sign('MERCHANTID=550,APPID=MER-550-APP-1,REFERENCEID=txn-123,TXNAMT=500', key);
 */
export function rsaSha256Sign(message: string, key: KeyObject): string {
  return createSign('RSA-SHA256').update(message, 'utf8').sign(key, 'base64');
}
