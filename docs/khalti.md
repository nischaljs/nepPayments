# Khalti

Khalti ePayment (KPG-2). The buyer is redirected to Khalti, comes back to your `returnUrl`, and you look the payment up on your server.

## Config

```ts
import { createPayments } from 'nepal-payments';

const payments = createPayments({
  mode: 'sandbox', // 'live' for real money, 'mock' for no keys and no network
  khalti: { secretKey: process.env.KHALTI_SECRET_KEY! }
});
```

| Field | Required | Notes |
|---|---|---|
| `secretKey` | yes (not in mock) | From the Khalti merchant dashboard. Sent as `Authorization: Key <secretKey>`. Sandbox keys work only with `mode: 'sandbox'`. |
| `endpoints` | no | `{ api, merchant }` to override the hosts. |

Hosts: sandbox `https://dev.khalti.com/api/v2`, live `https://khalti.com/api/v2`.

## Start a payment

```ts
const start = await payments.khalti.initiate({
  amount: rupees(100),           // paisa; at least 1000 (Rs 10)
  orderId: 'order-42',           // purchase_order_id
  orderName: 'Two cups of tea',  // purchase_order_name
  returnUrl: 'https://shop.example/payments/khalti/return',
  websiteUrl: 'https://shop.example',
  customer: { name: 'Ram', email: 'ram@example.com', phone: '9800000001' } // optional
});
// start.kind === 'redirect'; save start.ref (the pidx) with the order, then redirect to start.url
```

Optional: `amountBreakdown`, `productDetails`, and `merchantExtra` (keys must start with `merchant_`).

## Verify

> **Important: Khalti cannot check the order id.** The lookup API does not return `purchase_order_id`, so `result.checked.orderId` is `false` and `expectedOrderId` is not compared. The only thing that ties a payment to your order is the pidx you stored. Store `start.ref` with the order at initiate, and verify **only that stored pidx**. Never verify a pidx taken from the callback URL: a buyer can put there the pidx of another payment, such as a cheaper one, and it would pass.

Khalti sends the buyer back to `returnUrl` with `pidx`, `status`, `total_amount` and more in the query. Those values are not signed. Use the callback's pidx only to find the order, then verify the pidx you stored:

```ts
const cb = await payments.khalti.parseCallback(req.url); // { ref: pidx, signed: false, ... }
const order = await findOrderByRef(cb.ref);               // the order whose stored start.ref is this pidx
if (!order) return notFound();
const result = await payments.khalti.verify({ ref: order.ref, expectedAmount: order.amount, expectedOrderId: order.id });
if (result.paid) await markPaid(order, result.transactionId);
```

## Statuses

| Khalti | nepal-payments |
|---|---|
| Completed | `paid` |
| Pending, Initiated | `pending` |
| Expired | `expired` |
| User canceled | `canceled` |
| Refunded, Partially Refunded | `refunded` |
| anything else | `ambiguous` |

Khalti answers Expired and User canceled with HTTP 400. They are returned as statuses, not thrown.

## Refund

```ts
await payments.khalti.refund({ transactionId: result.transactionId!, amount: paisa(5000) }); // amount optional: full refund without it
```

`mobile` is optional (the Khalti wallet number to refund to). The refund API lives on the merchant host (`/api/merchant-transaction/<id>/refund/`).

## Test credentials

Khalti publishes sandbox test wallets (Khalti IDs 9800000000 to 9800000005, MPIN 1111, OTP 987654) for the sandbox checkout page. In tests use `fakeKhalti()` from `nepal-payments/testing` instead.
