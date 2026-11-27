# Express recipe

One file. Khalti redirects; eSewa posts a form. Replace `orders` with your database.

```ts
import express from 'express';
import { createPayments, isPaymentError, type Paisa } from 'nepal-payments';

const payments = createPayments({
  mode: process.env.NODE_ENV === 'production' ? 'live' : 'sandbox',
  khalti: { secretKey: process.env.KHALTI_SECRET_KEY! },
  esewa: { productCode: process.env.ESEWA_PRODUCT_CODE!, secretKey: process.env.ESEWA_SECRET_KEY! }
});

const app = express();
const orders = new Map<string, { id: string; amount: Paisa; ref?: string; paid?: boolean }>();
const base = 'https://shop.example';

app.post('/pay/khalti/:orderId', async (req, res) => {
  const order = orders.get(req.params.orderId)!;
  const start = await payments.khalti.initiate({
    amount: order.amount, orderId: order.id, orderName: `Order ${order.id}`,
    returnUrl: `${base}/pay/khalti/return`, websiteUrl: base
  });
  order.ref = start.ref;
  res.redirect(303, start.url);
});

app.get('/pay/khalti/return', async (req, res) => {
  const cb = await payments.khalti.parseCallback(req.originalUrl);
  const order = [...orders.values()].find(o => o.ref === cb.ref);
  if (!order) return res.status(404).send('Unknown payment');
  try {
    const result = await payments.khalti.verify({ ref: order.ref, expectedAmount: order.amount, expectedOrderId: order.id });
    order.paid = result.paid;
    res.redirect(result.paid ? '/thanks' : `/pay/retry?status=${result.status}`);
  } catch (e) {
    if (isPaymentError(e)) return res.status(e.code === 'NETWORK_ERROR' || e.code === 'TIMEOUT' ? 503 : 400).send(e.message);
    throw e;
  }
});

app.get('/pay/esewa/:orderId', async (req, res) => {
  const order = orders.get(req.params.orderId)!;
  const start = await payments.esewa.initiate({
    amount: order.amount, orderId: order.id,
    successUrl: `${base}/pay/esewa/success`, failureUrl: `${base}/pay/esewa/failure`
  });
  const inputs = Object.entries(start.fields).map(([k, v]) => `<input type="hidden" name="${k}" value="${v.replace(/"/g, '&quot;')}">`).join('');
  res.send(`<form id="f" method="POST" action="${start.action}">${inputs}</form><script>f.submit()</script>`);
});

app.get('/pay/esewa/success', async (req, res) => {
  const cb = await payments.esewa.parseCallback(req.originalUrl); // throws INVALID_SIGNATURE on a forged callback
  const order = orders.get(cb.ref)!;
  const result = await payments.esewa.verify({ ref: cb.ref, expectedAmount: order.amount, expectedOrderId: order.id });
  order.paid = result.paid;
  res.redirect(result.paid ? '/thanks' : `/pay/retry?status=${result.status}`);
});

app.listen(3000);
```

ConnectIPS and Hamro Pay work like eSewa: `initiate` returns a form, `parseCallback` reads the ref, `verify` confirms. For a Hamro Pay webhook, read the raw body with `express.text({ type: 'application/json' })` and pass `{ body: req.body, signature: req.get('signature') }`.
