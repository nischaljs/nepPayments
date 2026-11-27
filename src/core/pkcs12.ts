import { createPrivateKey, type KeyObject } from 'node:crypto';
import { PaymentError } from './errors';

// node:crypto cannot open a PKCS#12 file, but it can decrypt the encrypted
// PKCS#8 key inside one. This file only walks the PKCS#12 structure (DER/BER)
// to find that key; node:crypto does all the cryptography.

const OID_DATA = '1.2.840.113549.1.7.1';
const OID_KEY_BAG = '1.2.840.113549.1.12.10.1.1';
const OID_SHROUDED_KEY_BAG = '1.2.840.113549.1.12.10.1.2';

interface Node {
  tag: number;
  constructed: boolean;
  /** Content bytes (for a constructed node, the bytes of its children). */
  body: Buffer;
  /** The whole encoding, header included. */
  whole: Buffer;
  children: Node[];
}

function parse(buf: Buffer, start = 0, end = buf.length): { node: Node; next: number } {
  if (start + 2 > end) throw new Error('truncated');
  const tag = buf[start];
  const constructed = (tag & 0x20) !== 0;
  let pos = start + 1;
  let len = buf[pos++];
  let indefinite = false;
  if (len === 0x80) {
    indefinite = true;
  } else if (len & 0x80) {
    const n = len & 0x7f;
    if (n > 4 || pos + n > end) throw new Error('bad length');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[pos++];
  }
  const children: Node[] = [];
  if (indefinite) {
    if (!constructed) throw new Error('indefinite primitive');
    let p = pos;
    while (!(buf[p] === 0 && buf[p + 1] === 0)) {
      const r = parse(buf, p, end);
      children.push(r.node);
      p = r.next;
    }
    const node = { tag, constructed, body: buf.subarray(pos, p), whole: buf.subarray(start, p + 2), children };
    return { node, next: p + 2 };
  }
  const bodyEnd = pos + len;
  if (bodyEnd > end) throw new Error('truncated');
  if (constructed) {
    let p = pos;
    while (p < bodyEnd) {
      const r = parse(buf, p, bodyEnd);
      children.push(r.node);
      p = r.next;
    }
  }
  return { node: { tag, constructed, body: buf.subarray(pos, bodyEnd), whole: buf.subarray(start, bodyEnd), children }, next: bodyEnd };
}

function oid(node: Node): string {
  if (node.tag !== 0x06) throw new Error('not an OID');
  const b = node.body;
  const parts = [Math.floor(b[0] / 40), b[0] % 40];
  let v = 0;
  for (let i = 1; i < b.length; i++) {
    v = v * 128 + (b[i] & 0x7f);
    if (!(b[i] & 0x80)) {
      parts.push(v);
      v = 0;
    }
  }
  return parts.join('.');
}

/** OCTET STRING contents; a constructed (BER) one is joined. */
function octets(node: Node): Buffer {
  if (!node.constructed) return node.body;
  return Buffer.concat(node.children.map(octets));
}

/** The value inside a [0] EXPLICIT wrapper. */
function explicit0(node: Node): Node {
  if (node.tag !== 0xa0 || node.children.length < 1) throw new Error('missing [0]');
  return node.children[0];
}

function fail(message: string): never {
  throw new PaymentError({ code: 'INVALID_CONFIG', field: 'pfx', message });
}

/**
 * The first RSA private key in a PKCS#12 file.
 * Supports keys in the plain `data` part (OpenSSL, Java keytool, Windows),
 * protected with PBES2 (AES) or the PKCS#12 3DES scheme.
 */
export function privateKeyFromPfx(pfx: Buffer, password: string): KeyObject {
  let root: Node;
  try {
    root = parse(pfx).node;
  } catch {
    return fail('pfx is not a PKCS#12 file. Pass the bytes of the .pfx file, for example fs.readFileSync(path).');
  }
  const bags: Array<{ id: string; value: Node }> = [];
  try {
    const authSafe = root.children[1];
    if (oid(authSafe.children[0]) !== OID_DATA) fail('pfx uses public-key integrity mode, which is not supported. Export it with a password.');
    const safe = parse(octets(explicit0(authSafe.children[1]))).node;
    for (const info of safe.children) {
      if (oid(info.children[0]) !== OID_DATA) continue; // encrypted parts hold certificates
      const contents = parse(octets(explicit0(info.children[1]))).node;
      for (const bag of contents.children) bags.push({ id: oid(bag.children[0]), value: explicit0(bag.children[1]) });
    }
  } catch (err) {
    if (err instanceof PaymentError) throw err;
    return fail('pfx could not be read. Check that the file is a PKCS#12 (.pfx or .p12) file.');
  }

  const shrouded = bags.find(b => b.id === OID_SHROUDED_KEY_BAG);
  if (shrouded) {
    try {
      return createPrivateKey({ key: shrouded.value.whole, format: 'der', type: 'pkcs8', passphrase: password });
    } catch {
      return fail('pfx password is wrong, or the key uses a cipher this Node.js build does not support.');
    }
  }
  const plain = bags.find(b => b.id === OID_KEY_BAG);
  if (plain) return createPrivateKey({ key: plain.value.whole, format: 'der', type: 'pkcs8' });
  return fail('pfx has no readable private key. Export it again with the key included.');
}
