---
name: nepal-payments
description: Add or review Khalti, eSewa, ConnectIPS or Hamro Pay payments in a Node.js, Next.js, Express or NestJS app with the nepal-payments package. Use when code starts a payment, handles a gateway callback or webhook, verifies a payment, refunds, or tests payment code.
---

# nepal-payments

One typed API for Nepal's payment gateways. Server only. Node 18 or later.

## The flow, for every gateway

1. `createPayments({ mode, <gateway>: config })` once, with secrets from environment variables. `mode` is `'sandbox'`, `'live'` or `'mock'`.
2. `initiate(input)` on the server. Save `start.ref` with the order. Then:
   - `start.kind === 'redirect'` (Khalti): redirect the buyer to `start.url`.
   - `start.kind === 'form'` (eSewa, ConnectIPS, Hamro Pay): render a hidden form that posts `start.fields` to `start.action`, and submit it.
3. On the return URL or webhook: `parseCallback(urlOrBody)` to read the ref. eSewa callbacks and Hamro Pay webhooks are signature-checked (`signed: true`); the others are not.
4. Always `verify({ ref, expectedAmount, expectedOrderId })` on the server. Ship only when `result.paid` is true.

## Rules

- Amounts are integer paisa: `rupees(100)` is `10000`. Never pass a float.
- `verify` throws `AMOUNT_MISMATCH` or `ORDER_MISMATCH` when the gateway disagrees with what you expected. Do not retry; flag the order.
- Statuses: `paid` ships. `pending` and `ambiguous` mean check again later. `failed`, `canceled`, `expired`, `refunded` do not ship. They are return values, never errors.
- Errors are `PaymentError` with `code`. Check them with `isPaymentError(e)`, not `instanceof PaymentError`. Codes: INVALID_CONFIG, INVALID_INPUT, AMOUNT_MISMATCH, ORDER_MISMATCH, INVALID_SIGNATURE, AUTH_ERROR, GATEWAY_ERROR, INVALID_RESPONSE, NETWORK_ERROR, TIMEOUT, NOT_SUPPORTED. Messages never hold secrets.
- Khalti cannot report the order id (`result.checked.orderId` is false). Store `start.ref` (the pidx) with the order at initiate and verify only that stored pidx: `verify({ ref: order.ref, ... })`. Never verify the pidx from the callback URL; use it only to find the order.
- Hamro Pay in live mode needs `endpoints: { api, gateway }` from Hamro Pay.
- ConnectIPS and Hamro Pay are experimental: not yet run against their sandboxes. ConnectIPS needs a new `orderId` per attempt, and its amount check is an echo.
- ConnectIPS needs `pfx` + `pfxPassword` (a Buffer of the .pfx) or `privateKeyPem`.
- Refunds: Khalti only (`refund({ transactionId, amount? })`). Others throw NOT_SUPPORTED.

## Tests

- `mode: 'mock'`: no keys, no network. `initiate({ ..., mockOutcome: 'failed' })` picks the outcome; `verify` follows it. Mock mode is refused when `NODE_ENV` is `production` (INVALID_CONFIG). Mock refs are signed with a key made per process, so a typed ref fails, and a ref works only in the process that made it (not after a restart or on another instance).
- `import { fakeFetch, fakeKhalti, fakeEsewa, fakeConnectIps, fakeHamroPay, esewaCallback, hamroPayWebhook } from 'nepal-payments/testing'`, then `createPayments({ mode: 'sandbox', fetch: fakeFetch(fake.handler), ... })`. `fake.set(ref, { status, amount })` sets what the gateway reports. The handlers also work with MSW.
- Never call a real sandbox or live host from a test.

## Upgrading from nep-payments 2.x

`import { NepPayments } from 'nepal-payments/compat'` keeps the 2.0.7 API. Move each call to `createPayments` when you can.

## Docs

`docs/khalti.md`, `docs/esewa.md`, `docs/connectips.md`, `docs/hamropay.md`, `docs/express.md`, `docs/nextjs.md`, `docs/nestjs.md` in the package.
