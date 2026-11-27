const test = require('node:test');
const assert = require('node:assert/strict');
const util = require('node:util');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const np = require('../dist');
const { fakeFetch, fakeKhalti, fakeEsewa, fakeConnectIps, fakeHamroPay, esewaCallback, hamroPayWebhook } = require('../dist/testing');
const { createPayments, paisa, rupees, toRupeeString, isPaymentError } = np;

const KHALTI_SECRET = 'test_secret_key_f59e8b7d18b4499ca40f68195a846e9b';
const ESEWA_SECRET = '8gBm/:&EnhH.1/q';
const HAMRO = { merchantId: 'M-1', clientId: 'C-1', clientApiKey: 'apikey-hidden-123', clientSecret: 'hamro-secret-xyz', webhookSecret: 'hook-secret-abc' };
const CIPS = { merchantId: 123, appId: 'MER-123-APP-1', appName: 'Shop', password: 'cips-password-777', pfxPassword: 'test-only' };
const fixture = f => fs.readFileSync(path.join(__dirname, 'fixtures', f));
const SECRETS = [KHALTI_SECRET, ESEWA_SECRET, HAMRO.clientSecret, HAMRO.webhookSecret, HAMRO.clientApiKey, CIPS.password, 'test-only'];

function noSecret(thing, label) {
  const seen = [JSON.stringify(thing), String(thing), util.inspect(thing, { depth: 20, showHidden: true })];
  if (thing && typeof thing === 'object' && 'stack' in thing) seen.push(String(thing.stack));
  for (const s of SECRETS) for (const text of seen) assert.ok(!text.includes(s), `${label}: secret ${s.slice(0, 4)}… leaked`);
}

async function rejects(p, code) {
  try {
    await p;
  } catch (e) {
    assert.ok(isPaymentError(e), `expected PaymentError, got ${e}`);
    assert.equal(e.code, code, e.message);
    noSecret(e, code);
    return e;
  }
  assert.fail(`expected ${code}`);
}

function all(fetch) {
  return createPayments({
    mode: 'sandbox',
    fetch,
    khalti: { secretKey: KHALTI_SECRET },
    esewa: { productCode: 'EPAYTEST', secretKey: ESEWA_SECRET },
    connectips: { ...CIPS, pfx: fixture('test-aes.pfx') },
    hamropay: HAMRO
  });
}

// ---------- money ----------
test('money: rupees and paisa', () => {
  assert.equal(rupees(100), 10000);
  assert.equal(rupees('1,234.5'), 123450);
  assert.equal(toRupeeString(paisa(10050)), '100.5');
  assert.throws(() => rupees(1.234), e => e.code === 'INVALID_INPUT');
  assert.throws(() => paisa(1.5), e => e.code === 'INVALID_INPUT');
  assert.throws(() => paisa(-1), e => e.code === 'INVALID_INPUT');
});

// ---------- createPayments ----------
test('createPayments: only configured gateways exist, config errors name the field', () => {
  const p = createPayments({ mode: 'sandbox', khalti: { secretKey: KHALTI_SECRET } });
  assert.deepEqual(Object.keys(p), ['khalti']);
  assert.ok(Object.isFrozen(p));
  assert.throws(() => createPayments({ mode: 'sandbox' }), e => e.code === 'INVALID_CONFIG');
  assert.throws(() => createPayments({ mode: 'sandbox', khalti: {} }), e => e.code === 'INVALID_CONFIG' && e.field === 'khalti.secretKey');
  assert.throws(() => createPayments({ mode: 'nope', khalti: { secretKey: 'x' } }), e => e.code === 'INVALID_CONFIG');
  assert.throws(() => createPayments({ mode: 'live', hamropay: HAMRO }), e => e.code === 'INVALID_CONFIG' && /endpoints/.test(e.message));
  const live = createPayments({ mode: 'live', hamropay: { ...HAMRO, endpoints: { api: 'https://a.example', gateway: 'https://g.example' } } });
  assert.equal(live.hamropay.mode, 'live');
});

test('clients and config errors never show a secret', () => {
  const p = all(fakeFetch());
  for (const k of Object.keys(p)) noSecret(p[k], `client ${k}`);
  try {
    createPayments({ mode: 'sandbox', hamropay: { ...HAMRO, merchantId: 5 } });
    assert.fail();
  } catch (e) {
    noSecret(e, 'config error');
  }
});

// ---------- Khalti ----------
test('khalti: initiate shape and body', async () => {
  const fake = fakeKhalti();
  const p = all(fakeFetch(fake.handler));
  const s = await p.khalti.initiate({ amount: rupees(10), orderId: 'o-1', orderName: 'Shirt', returnUrl: 'https://shop.example/r', websiteUrl: 'https://shop.example' });
  assert.equal(s.kind, 'redirect');
  assert.equal(s.gateway, 'khalti');
  assert.match(s.url, /pidx=/);
  assert.ok(s.ref.startsWith('pidx'));
  assert.ok(s.expiresAt);
  const call = fake.calls[0];
  assert.equal(call.path, '/api/v2/epayment/initiate/');
  assert.equal(call.headers.authorization, `Key ${KHALTI_SECRET}`);
  assert.deepEqual({ a: call.body.amount, o: call.body.purchase_order_id }, { a: 1000, o: 'o-1' });
  await rejects(p.khalti.initiate({ amount: paisa(999), orderId: 'o', orderName: 'n', returnUrl: 'https://a.example', websiteUrl: 'https://a.example' }), 'INVALID_INPUT');
});

test('khalti: verify paid, amount mismatch, statuses', async () => {
  const fake = fakeKhalti();
  const p = all(fakeFetch(fake.handler));
  const s = await p.khalti.initiate({ amount: rupees(10), orderId: 'o-1', orderName: 'Shirt', returnUrl: 'https://shop.example/r', websiteUrl: 'https://shop.example' });
  const v = await p.khalti.verify({ ref: s.ref, expectedAmount: rupees(10), expectedOrderId: 'o-1' });
  assert.equal(v.status, 'paid');
  assert.equal(v.paid, true);
  assert.equal(v.amount, 1000);
  assert.deepEqual(v.checked, { amount: true, orderId: false, callback: false });
  assert.ok(Object.isFrozen(v));
  const st = await p.khalti.status(s.ref);
  assert.equal(st.status, 'paid');
  assert.equal('paid' in st, false, 'status() is not for fulfilment and has no paid field');
  assert.equal('checked' in st, false);
  assert.ok(Object.isFrozen(st));
  await rejects(p.khalti.verify({ ref: s.ref, expectedAmount: rupees(11), expectedOrderId: 'o-1' }), 'AMOUNT_MISMATCH');
  for (const [raw, want] of [['Pending', 'pending'], ['Initiated', 'pending'], ['Expired', 'expired'], ['User canceled', 'canceled'], ['Refunded', 'refunded'], ['Partially Refunded', 'refunded'], ['Something new', 'ambiguous']]) {
    fake.set(s.ref, { status: raw });
    const r = await p.khalti.verify({ ref: s.ref, expectedAmount: rupees(10), expectedOrderId: 'o-1' });
    assert.equal(r.status, want, raw);
    assert.equal(r.paid, false);
  }
  await rejects(p.khalti.verify({ ref: 'nope', expectedAmount: rupees(10), expectedOrderId: 'o-1' }), 'GATEWAY_ERROR');
});

test('khalti: status map and callback', async () => {
  assert.equal(np.khaltiStatus('Completed'), 'paid');
  const p = all(fakeFetch());
  const cb = await p.khalti.parseCallback('https://shop.example/r?pidx=abc&status=Completed&total_amount=1000&purchase_order_id=o-1&transaction_id=t1');
  assert.equal(cb.ref, 'abc');
  assert.equal(cb.signed, false);
});

test('khalti: refund and auth error', async () => {
  const fake = fakeKhalti();
  const p = all(fakeFetch(fake.handler));
  const r = await p.khalti.refund({ transactionId: 'T1', amount: paisa(500) });
  assert.equal(r.ok, true);
  assert.equal(fake.calls[0].path, '/api/merchant-transaction/T1/refund/');
  const bad = createPayments({ mode: 'sandbox', fetch: fakeFetch(async () => new Response(JSON.stringify({ detail: 'Invalid token.' }), { status: 401 })), khalti: { secretKey: KHALTI_SECRET } });
  const e = await rejects(bad.khalti.verify({ ref: 'x', expectedAmount: rupees(10), expectedOrderId: 'o' }), 'AUTH_ERROR');
  assert.match(e.message, /Invalid token/);
});

test('network errors and timeouts are safe PaymentErrors', async () => {
  const down = createPayments({ mode: 'sandbox', fetch: async () => { throw new TypeError(`fetch failed ${KHALTI_SECRET}`); }, khalti: { secretKey: KHALTI_SECRET } });
  await rejects(down.khalti.verify({ ref: 'x', expectedAmount: rupees(10), expectedOrderId: 'o' }), 'NETWORK_ERROR');
  const slow = createPayments({
    mode: 'sandbox',
    timeoutMs: 50,
    fetch: (_u, init) => new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason))),
    khalti: { secretKey: KHALTI_SECRET }
  });
  await rejects(slow.khalti.verify({ ref: 'x', expectedAmount: rupees(10), expectedOrderId: 'o' }), 'TIMEOUT');
  const html = createPayments({ mode: 'sandbox', fetch: async () => new Response(`<html>${KHALTI_SECRET}</html>`, { status: 502 }), khalti: { secretKey: KHALTI_SECRET } });
  await rejects(html.khalti.verify({ ref: 'x', expectedAmount: rupees(10), expectedOrderId: 'o' }), 'GATEWAY_ERROR');
});

// ---------- eSewa ----------
test('esewa: signature matches the doc example message', () => {
  const sig = np.esewaSignature({ total_amount: '100', transaction_uuid: '11-201-13', product_code: 'EPAYTEST' }, 'total_amount,transaction_uuid,product_code', ESEWA_SECRET);
  assert.equal(sig, crypto.createHmac('sha256', ESEWA_SECRET).update('total_amount=100,transaction_uuid=11-201-13,product_code=EPAYTEST').digest('base64'));
  assert.equal(np.esewaSignature({ total_amount: '110', transaction_uuid: '241028', product_code: 'EPAYTEST' }, 'total_amount,transaction_uuid,product_code', ESEWA_SECRET), 'i94zsd3oXF6ZsSr/kGqT4sSzYQzjj1W/waxjWyRwaME=');
});

test('esewa: initiate form fields', async () => {
  const p = all(fakeFetch());
  const s = await p.esewa.initiate({ amount: rupees(100), orderId: 'o-1', successUrl: 'https://shop.example/s', failureUrl: 'https://shop.example/f' });
  assert.equal(s.kind, 'form');
  assert.equal(s.action, 'https://rc-epay.esewa.com.np/api/epay/main/v2/form');
  assert.equal(s.ref, 'o-1');
  assert.equal(s.fields.total_amount, '100');
  assert.equal(s.fields.amount, '100');
  assert.equal(s.fields.product_code, 'EPAYTEST');
  assert.equal(s.fields.signed_field_names, 'total_amount,transaction_uuid,product_code');
  assert.equal(s.fields.signature, np.esewaSignature(s.fields, s.fields.signed_field_names, ESEWA_SECRET));
  noSecret(s, 'esewa start');
  await rejects(p.esewa.initiate({ amount: rupees(1), orderId: 'bad id!', successUrl: 'https://a.example', failureUrl: 'https://a.example' }), 'INVALID_INPUT');
});

test('esewa: callback accepts a good signature, rejects a bad one', async () => {
  const p = all(fakeFetch());
  const good = esewaCallback({ orderId: 'o-1', amount: rupees(100), secretKey: ESEWA_SECRET });
  const cb = await p.esewa.parseCallback({ data: good });
  assert.equal(cb.signed, true);
  assert.equal(cb.status, 'paid');
  assert.equal(cb.amount, 10000);
  assert.equal(cb.ref, 'o-1');
  const forged = esewaCallback({ orderId: 'o-1', amount: rupees(100), secretKey: 'wrong-key' });
  await rejects(p.esewa.parseCallback({ data: forged }), 'INVALID_SIGNATURE');
  const json = JSON.parse(Buffer.from(good, 'base64').toString());
  json.total_amount = '1';
  await rejects(p.esewa.parseCallback({ data: Buffer.from(JSON.stringify(json)).toString('base64') }), 'INVALID_SIGNATURE');
  const other = esewaCallback({ orderId: 'o-1', amount: rupees(100), secretKey: ESEWA_SECRET, productCode: 'OTHER' });
  await rejects(p.esewa.parseCallback({ data: other }), 'INVALID_SIGNATURE');
  await rejects(p.esewa.parseCallback('https://shop.example/s?data=%%%'), 'INVALID_INPUT');
});

test('esewa: verify statuses and mismatches', async () => {
  const fake = fakeEsewa();
  const p = all(fakeFetch(fake.handler));
  const v = await p.esewa.verify({ ref: 'o-1', expectedAmount: rupees(100), expectedOrderId: 'o-1' });
  assert.equal(v.status, 'paid');
  assert.deepEqual(v.checked, { amount: true, orderId: true, callback: false });
  assert.equal(fake.calls[0].body.total_amount, '100');
  fake.set('o-1', { amount: rupees(50) });
  await rejects(p.esewa.verify({ ref: 'o-1', expectedAmount: rupees(100), expectedOrderId: 'o-1' }), 'AMOUNT_MISMATCH');
  await rejects(p.esewa.verify({ ref: 'o-1', expectedAmount: rupees(50), expectedOrderId: 'o-2' }), 'ORDER_MISMATCH');
  fake.set('o-1', { amount: rupees(100) });
  for (const [raw, want] of [['PENDING', 'pending'], ['FULL_REFUND', 'refunded'], ['PARTIAL_REFUND', 'refunded'], ['AMBIGUOUS', 'ambiguous'], ['NOT_FOUND', 'failed'], ['CANCELED', 'canceled'], ['NEW_THING', 'ambiguous']]) {
    fake.set('o-1', { status: raw });
    const r = await p.esewa.verify({ ref: 'o-1', expectedAmount: rupees(100), expectedOrderId: 'o-1' });
    assert.equal(r.status, want, raw);
  }
  assert.equal(np.esewaStatus('COMPLETE'), 'paid');
});

test('esewa: verify compares a signed callback amount, since the status API echoes the amount sent', async () => {
  const fake = fakeEsewa();
  const p = all(fakeFetch(fake.handler));
  const good = await p.esewa.parseCallback({ data: esewaCallback({ orderId: 'o-1', amount: rupees(100), secretKey: ESEWA_SECRET }) });
  const v = await p.esewa.verify({ ref: 'o-1', expectedAmount: rupees(100), expectedOrderId: 'o-1', callback: good });
  assert.deepEqual(v.checked, { amount: true, orderId: true, callback: true });
  // The buyer paid Rs 50; the status API, asked with Rs 100, answers Rs 100. The signed callback still says Rs 50.
  const cheap = await p.esewa.parseCallback({ data: esewaCallback({ orderId: 'o-1', amount: rupees(50), secretKey: ESEWA_SECRET }) });
  await rejects(p.esewa.verify({ ref: 'o-1', expectedAmount: rupees(100), expectedOrderId: 'o-1', callback: cheap }), 'AMOUNT_MISMATCH');
  const other = await p.esewa.parseCallback({ data: esewaCallback({ orderId: 'o-9', amount: rupees(100), secretKey: ESEWA_SECRET }) });
  await rejects(p.esewa.verify({ ref: 'o-1', expectedAmount: rupees(100), expectedOrderId: 'o-1', callback: other }), 'INVALID_INPUT');
  await rejects(p.esewa.verify({ ref: 'o-1', expectedAmount: rupees(100), expectedOrderId: 'o-1', callback: { ...good, gateway: 'khalti' } }), 'INVALID_INPUT');
  // An unsigned callback is only a hint: its amount is not compared.
  const unsigned = { ...cheap, signed: false };
  const u = await p.esewa.verify({ ref: 'o-1', expectedAmount: rupees(100), expectedOrderId: 'o-1', callback: unsigned });
  assert.equal(u.checked.callback, false);
  // signed: true set by hand on a copy is not trusted: only parseCallback's own result counts.
  await rejects(p.esewa.verify({ ref: 'o-1', expectedAmount: rupees(100), expectedOrderId: 'o-1', callback: { ...unsigned, signed: true } }), 'INVALID_INPUT');
  // A stored copy of a real signed result is not trusted either: run parseCallback again.
  await rejects(p.esewa.verify({ ref: 'o-1', expectedAmount: rupees(100), expectedOrderId: 'o-1', callback: JSON.parse(JSON.stringify(good)) }), 'INVALID_INPUT');
  await rejects(p.esewa.verify({ ref: 'o-1', expectedAmount: rupees(100), expectedOrderId: 'o-1', callback: structuredClone(good) }), 'INVALID_INPUT');
  // The ESM build's parseCallback result is trusted by the CommonJS build's verify.
  const esm = await import('../dist/index.mjs');
  const pe = esm.createPayments({ mode: 'sandbox', fetch: fakeFetch(fake.handler), esewa: { productCode: 'EPAYTEST', secretKey: ESEWA_SECRET } });
  const cbEsm = await pe.esewa.parseCallback({ data: esewaCallback({ orderId: 'o-1', amount: rupees(100), secretKey: ESEWA_SECRET }) });
  assert.equal((await p.esewa.verify({ ref: 'o-1', expectedAmount: rupees(100), expectedOrderId: 'o-1', callback: cbEsm })).checked.callback, true);
});

// ---------- ConnectIPS ----------
test('connectips: form token is RSA-SHA256 over the documented message (AES and 3DES pfx)', async () => {
  const pub = crypto.createPublicKey(fixture('test-cert.pem'));
  for (const f of ['test-aes.pfx', 'test-3des.pfx']) {
    const p = createPayments({ mode: 'sandbox', connectips: { ...CIPS, pfx: fixture(f) } });
    const s = await p.connectips.initiate({ amount: paisa(500), orderId: 'o-1', date: new Date('2026-01-01T20:00:00Z') });
    assert.equal(s.kind, 'form');
    assert.equal(s.action, 'https://uat.connectips.com/connectipswebgw/loginpage');
    assert.equal(s.fields.TXNDATE, '02-01-2026', 'Nepal time is UTC+5:45');
    const msg = 'MERCHANTID=123,APPID=MER-123-APP-1,APPNAME=Shop,TXNID=o-1,TXNDATE=02-01-2026,TXNCRNCY=NPR,TXNAMT=500,REFERENCEID=o-1,REMARKS=o-1,PARTICULARS=o-1,TOKEN=TOKEN';
    assert.equal(np.connectIpsFormMessage(s.fields), msg);
    assert.ok(crypto.verify('sha256', Buffer.from(msg), pub, Buffer.from(s.fields.TOKEN, 'base64')), f);
  }
  const pem = createPayments({ mode: 'sandbox', connectips: { ...CIPS, privateKeyPem: fixture('test-key.pem').toString() } });
  assert.equal((await pem.connectips.initiate({ amount: paisa(500), orderId: 'o-1' })).kind, 'form');
});

test('connectips: config errors for the key', () => {
  assert.throws(() => createPayments({ mode: 'sandbox', connectips: CIPS }), e => e.code === 'INVALID_CONFIG' && /pfx/.test(e.message));
  assert.throws(() => createPayments({ mode: 'sandbox', connectips: { ...CIPS, pfx: fixture('test-aes.pfx'), pfxPassword: 'not-the-password' } }), e => e.code === 'INVALID_CONFIG');
  assert.throws(() => createPayments({ mode: 'sandbox', connectips: { ...CIPS, pfx: Buffer.from('garbage') } }), e => e.code === 'INVALID_CONFIG');
});

test('connectips: validatetxn call, statuses and mismatches', async () => {
  const fake = fakeConnectIps();
  const p = all(fakeFetch(fake.handler));
  const v = await p.connectips.verify({ ref: 'o-1', expectedAmount: paisa(500), expectedOrderId: 'o-1' });
  assert.equal(v.status, 'paid');
  const call = fake.calls[0];
  assert.equal(call.headers.authorization, 'Basic ' + Buffer.from(`${CIPS.appId}:${CIPS.password}`).toString('base64'));
  assert.deepEqual({ m: call.body.merchantId, r: call.body.referenceId, a: call.body.txnAmt }, { m: 123, r: 'o-1', a: 500 });
  const pub = crypto.createPublicKey(fixture('test-cert.pem'));
  assert.ok(crypto.verify('sha256', Buffer.from('MERCHANTID=123,APPID=MER-123-APP-1,REFERENCEID=o-1,TXNAMT=500'), pub, Buffer.from(call.body.token, 'base64')));
  await rejects(p.connectips.verify({ ref: 'o-1', expectedAmount: paisa(500), expectedOrderId: 'o-2' }), 'ORDER_MISMATCH');
  fake.set('o-1', { amount: 400 });
  await rejects(p.connectips.verify({ ref: 'o-1', expectedAmount: paisa(500), expectedOrderId: 'o-1' }), 'AMOUNT_MISMATCH');
  assert.equal(np.connectIpsStatus('FAILED'), 'failed');
  assert.equal(np.connectIpsStatus('ERROR', 'Transaction not found'), 'failed');
  assert.equal(np.connectIpsStatus('ERROR', 'Timeout'), 'ambiguous');
  assert.equal(np.connectIpsStatus('WHAT'), 'ambiguous');
  const cb = await p.connectips.parseCallback('https://shop.example/ok?TXNID=o-1');
  assert.deepEqual({ ref: cb.ref, status: cb.status, signed: cb.signed }, { ref: 'o-1', status: 'pending', signed: false });
});

test('connectips: many verifies do not grow the shared redactor; each call hides its own token', async () => {
  const fake = fakeConnectIps();
  const tokens = [];
  let echo = false;
  const fetch = fakeFetch(async req => {
    tokens.push(JSON.parse(await req.text()).token);
    if (!echo) return undefined;
    return new Response(JSON.stringify({ message: tokens.join(' ') }), { status: 500, headers: { 'content-type': 'application/json' } });
  }, fake.handler);
  const p = createPayments({ mode: 'sandbox', fetch, connectips: { ...CIPS, pfx: fixture('test-aes.pfx') } });
  const runs = 50;
  for (let n = 0; n < runs; n++) await p.connectips.verify({ ref: `o-${n}`, expectedAmount: paisa(500 + n), expectedOrderId: `o-${n}` });
  echo = true;
  const e = await rejects(p.connectips.verify({ ref: 'o-last', expectedAmount: paisa(500), expectedOrderId: 'o-last' }), 'GATEWAY_ERROR');
  const seen = [e.message, JSON.stringify(e.response), util.inspect(e, { depth: 20 })].join('\n');
  assert.equal(new Set(tokens).size, runs + 1);
  assert.ok(!seen.includes(tokens[runs]), 'this call\'s token leaked');
  assert.ok(!seen.includes(Buffer.from(`${CIPS.appId}:${CIPS.password}`).toString('base64')), 'basic auth leaked');
  // The earlier calls' tokens were never added to the shared redactor, so it did not grow with them.
  assert.equal(tokens.slice(0, runs).filter(t => seen.includes(t)).length, runs);
});

// ---------- Hamro Pay ----------
test('hamropay: signature is base64 HMAC-SHA512 of the comma join (openssl vector)', () => {
  assert.equal(np.hamroPaySignature(['T1', '1000', 'M', 'C', 'K'], 'abcdefg'), '7MhTBtP9MzyiNUg7P/ljNqxHxrUPQSAHhNpAD9bPlacsF2lMj8GAka1pVKD7MSMnNdBLqCwz9SoY4l+2RHdpxA==');
  assert.equal(np.hamroPaySignature(['T1', '1000', 'M', 'C', 'K'], 'abcdefg'), crypto.createHmac('sha512', 'abcdefg').update('T1,1000,M,C,K').digest('base64'));
});

test('hamropay: session, form token and transaction status', async () => {
  const fake = fakeHamroPay({ clientSecret: HAMRO.clientSecret });
  const p = all(fakeFetch(fake.handler));
  const s = await p.hamropay.initiate({ amount: rupees(10), orderId: 'o-1', successUrl: 'https://shop.example/s', failureUrl: 'https://shop.example/f' });
  assert.equal(s.kind, 'form');
  assert.equal(s.action, 'https://uat-checkout-pay.hamropatro.com/api/checkout');
  assert.equal(s.fields.token, np.hamroPaySignature([HAMRO.merchantId, 'o-1', s.fields.session_id, '1000', HAMRO.clientId, HAMRO.clientApiKey], HAMRO.clientSecret));
  assert.equal(fake.calls[0].body.transactionAmount, '1000');
  assert.equal(fake.calls[0].body.productList[0].price, 10);
  const v = await p.hamropay.verify({ ref: 'o-1', expectedAmount: rupees(10), expectedOrderId: 'o-1' });
  assert.equal(v.status, 'paid');
  assert.equal(v.amount, 1000);
  await rejects(p.hamropay.verify({ ref: 'o-1', expectedAmount: rupees(11), expectedOrderId: 'o-1' }), 'AMOUNT_MISMATCH');
  await rejects(p.hamropay.verify({ ref: 'o-1', expectedAmount: rupees(10), expectedOrderId: 'o-9' }), 'ORDER_MISMATCH');
  for (const [raw, want] of [['PENDING', 'pending'], ['PROCESSING', 'pending'], ['FAILED', 'failed'], ['NOT_INITIATED', 'pending'], ['ODD', 'ambiguous']]) {
    fake.set('o-1', { status: raw });
    assert.equal((await p.hamropay.verify({ ref: 'o-1', expectedAmount: rupees(10), expectedOrderId: 'o-1' })).status, want, raw);
  }
  const wrongKey = createPayments({ mode: 'sandbox', fetch: fakeFetch(fake.handler), hamropay: { ...HAMRO, clientSecret: 'other-secret' } });
  await rejects(wrongKey.hamropay.verify({ ref: 'o-1', expectedAmount: rupees(10), expectedOrderId: 'o-1' }), 'AUTH_ERROR');
  await rejects(p.hamropay.initiate({ amount: rupees(10), orderId: 'a,b', successUrl: 'https://a.example', failureUrl: 'https://a.example' }), 'INVALID_INPUT');
  await rejects(p.hamropay.initiate({ amount: paisa(999), orderId: 'o-2', successUrl: 'https://a.example', failureUrl: 'https://a.example' }), 'INVALID_INPUT');
});

test('hamropay: webhook accept and reject', async () => {
  const p = all(fakeFetch());
  for (const amountText of [undefined, '10', '10.0', '10.00']) {
    const hook = hamroPayWebhook({ orderId: 'o-1', merchantId: HAMRO.merchantId, amount: rupees(10), webhookSecret: HAMRO.webhookSecret, amountText });
    const cb = await p.hamropay.parseCallback(hook);
    assert.equal(cb.signed, true);
    assert.equal(cb.status, 'paid');
    assert.equal(cb.amount, 1000);
  }
  const forged = hamroPayWebhook({ orderId: 'o-1', merchantId: HAMRO.merchantId, amount: rupees(10), webhookSecret: 'nope' });
  await rejects(p.hamropay.parseCallback(forged), 'INVALID_SIGNATURE');
  const good = hamroPayWebhook({ orderId: 'o-1', merchantId: HAMRO.merchantId, amount: rupees(10), webhookSecret: HAMRO.webhookSecret });
  await rejects(p.hamropay.parseCallback({ body: good.body.replace('"amount":10', '"amount":99'), signature: good.signature }), 'INVALID_SIGNATURE');
  const other = hamroPayWebhook({ orderId: 'o-1', merchantId: 'M-2', amount: rupees(10), webhookSecret: HAMRO.webhookSecret });
  await rejects(p.hamropay.parseCallback(other), 'INVALID_SIGNATURE');
  const numeric = createPayments({ mode: 'sandbox', fetch: fakeFetch(), hamropay: { ...HAMRO, merchantId: '12345' } });
  const asText = hamroPayWebhook({ orderId: 'o-1', merchantId: '12345', amount: rupees(10), webhookSecret: HAMRO.webhookSecret });
  const asNumber = { body: asText.body.replace('"merchantId":"12345"', '"merchantId":12345'), signature: asText.signature };
  assert.equal((await numeric.hamropay.parseCallback(asNumber)).status, 'paid');
  // A signed webhook that says paid but has an amount this library cannot read fails verify.
  const fakeHp = fakeHamroPay();
  const hp = createPayments({ mode: 'sandbox', fetch: fakeFetch(fakeHp.handler), hamropay: HAMRO });
  const odd = await hp.hamropay.parseCallback(hamroPayWebhook({ orderId: 'o-1', merchantId: HAMRO.merchantId, amount: rupees(10), webhookSecret: HAMRO.webhookSecret, amountText: '10.005' }));
  assert.deepEqual({ signed: odd.signed, status: odd.status, amount: odd.amount }, { signed: true, status: 'paid', amount: null });
  const oddErr = await rejects(hp.hamropay.verify({ ref: 'o-1', expectedAmount: rupees(10), expectedOrderId: 'o-1', callback: odd }), 'INVALID_RESPONSE');
  assert.match(oddErr.message, /signed hamropay callback says paid with no amount/);
  const noHook = createPayments({ mode: 'sandbox', hamropay: { ...HAMRO, webhookSecret: undefined } });
  await rejects(noHook.hamropay.parseCallback(good), 'INVALID_CONFIG');
  const redirect = await p.hamropay.parseCallback('https://shop.example/s?MerchantTxnId=o-1');
  assert.deepEqual({ ref: redirect.ref, status: redirect.status, signed: redirect.signed }, { ref: 'o-1', status: 'pending', signed: false });
});

// ---------- mock mode ----------
test('mock mode: no keys, no network, outcome follows mockOutcome', async () => {
  const p = createPayments({ mode: 'mock', fetch: () => assert.fail('mock must not fetch'), khalti: {}, esewa: {}, connectips: {}, hamropay: {} });
  for (const g of ['khalti', 'esewa', 'connectips', 'hamropay']) {
    const input = { amount: rupees(10), orderId: 'o-1', orderName: 'n', returnUrl: 'https://a.example', websiteUrl: 'https://a.example', successUrl: 'https://a.example', failureUrl: 'https://a.example' };
    const paid = await p[g].initiate(input);
    assert.ok(paid.ref.startsWith('mock.paid.'), g);
    const v = await p[g].verify({ ref: paid.ref, expectedAmount: rupees(10), expectedOrderId: 'o-1' });
    assert.equal(v.status, 'paid', g);
    await rejects(p[g].verify({ ref: paid.ref, expectedAmount: rupees(11), expectedOrderId: 'o-1' }), 'AMOUNT_MISMATCH');
    const failed = await p[g].initiate({ ...input, mockOutcome: 'failed' });
    assert.equal((await p[g].verify({ ref: failed.ref, expectedAmount: rupees(10), expectedOrderId: 'o-1' })).status, 'failed', g);
    const cb = await p[g].parseCallback({ anything: paid.ref });
    assert.equal(cb.ref, paid.ref);
    const st = await p[g].status({ ref: paid.ref, orderId: 'o-1', amount: rupees(10) });
    assert.equal(st.status, 'paid', g);
    assert.equal('paid' in st, false, `${g} status() must not say paid`);
  }
  assert.equal((await p.khalti.refund({ transactionId: 'x' })).ok, true);
  await rejects(p.esewa.refund({}), 'NOT_SUPPORTED');
});

test('mock mode: a typed or changed ref fails; refused when NODE_ENV is production', async () => {
  const p = createPayments({ mode: 'mock', khalti: {} });
  const input = { amount: rupees(10), orderId: 'o-1', orderName: 'n', returnUrl: 'https://a.example', websiteUrl: 'https://a.example' };
  const { ref } = await p.khalti.initiate(input);
  const order = Buffer.from('o-1').toString('base64url');
  const typed = `mock.paid.1000.${order}.abc`;
  await rejects(p.khalti.verify({ ref: typed, expectedAmount: rupees(10), expectedOrderId: 'o-1' }), 'INVALID_INPUT');
  await rejects(p.khalti.verify({ ref: typed + '.forged', expectedAmount: rupees(10), expectedOrderId: 'o-1' }), 'INVALID_INPUT');
  const parts = ref.split('.');
  const cheaper = [parts[0], parts[1], '100', ...parts.slice(3)].join('.');
  await rejects(p.khalti.verify({ ref: cheaper, expectedAmount: rupees(1), expectedOrderId: 'o-1' }), 'INVALID_INPUT');
  const failed = (await p.khalti.initiate({ ...input, mockOutcome: 'failed' })).ref.split('.');
  const flipped = [failed[0], 'paid', ...failed.slice(2)].join('.');
  await rejects(p.khalti.verify({ ref: flipped, expectedAmount: rupees(10), expectedOrderId: 'o-1' }), 'INVALID_INPUT');
  assert.equal((await p.khalti.verify({ ref, expectedAmount: rupees(10), expectedOrderId: 'o-1' })).paid, true);

  const before = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.throws(() => createPayments({ mode: 'mock', khalti: {} }), e => e.code === 'INVALID_CONFIG' && e.field === 'khalti.mode');
    assert.throws(() => createPayments({ mode: 'sandbox', khalti: { secretKey: 'k', mode: 'mock' } }), e => e.code === 'INVALID_CONFIG');
    assert.ok(createPayments({ mode: 'sandbox', khalti: { secretKey: 'k' } }).khalti);
  } finally {
    if (before === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = before;
  }
});

test('mock mode: a ref made by the ESM build verifies in the CommonJS build', async () => {
  const esm = await import('../dist/index.mjs');
  const input = { amount: esm.rupees(10), orderId: 'o-1', orderName: 'n', returnUrl: 'https://a.example', websiteUrl: 'https://a.example' };
  const { ref } = await esm.createPayments({ mode: 'mock', khalti: {} }).khalti.initiate(input);
  const v = await createPayments({ mode: 'mock', khalti: {} }).khalti.verify({ ref, expectedAmount: rupees(10), expectedOrderId: 'o-1' });
  assert.equal(v.paid, true);
});

test('subpath entries share one PaymentError class', () => {
  const k = require('../dist/khalti');
  const e = require('../dist/esewa');
  assert.equal(k.PaymentError, e.PaymentError);
  assert.equal(k.PaymentError, np.PaymentError);
});
