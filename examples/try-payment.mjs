#!/usr/bin/env node
import { createPayments, rupees } from 'nepal-payments';

const methods = ['nepalpay', 'fonepay', 'bankcard'];
const outcomes = ['paid', 'pending', 'failed'];
const [method = 'nepalpay', outcome = 'paid'] = process.argv.slice(2);
if (method === '--help' || !methods.includes(method) || !outcomes.includes(outcome)) {
  console.log('Usage: nepal-payments-demo [nepalpay|fonepay|bankcard] [paid|pending|failed]');
  process.exitCode = method === '--help' ? 0 : 1;
} else {
  const client = createPayments({ mode: 'mock', [method]: {} })[method];
  const attempt = { id: 'tea-a1', amount: rupees(100) };
  const start = await client.initiate({ orderId: attempt.id, amount: attempt.amount, mockOutcome: outcome });
  const result = await client.verify({ ref: start.ref, expectedAmount: attempt.amount, expectedOrderId: attempt.id });
  console.log(`Local demo · ${method} · NPR 100.00`);
  console.log(start.kind === 'qr' ? 'QR checkout created.' : 'Hosted checkout form created.');
  console.log(`Server verified: ${result.status}. ${result.paid ? 'Grant the order once.' : 'Keep the order unpaid.'}`);
}
