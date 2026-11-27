// Run with Node 22.13+ for built-in SQLite. All provider requests use an in-process fake.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createPayments, rupees } from 'nepal-payments';
import { fakeFetch, fakeHamroPay, hamroPayWebhook } from 'nepal-payments/testing';

const merchant = {
  merchantId: 'demo-shop', clientId: 'demo-client', clientApiKey: 'demo-key',
  clientSecret: 'demo-session-secret', webhookSecret: 'demo-webhook-secret'
};
const provider = fakeHamroPay({ clientSecret: merchant.clientSecret, status: 'PENDING' });
const { hamropay } = createPayments({ mode: 'sandbox', hamropay: merchant, fetch: fakeFetch(provider.handler) });
const directory = mkdtempSync(join(tmpdir(), 'nepal-payments-'));
const db = new DatabaseSync(join(directory, 'shop.sqlite'));
db.exec(`
  CREATE TABLE orders (id TEXT PRIMARY KEY, amount INTEGER NOT NULL);
  CREATE TABLE attempts (
    id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
    amount INTEGER NOT NULL, ref TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'pending'
  );
  CREATE TABLE downloads (order_id TEXT PRIMARY KEY REFERENCES orders(id));
`);

async function checkout(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const id = randomUUID().replaceAll('-', '').slice(0, 24);
  // Hamro Pay uses our unique attempt ID as its lookup reference.
  db.prepare('INSERT INTO attempts (id, order_id, amount, ref) VALUES (?, ?, ?, ?)').run(id, order.id, order.amount, id);
  return hamropay.initiate({
    orderId: id, amount: order.amount, remarks: 'Digital download',
    successUrl: 'https://shop.example/return', failureUrl: 'https://shop.example/return'
  });
}

async function settle(ref, callback) {
  const attempt = db.prepare('SELECT * FROM attempts WHERE ref = ?').get(ref);
  if (!attempt) throw new Error('Unknown payment attempt');
  const result = await hamropay.verify({
    ref: attempt.ref, expectedAmount: attempt.amount, expectedOrderId: attempt.id, callback
  });
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare("UPDATE attempts SET status = ? WHERE id = ? AND status <> 'paid'").run(result.status, attempt.id);
    if (result.paid) {
      // The download entitlement IS the fulfilment. Multiple successful attempts grant one per order.
      db.prepare('INSERT INTO downloads (order_id) VALUES (?) ON CONFLICT(order_id) DO NOTHING').run(attempt.order_id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return result.status;
}

async function onNotification(input) {
  const callback = await hamropay.parseCallback(input);
  return settle(callback.ref, callback);
}

async function reconcile() {
  const pending = db.prepare("SELECT ref FROM attempts WHERE status IN ('pending', 'ambiguous')").all();
  for (const attempt of pending) await settle(attempt.ref);
}

try {
  const amount = rupees(100);
  db.prepare('INSERT INTO orders VALUES (?, ?)').run('book', amount);
  const first = await checkout('book');
  const redirect = new URL('https://shop.example/return');
  redirect.searchParams.set('MerchantTxnId', first.ref);
  assert.equal(await onNotification(redirect), 'pending');
  assert.equal(db.prepare('SELECT count(*) AS count FROM downloads').get().count, 0);
  console.log('Buyer returned while payment was pending. Download stays locked.');

  const retry = await checkout('book');
  provider.set(retry.ref, { status: 'COMPLETED' });
  const webhook = hamroPayWebhook({ orderId: retry.ref, amount, merchantId: merchant.merchantId, webhookSecret: merchant.webhookSecret });
  await Promise.all([onNotification(webhook), onNotification(webhook)]);
  assert.equal(db.prepare('SELECT count(*) AS count FROM downloads').get().count, 1);
  console.log('Two webhook deliveries. One verified download granted.');

  provider.set(first.ref, { status: 'COMPLETED' });
  await reconcile();
  assert.equal(db.prepare("SELECT count(*) AS count FROM attempts WHERE status = 'paid'").get().count, 2);
  assert.equal(db.prepare('SELECT count(*) AS count FROM downloads').get().count, 1);
  console.log('Recheck found a second paid attempt without a notification. One download; review the duplicate payment.');
} finally {
  db.close();
  rmSync(directory, { recursive: true, force: true });
}
