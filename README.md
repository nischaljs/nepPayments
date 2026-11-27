# nepal-payments

Khalti, eSewa, ConnectIPS and Hamro Pay payments for Node.js and Next.js. One typed TypeScript API to start and verify payments from Nepal's gateways.

> 3.0.0-rc.0. This README is a placeholder. See `docs/` for each gateway.
>
> ConnectIPS and Hamro Pay are **experimental**: built from the gateways' documents, not yet run against their sandboxes.

```sh
npm install nepal-payments
```

```ts
import { createPayments, rupees } from 'nepal-payments';

const payments = createPayments({
  mode: 'sandbox',
  khalti: { secretKey: process.env.KHALTI_SECRET_KEY! }
});

// 1. Start: send the buyer to Khalti and keep start.ref with the order.
const start = await payments.khalti.initiate({
  amount: rupees(100),
  orderId: 'order-42',
  orderName: 'Two cups of tea',
  returnUrl: 'https://shop.example/pay/khalti/return',
  websiteUrl: 'https://shop.example'
});
await saveOrderRef('order-42', start.ref); // your database

// 2. On the return URL, on your server. Use the callback's pidx only to find the order,
//    then verify the pidx you stored (Khalti's lookup has no order id to check).
const cb = await payments.khalti.parseCallback(returnUrl);
const order = await findOrderByRef(cb.ref); // your database
const result = await payments.khalti.verify({ ref: order.ref, expectedAmount: order.amount, expectedOrderId: order.id });
if (result.paid) {
  // ship the order
}
```

Coming from `nep-payments` 2.x: `import { NepPayments } from 'nepal-payments/compat'` keeps the old API.

MIT License.
