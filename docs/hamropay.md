# Hamro Pay

Hamro Pay checkout. Your server creates a session, your page posts a signed form to the Hamro Pay gateway, Hamro Pay sends the buyer back and can also post a signed webhook. You confirm with the transaction status API.

## Config

```ts
const payments = createPayments({
  mode: 'sandbox',
  hamropay: {
    merchantId: process.env.HAMROPAY_MERCHANT_ID!,
    clientId: process.env.HAMROPAY_CLIENT_ID!,
    clientApiKey: process.env.HAMROPAY_CLIENT_API_KEY!,
    clientSecret: process.env.HAMROPAY_CLIENT_SECRET!,
    webhookSecret: process.env.HAMROPAY_WEBHOOK_SECRET // only to read webhooks
  }
});
```

All four ids are in the merchant portal under Client Credentials. Requests carry the `client-id`, `client-api-key` and `signature` headers. Signatures are HMAC-SHA512 in base64 over the comma-joined values; a value with a comma is refused, because the join has no escaping.

Hosts: sandbox API `https://uat-payclient.hamropatro.com`, gateway `https://uat-checkout-pay.hamropatro.com`. Hamro Pay does not publish its live hosts, so `mode: 'live'` needs `endpoints: { api, gateway }` from Hamro Pay, or it throws `INVALID_CONFIG`.

## Start a payment

```ts
const start = await payments.hamropay.initiate({
  amount: rupees(100),  // 1000 to 5,000,000 paisa
  orderId: 'order-42',  // merchantTxnId, at most 25 characters
  successUrl: 'https://shop.example/payments/hamropay/success',
  failureUrl: 'https://shop.example/payments/hamropay/failure'
});
// start.kind === 'form': post start.fields to start.action within 10 minutes (start.expiresAt)
```

Optional: `remarks` (250 characters or fewer, default the orderId), `phone`, `products` (prices in paisa; sent to Hamro Pay in rupees), `metadata`.

## Amount units

You always pass paisa. Hamro Pay uses a different unit per field, and the plug converts each one. From the [Hamro Pay API reference](https://hamropay.com.np/checkout/developer-reference/):

| Field | Hamro Pay unit | Doc text |
|---|---|---|
| create session `transactionAmount` (also signed in the header and the form token) | paisa | "Long. Amount in Paisa. ... Rs.10 = 1000, Rs.89.92 = 8992" |
| `productList[].price` | rupees | "Amount in Rs. for render purpose so Rs.99.99 should be 99.99" |
| transaction status `amount` | rupees | "Double. Amount in Rupees." |
| webhook `amount` | rupees | "double. Transaction amount in Rs." |

The doc's create session sample sends `"transactionAmount": "1000"` with products priced 10 and 20, so the sample does not add up. The plug follows the field table, not the sample's product prices.

## Callback, webhook and verify

```ts
// Redirect: reads MerchantTxnId, signed: false
const cb = await payments.hamropay.parseCallback(req.url);

// Webhook: pass the raw body text and the signature header
const hook = await payments.hamropay.parseCallback({ body: rawBody, signature: req.headers['signature'] });
// signed: true; a bad signature or another merchant throws INVALID_SIGNATURE

const result = await payments.hamropay.verify({ ref: cb.ref, expectedAmount: order.amount, expectedOrderId: order.id });
```

Pass the webhook body as the raw text you received, not a re-serialized object, so the amount is signed exactly as sent.

## Statuses

| Hamro Pay | nepal-payments |
|---|---|
| COMPLETED | `paid` |
| PENDING, PROCESSING, NOT_INITIATED | `pending` |
| FAILED | `failed` |
| anything else | `ambiguous` |

The amount is read only when the status is COMPLETED. There is no refund API in this package for Hamro Pay.

## Testing

In tests use `fakeHamroPay({ clientSecret })` (it checks the signature header) and `hamroPayWebhook()` from `nepal-payments/testing`.
