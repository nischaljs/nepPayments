const test = require('node:test');
const assert = require('node:assert/strict');
const util = require('node:util');
const { startFake } = require('./fakeServer.cjs');
const { NepPayments, PaymentError } = require('../dist');

// eSewa's published UAT credentials.
const PRODUCT = 'EPAYTEST';
const SECRET = '8gBm/:&EnhH.1/q';

function gateway(base) {
  const payments = new NepPayments({
    esewa: { productCode: PRODUCT, secretKey: SECRET, environment: 'sandbox', successUrl: 'https://example.com/ok', failureUrl: 'https://example.com/fail' }
  });
  payments.esewa.baseUrl = base;
  payments.esewa.statusCheckUrl = `${base}/status/`;
  return payments.esewa;
}

const order = {
  amount: 100,
  tax_amount: 0,
  total_amount: 100,
  transaction_uuid: '11-201-13',
  product_code: PRODUCT,
  product_service_charge: 0,
  product_delivery_charge: 0,
  success_url: 'https://example.com/ok',
  failure_url: 'https://example.com/fail',
  signed_field_names: 'total_amount,transaction_uuid,product_code'
};

async function caught(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  assert.fail('expected a throw');
}

function assertNoSecret(err) {
  assert.ok(err instanceof PaymentError);
  for (const text of [JSON.stringify(err), String(err), util.inspect(err, { depth: 10 }), err.stack]) {
    assert.ok(!text.includes(SECRET), 'secret leaked');
  }
  assert.equal(err.config, undefined);
  assert.equal(err.request, undefined);
}

function silenceConsole(t) {
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args);
  t.after(() => (console.error = original));
  return logged;
}

test('createPayment signs total_amount,transaction_uuid,product_code with HMAC-SHA256 base64', async () => {
  const fake = await startFake({ 'POST /form': () => ({ status: 200, body: '<form></form>' }) });
  try {
    const res = await gateway(fake.base).createPayment(order);
    // HMAC-SHA256 of "total_amount=100,transaction_uuid=11-201-13,product_code=EPAYTEST" with the UAT key.
    // eSewa's page shows 4Ov7pCI1zIOdwtV2BRMUNjz1upIlT/COTxfLhWvVurE= for this input; that value does not
    // match the HMAC of the documented message, so the test pins the computed value.
    assert.equal(res.signature, '5DZywcrTKD0gia/rsSMcrRHmJl+4Tbol6S+lWgdJ94E=');
    assert.equal(res.form_html, '<form></form>');
    assert.equal(new URLSearchParams(fake.calls[0].body).get('signature'), res.signature);
  } finally {
    await fake.close();
  }
});

test('a failed createPayment throws a safe PaymentError and logs nothing', async t => {
  const logged = silenceConsole(t);
  const body = { code: 0, error_message: 'Service is currently unavailable' };
  const fake = await startFake({ 'POST /form': () => ({ status: 503, body }) });
  try {
    const err = await caught(gateway(fake.base).createPayment(order));
    assertNoSecret(err);
    assert.equal(err.code, 'PAYMENT_FAILED');
    assert.equal(err.message, 'Service is currently unavailable');
    assert.deepEqual(err.response, { status: 503, data: body });
    assert.equal(logged.length, 0);
  } finally {
    await fake.close();
  }
});

const statuses = [
  ['COMPLETE', 'COMPLETED'],
  ['PENDING', 'PENDING'],
  ['FULL_REFUND', 'CANCELED'],
  ['PARTIAL_REFUND', 'CANCELED'],
  ['CANCELED', 'CANCELED'],
  ['AMBIGUOUS', 'PENDING'],
  ['NOT_FOUND', 'FAILED']
];

for (const [raw, expected] of statuses) {
  test(`status "${raw}" maps to ${expected}`, async () => {
    const body = { product_code: PRODUCT, transaction_uuid: '11-201-13', total_amount: 100, status: raw, ref_id: 'R1' };
    const fake = await startFake({ 'GET /status/': () => ({ status: 200, body }) });
    try {
      const res = await gateway(fake.base).verifyPayment({ product_code: PRODUCT, transaction_uuid: '11-201-13', total_amount: 100 });
      assert.equal(res.status, expected);
      assert.equal(res.raw_status, raw);
      assert.equal(res.transaction_id, 'R1');
      assert.equal(res.amount, 100);
      assert.deepEqual(fake.calls[0].query, { product_code: PRODUCT, transaction_uuid: '11-201-13', total_amount: '100' });
    } finally {
      await fake.close();
    }
  });
}

test('expectedAmount: equal passes (commas allowed), different throws AMOUNT_MISMATCH', async () => {
  let amount = '1,000.0';
  const fake = await startFake({
    'GET /status/': () => ({ status: 200, body: { product_code: PRODUCT, transaction_uuid: 'u1', total_amount: amount, status: 'COMPLETE', ref_id: 'R1' } })
  });
  try {
    const gw = gateway(fake.base);
    const ok = await gw.verifyPayment({ product_code: PRODUCT, transaction_uuid: 'u1', total_amount: 1000, expectedAmount: 1000 });
    assert.equal(ok.status, 'COMPLETED');
    amount = 10;
    const err = await caught(gw.verifyPayment({ product_code: PRODUCT, transaction_uuid: 'u1', total_amount: 1000, expectedAmount: 1000 }));
    assertNoSecret(err);
    assert.equal(err.code, 'AMOUNT_MISMATCH');
    assert.equal(err.response.data.total_amount, 10);
  } finally {
    await fake.close();
  }
});

test('a failed status call throws a safe PaymentError', async () => {
  const body = { code: 0, error_message: 'Service is currently unavailable' };
  const fake = await startFake({ 'GET /status/': () => ({ status: 500, body }) });
  try {
    const err = await caught(gateway(fake.base).verifyPayment({ product_code: PRODUCT, transaction_uuid: 'u1', total_amount: 100 }));
    assertNoSecret(err);
    assert.equal(err.code, 'VERIFICATION_FAILED');
    assert.deepEqual(err.response, { status: 500, data: body });
  } finally {
    await fake.close();
  }
});

test('environment must be sandbox or production', () => {
  const base = { productCode: PRODUCT, secretKey: SECRET, successUrl: 'https://e.com/ok', failureUrl: 'https://e.com/f' };
  assert.throws(() => new NepPayments({ esewa: { ...base, environment: 'test' } }), { code: 'INVALID_CONFIG' });
  assert.doesNotThrow(() => new NepPayments({ esewa: { ...base, environment: 'sandbox' } }));
});

test('createPayment without signed_field_names throws INVALID_PAYMENT_OPTIONS and sends nothing', async () => {
  const fake = await startFake({ 'POST /form': () => ({ status: 200, body: '<form></form>' }) });
  try {
    const err = await caught(gateway(fake.base).createPayment({ transaction_uuid: 'u', total_amount: 10 }));
    assertNoSecret(err);
    assert.equal(err.code, 'INVALID_PAYMENT_OPTIONS');
    assert.equal(fake.calls.length, 0);
  } finally {
    await fake.close();
  }
});

test('the secret key never shows on the gateway object', () => {
  const payments = new NepPayments({
    esewa: { productCode: PRODUCT, secretKey: SECRET, environment: 'sandbox', successUrl: 'https://e.com/ok', failureUrl: 'https://e.com/f' }
  });
  for (const value of [payments.esewa, payments]) {
    for (const text of [util.inspect(value, { depth: 10, showHidden: true }), JSON.stringify(value), String(value)]) {
      assert.ok(!text.includes(SECRET), `secret shown in: ${text.slice(0, 200)}`);
    }
  }
});

for (const raw of ['PENDING', 'AMBIGUOUS', 'NOT_FOUND', 'CANCELED']) {
  test(`expectedAmount with status ${raw} and no amount returns the status`, async () => {
    const body = { product_code: PRODUCT, transaction_uuid: 'u1', status: raw, ref_id: null };
    const fake = await startFake({ 'GET /status/': () => ({ status: 200, body }) });
    try {
      const res = await gateway(fake.base).verifyPayment({ product_code: PRODUCT, transaction_uuid: 'u1', total_amount: 100, expectedAmount: 100 });
      assert.equal(res.raw_status, raw);
      assert.equal(res.transaction_id, '');
    } finally {
      await fake.close();
    }
  });
}

test('expectedAmount with COMPLETE and no amount throws INVALID_RESPONSE', async () => {
  const body = { product_code: PRODUCT, transaction_uuid: 'u1', status: 'COMPLETE', ref_id: 'R1' };
  const fake = await startFake({ 'GET /status/': () => ({ status: 200, body }) });
  try {
    const err = await caught(gateway(fake.base).verifyPayment({ product_code: PRODUCT, transaction_uuid: 'u1', total_amount: 100, expectedAmount: 100 }));
    assertNoSecret(err);
    assert.equal(err.code, 'INVALID_RESPONSE');
    assert.match(err.message, /no amount/);
  } finally {
    await fake.close();
  }
});
