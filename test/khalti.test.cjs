const test = require('node:test');
const assert = require('node:assert/strict');
const util = require('node:util');
const { startFake } = require('./fakeServer.cjs');
const { NepPayments, PaymentError } = require('../dist');

const SECRET = 'test_secret_key_not_real_123';

function gateway(base) {
  const payments = new NepPayments({ khalti: { secretKey: SECRET, environment: 'sandbox' } });
  // Point the gateway at the local fake. baseUrl is private, so tests set it directly.
  payments.khalti.baseUrl = base;
  return payments.khalti;
}

const order = {
  amount: 1000,
  purchase_order_id: 'ORDER_1',
  purchase_order_name: 'Test',
  return_url: 'https://example.com/return',
  website_url: 'https://example.com'
};

function assertNoSecret(err) {
  assert.ok(err instanceof PaymentError, 'is a PaymentError');
  for (const text of [JSON.stringify(err), String(err), util.inspect(err, { depth: 10 }), err.stack]) {
    assert.ok(!text.includes(SECRET), `secret leaked in: ${text.slice(0, 200)}`);
  }
  assert.equal(err.config, undefined);
  assert.equal(err.request, undefined);
}

async function caught(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  assert.fail('expected a throw');
}

test('createPayment returns the 2.x shape and sends the Key header', async () => {
  const fake = await startFake({
    'POST /epayment/initiate/': () => ({
      status: 200,
      body: { pidx: 'P1', payment_url: 'https://test-pay.khalti.com/?pidx=P1', expires_at: 'x', expires_in: 1800 }
    })
  });
  try {
    const res = await gateway(fake.base).createPayment(order);
    assert.deepEqual(res, { pidx: 'P1', payment_url: 'https://test-pay.khalti.com/?pidx=P1', expires_at: 'x', expires_in: 1800 });
    assert.equal(fake.calls[0].headers.authorization, `Key ${SECRET}`);
  } finally {
    await fake.close();
  }
});

test('a 401 from initiate throws a PaymentError with response.data and no secret', async () => {
  const body = { detail: 'Invalid token.', status_code: 401 };
  const fake = await startFake({ 'POST /epayment/initiate/': () => ({ status: 401, body }) });
  try {
    const err = await caught(gateway(fake.base).createPayment(order));
    assertNoSecret(err);
    assert.equal(err.code, 'AUTHENTICATION_ERROR');
    assert.equal(err.message, 'Invalid token.');
    assert.deepEqual(err.response, { status: 401, data: body });
  } finally {
    await fake.close();
  }
});

test('a validation_error body is read from response.data', async () => {
  const body = { return_url: ['Enter a valid URL.'], error_key: 'validation_error' };
  const fake = await startFake({ 'POST /epayment/initiate/': () => ({ status: 400, body }) });
  try {
    const err = await caught(gateway(fake.base).createPayment(order));
    assertNoSecret(err);
    assert.equal(err.code, 'VALIDATION_ERROR');
    assert.match(err.message, /return_url: Enter a valid URL\./);
    assert.deepEqual(err.response.data, body);
  } finally {
    await fake.close();
  }
});

test('a network failure throws NETWORK_ERROR with no secret', async () => {
  const fake = await startFake({});
  const base = fake.base;
  await fake.close();
  const err = await caught(gateway(base).verifyPayment({ pidx: 'P1' }));
  assertNoSecret(err);
  assert.equal(err.code, 'NETWORK_ERROR');
});

const lookups = [
  ['Completed', 200, 'COMPLETED'],
  ['Pending', 200, 'PENDING'],
  ['Initiated', 200, 'PENDING'],
  ['Refunded', 200, 'FAILED'],
  ['Partially Refunded', 200, 'FAILED'],
  ['Expired', 400, 'EXPIRED'],
  ['User canceled', 400, 'CANCELED']
];

for (const [raw, http, expected] of lookups) {
  test(`lookup "${raw}" (HTTP ${http}) maps to ${expected}`, async () => {
    const body = { pidx: 'P1', total_amount: 1000, status: raw, transaction_id: raw === 'Completed' ? 'T1' : null, fee: 0, refunded: false };
    const fake = await startFake({ 'POST /epayment/lookup/': () => ({ status: http, body }) });
    try {
      const res = await gateway(fake.base).verifyPayment({ pidx: 'P1' });
      assert.equal(res.status, expected);
      assert.equal(res.raw_status, raw);
      assert.equal(res.amount, 1000);
      assert.equal(res.transaction_id, body.transaction_id);
      assert.deepEqual(res.payment_details, body);
    } finally {
      await fake.close();
    }
  });
}

test('lookup of an unknown pidx throws, not returns', async () => {
  const body = { detail: 'Not found.', error_key: 'validation_error' };
  const fake = await startFake({ 'POST /epayment/lookup/': () => ({ status: 404, body }) });
  try {
    const err = await caught(gateway(fake.base).verifyPayment({ pidx: 'nope' }));
    assertNoSecret(err);
    assert.equal(err.code, 'VALIDATION_ERROR');
    assert.equal(err.response.status, 404);
  } finally {
    await fake.close();
  }
});

test('expectedAmount: equal passes, different throws AMOUNT_MISMATCH', async () => {
  const body = { pidx: 'P1', total_amount: 1000, status: 'Completed', transaction_id: 'T1' };
  const fake = await startFake({ 'POST /epayment/lookup/': () => ({ status: 200, body }) });
  try {
    const gw = gateway(fake.base);
    const ok = await gw.verifyPayment({ pidx: 'P1', expectedAmount: 1000 });
    assert.equal(ok.status, 'COMPLETED');
    const err = await caught(gw.verifyPayment({ pidx: 'P1', expectedAmount: 5000 }));
    assertNoSecret(err);
    assert.equal(err.code, 'AMOUNT_MISMATCH');
    assert.deepEqual(err.response, { status: 200, data: body });
    assert.ok(!('expectedAmount' in JSON.parse(fake.calls[0].body)), 'expectedAmount is not sent to Khalti');
  } finally {
    await fake.close();
  }
});

test('environment must be sandbox or production', () => {
  assert.throws(() => new NepPayments({ khalti: { secretKey: SECRET, environment: 'live' } }), err => {
    assert.equal(err.code, 'INVALID_CONFIG');
    assert.ok(!String(err).includes(SECRET));
    return true;
  });
  assert.doesNotThrow(() => new NepPayments({ khalti: { secretKey: SECRET, environment: 'production' } }));
  assert.doesNotThrow(() => new NepPayments({ khalti: { secretKey: SECRET } }));
});
