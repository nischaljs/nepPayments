const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { createPayments, rupees } = require('../dist');
const { fakeFetch } = require('../dist/testing');

const order = { orderId: 'tea-a1', amount: rupees('10.25') };
const expected = ref => ({ ref, expectedOrderId: order.orderId, expectedAmount: order.amount });
const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });

test('all new gateways start and verify locally, with gateway-specific mock refs', async () => {
  const p = createPayments({ mode: 'mock', fonepay: {}, nepalpay: {}, bankcard: {}, fetch: fakeFetch() });
  for (const [name, client] of Object.entries(p)) {
    for (const outcome of ['paid', 'pending', 'failed']) {
      const start = await client.initiate({ ...order, mockOutcome: outcome });
      assert.equal(start.kind, name === 'bankcard' ? 'form' : 'qr');
      if (start.kind === 'qr') assert.equal(start.poll.ref, start.ref);
      const v = await client.verify(expected(start.ref));
      assert.equal(v.status, outcome);
      assert.equal(v.paid, outcome === 'paid');
      const other = name === 'bankcard' ? p.nepalpay : p.bankcard;
      await assert.rejects(other.verify(expected(start.ref)), { code: 'INVALID_INPUT' });
    }
  }
});

test('NEPALPAY signs the bill, looks up its trace and checks credits, bill and amount', async () => {
  const privateKeyPem = readFileSync(path.join(__dirname, 'fixtures/test-key.pem'), 'utf8');
  const config = { userId: 'test-user', password: 'test-password', merchantId: 'M123', acquirerId: '001',
    merchantName: 'My Shop', city: 'Kathmandu', postalCode: '44600', merchantCategoryCode: 5411, storeLabel: 'Main',
    generateUrl: 'https://qr.example/qr/generateQR', reportUrl: 'https://qr.example/nQR/v1/merchanttxnreport', privateKeyPem };
  const trace = 'TEST-TRACE';
  let rows = [];
  const fetch = fakeFetch(async req => {
    const body = await req.json();
    assert.equal(req.headers.get('authorization'), 'Basic ' + Buffer.from('test-user:test-password').toString('base64'));
    if (req.url === config.generateUrl) {
      assert.ok(crypto.verify('sha256', Buffer.from('001,M123,5411,524,10.25,tea-a1,test-user'), crypto.createPublicKey(privateKeyPem), Buffer.from(body.token, 'base64')));
      assert.equal(body.pointOfInitialization, 12);
      assert.equal(body.transactionAmount, '10.25');
      return json({ responseStatus: 'SUCCESS', responseCode: '000', data: { qrString: 'test-payload', validationTraceId: trace } });
    }
    assert.equal(req.url, config.reportUrl);
    assert.deepEqual(body, { acquirerId: '001', merchantId: 'M123', validationTraceId: trace });
    return json({ responseStatus: 'SUCCESS', responseCode: '200', responseBody: rows });
  });
  const { nepalpay } = createPayments({ mode: 'sandbox', nepalpay: config, fetch });
  const start = await nepalpay.initiate(order);
  assert.equal(start.payload, 'test-payload');
  assert.equal((await nepalpay.verify(expected(start.ref))).status, 'pending');
  const row = { acquirerId: '001', validationTraceId: trace, tranType: 'PMT', debitStatus: '000', creditStatus: 'DEFER',
    merchantBillNo: order.orderId, nQrTxnId: 'txn-1', amount: 10.25 };
  rows = [{ ...row, debitStatus: 'FAILED' }, row];
  assert.equal((await nepalpay.verify(expected(start.ref))).paid, true);
  await assert.rejects(nepalpay.verify({ ...expected(trace), expectedOrderId: 'other' }), { code: 'ORDER_MISMATCH' });
  await assert.rejects(nepalpay.verify({ ...expected(trace), expectedAmount: rupees(11) }), { code: 'AMOUNT_MISMATCH' });
  rows = [row, { ...row, nQrTxnId: 'txn-2' }];
  assert.equal((await nepalpay.verify(expected(trace))).paid, false);
  rows = [{ ...row, tranType: 'RFND' }];
  assert.equal((await nepalpay.verify(expected(trace))).status, 'refunded');
});

test('Fonepay pairs the server event and status report, including after restart', async () => {
  const socketUrl = 'wss://dev-ws.fonepay.com/merchantEndPoint/test';
  class TestSocket {
    constructor(url) {
      assert.equal(url, socketUrl);
      queueMicrotask(() => {
        this.onmessage({ data: JSON.stringify({ transactionStatus: JSON.stringify({ QRVerified: true }) }) });
        this.onmessage({ data: JSON.stringify({ transactionStatus: JSON.stringify({
          success: true, paymentSuccess: true, productNumber: order.orderId, amount: '10.25', traceId: 123
        }) }) });
      });
    }
    close() {}
  }
  const fonepay = { merchantCode: 'SHOP', username: 'test-user', password: 'test-password', secretKey: 'test-secret', webSocket: TestSocket };
  let traceId = 123;
  const fetch = fakeFetch(async req => {
    const body = await req.json();
    const start = req.url.endsWith('thirdPartyDynamicQrDownload');
    const fields = start ? ['10.25', order.orderId, 'SHOP', order.orderId, order.orderId] : [order.orderId, 'SHOP'];
    assert.equal(body.dataValidation, crypto.createHmac('sha512', fonepay.secretKey).update(fields.join(',')).digest('hex'));
    return start ? json({ status: 'CREATED', success: true, qrMessage: 'test-qr', thirdpartyQrWebSocketUrl: socketUrl })
      : json({ paymentStatus: 'success', merchantCode: 'SHOP', prn: order.orderId, fonepayTraceId: traceId });
  });
  const build = () => createPayments({ mode: 'sandbox', fonepay, fetch }).fonepay;
  const client = build();
  const start = await client.initiate(order);
  assert.equal((await client.verify(expected(start.ref))).status, 'ambiguous');
  const event = await client.watchPayment(start);
  const restarted = build();
  const callback = await restarted.parseCallback({ receipt: event.receipt });
  assert.equal((await restarted.verify({ ...expected(start.ref), callback })).paid, true);
  await assert.rejects(restarted.verify({ ...expected(start.ref), callback, expectedAmount: rupees(11) }), { code: 'AMOUNT_MISMATCH' });
  traceId++;
  await assert.rejects(restarted.verify({ ...expected(start.ref), callback }), { code: 'INVALID_RESPONSE' });
});

test('bank card authenticates the hosted sale notification before fulfilling the saved attempt', async () => {
  const config = { profileId: 'profile', accessKey: 'public-key', secretKey: 'test-card-secret' };
  const { bankcard } = createPayments({ mode: 'sandbox', bankcard: config, fetch: fakeFetch() });
  const start = await bankcard.initiate(order);
  const mac = fields => crypto.createHmac('sha256', config.secretKey)
    .update(fields.signed_field_names.split(',').map(k => k + '=' + fields[k]).join(',')).digest('base64');
  assert.equal(start.fields.signature, mac(start.fields));
  assert.equal(start.fields.amount, '10.25');
  assert.equal(start.fields.transaction_type, 'sale');
  const fields = { decision: 'ACCEPT', reason_code: '100', req_profile_id: config.profileId, req_reference_number: order.orderId,
    req_transaction_uuid: start.ref, req_currency: 'NPR', req_transaction_type: 'sale', req_amount: '10.25', auth_amount: '10.25',
    transaction_id: 'test-txn', signed_field_names: '' };
  fields.signed_field_names = Object.keys(fields).join(',');
  const notification = () => new URLSearchParams({ ...fields, signature: mac(fields) });
  const callback = await bankcard.parseCallback(notification());
  assert.equal((await bankcard.verify({ ...expected(start.ref), callback })).paid, true);
  await assert.rejects(bankcard.verify(expected(start.ref)), { code: 'INVALID_INPUT' });
  await assert.rejects(bankcard.verify({ ...expected(start.ref), callback, expectedAmount: rupees(100) }), { code: 'AMOUNT_MISMATCH' });
  for (const [decision, status] of [['DECLINE', 'failed'], ['CANCEL', 'canceled'], ['REVIEW', 'ambiguous']]) {
    fields.decision = decision;
    const cb = await bankcard.parseCallback(notification());
    assert.equal((await bankcard.verify({ ...expected(start.ref), callback: cb })).status, status);
  }
});
