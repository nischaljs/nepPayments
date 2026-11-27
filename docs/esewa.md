# eSewa

eSewa ePay v2. Your page posts a signed HTML form to eSewa. eSewa sends the buyer back to `successUrl` with a signed, base64 `data` parameter. You confirm with the status API.

## Config

```ts
const payments = createPayments({
  mode: 'sandbox',
  esewa: { productCode: process.env.ESEWA_PRODUCT_CODE!, secretKey: process.env.ESEWA_SECRET_KEY! }
});
```

| Field | Required | Notes |
|---|---|---|
| `productCode` | yes (not in mock) | Your merchant code. Sandbox: `EPAYTEST`. |
| `secretKey` | yes (not in mock) | The HMAC key. Sandbox: `8gBm/:&EnhH.1/q`. |
| `endpoints` | no | `{ form, status }` to override the URLs. |

URLs: sandbox form `https://rc-epay.esewa.com.np/api/epay/main/v2/form`, status `https://rc.esewa.com.np/api/epay/transaction/status/`; live form `https://epay.esewa.com.np/api/epay/main/v2/form`, status `https://esewa.com.np/api/epay/transaction/status/`.

## Start a payment

```ts
const start = await payments.esewa.initiate({
  amount: rupees(100),
  orderId: 'order-42', // transaction_uuid: letters, digits and hyphens
  successUrl: 'https://shop.example/payments/esewa/success',
  failureUrl: 'https://shop.example/payments/esewa/failure'
});
// start.kind === 'form': render <form method="POST" action={start.action}> with one hidden input per start.fields
```

`breakdown` is optional (`{ amount?, taxAmount?, serviceCharge?, deliveryCharge? }` in paisa; the parts must add up to `amount`). The fields are signed over `total_amount,transaction_uuid,product_code` with HMAC-SHA256 in base64.

## Callback and verify

```ts
const cb = await payments.esewa.parseCallback(req.url); // or { data } or the raw base64 string
// cb.signed === true: the signature was checked. A bad one throws INVALID_SIGNATURE.
const order = await findOrder(cb.ref);
const result = await payments.esewa.verify({ ref: cb.ref, expectedAmount: order.amount, expectedOrderId: order.id, callback: cb });
if (result.paid) await markPaid(order, result.transactionId);
```

**Pass `callback: cb` to verify.** The eSewa status API is asked with `total_amount` and answers with the same `total_amount`: the amount it reports is an echo of the amount you sent, not a separate check. The signed callback carries eSewa's own `total_amount`. With `callback`, verify compares that signed amount (and its `transaction_uuid`) with your expected values and throws `AMOUNT_MISMATCH` or `ORDER_MISMATCH`; `result.checked.callback` is then `true`. Without it, `result.checked.amount` only means the echo matched.

A signed callback is still not enough to ship alone: verify also asks the status API for the status. eSewa has no refund API.

## Statuses

| eSewa | nepal-payments |
|---|---|
| COMPLETE | `paid` |
| PENDING | `pending` |
| FULL_REFUND, PARTIAL_REFUND | `refunded` |
| CANCELED | `canceled` |
| NOT_FOUND | `failed` |
| AMBIGUOUS, anything else | `ambiguous` |

AMBIGUOUS is eSewa's own word for "not sure yet". Do not ship; check again later.

## Test credentials

eSewa's test ids are 9711111111, 9711111112 and 9711111113, password `Nepal@123`, MPIN `1122` (app only), token `123456`. In tests use `fakeEsewa()` and `esewaCallback()` from `nepal-payments/testing`.
