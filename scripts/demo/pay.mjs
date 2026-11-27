import { createPayments, rupees, isPaymentError } from 'nepal-payments';

// Mock mode: no keys, no network. Use 'sandbox' and your key for real tests.
const payments = createPayments({ mode: 'mock', khalti: {} });

// 1. Start the payment. Store start.ref with the order.
const start = await payments.khalti.initiate({
  amount: rupees(100), orderId: 'order-42', orderName: 'Two cups of tea',
  returnUrl: 'https://shop.example/return', websiteUrl: 'https://shop.example'
});
console.log('initiate:', start.kind);

// 2. Verify on your server, with the amount from your database.
const result = await payments.khalti.verify({
  ref: start.ref, expectedAmount: rupees(100), expectedOrderId: 'order-42'
});
console.log('verify:  ', result.status, '| paid =', result.paid);

// 3. The same payment, checked against a different amount.
try {
  await payments.khalti.verify({
    ref: start.ref, expectedAmount: rupees(500), expectedOrderId: 'order-42'
  });
} catch (e) {
  if (isPaymentError(e)) console.log('verify:  ', e.code, '| do not ship');
}
