# Changelog

## 3.0.0-rc.1 (2026-11-27)

- A full README: quick start per gateway, safe defaults, mock mode and tests, migrating from `neppayments` 2.x, and notes for coding agents. With a demo GIF and an architecture picture (not in the package).
- The package description and keywords say what the package does.
- ConnectIPS and Hamro Pay are no longer marked experimental.
- `nepal-payments/compat` now matches 2.0.8: eSewa AMBIGUOUS is `PENDING`, `expectedAmount` is checked only on `COMPLETED`, bad `createPayment` input throws its validation code before any request, an error that is not a request error gets the method's code instead of `NETWORK_ERROR`, the secret key and the HTTP client are private fields (not in `JSON.stringify(gateway)`), Khalti `transaction_id` is `''` when null, and a completed payment with no amount throws `INVALID_RESPONSE`.

## 3.0.0-rc.0 (2026-11-27)

New package name: `nepal-payments` (was `neppayments`). Release candidate.

### Added

- `createPayments({ mode, khalti?, esewa?, connectips?, hamropay? })`. Only the gateways you configure exist on the result, and TypeScript knows which.
- ConnectIPS (RSA-signed form from a .pfx or PEM key, `validatetxn`) and Hamro Pay (session, signed form, signed webhook, transaction status).
- One shape for every gateway: `initiate` returns `redirect` or `form`; `parseCallback`; `verify({ ref, expectedAmount, expectedOrderId })`; `status` (no checks and no `paid` field, so it is not for fulfilment); `refund` (Khalti).
- Statuses `paid`, `pending`, `failed`, `canceled`, `refunded`, `expired`, `ambiguous`. eSewa AMBIGUOUS and Khalti Refunded keep their own status.
- `verify` checks the amount and, where the gateway reports it, the order id. It also takes an optional `callback` (what `parseCallback` returned); when that callback is signed, its amount and order id are compared too. `result.checked` is `{ amount, orderId, callback }`. Pass the callback for eSewa, whose status API only echoes the amount you send. Only the exact object `parseCallback` returned counts as signed: a copy that says `signed: true` throws `INVALID_INPUT`, so run `parseCallback` again on a stored raw callback.
- Amounts are integer paisa everywhere (`paisa`, `rupees`, `toRupeeString`).
- `mode: 'mock'`: no keys, no network. Mock mode is refused when `NODE_ENV` is `production` (INVALID_CONFIG). Mock refs are signed with a key made per process, so a typed ref fails, and a ref works only in the process that made it (not after a restart or on another instance). A mock ref has 6 parts: `mock.<outcome>.<amount>.<orderId base64url>.<random>.<hmac>`.
- `nepal-payments/testing`: `fakeFetch` and fake handlers for each gateway, `esewaCallback`, `hamroPayWebhook`.
- Subpath entries `nepal-payments/khalti`, `/esewa`, `/connectips`, `/hamropay`. ESM and CommonJS, with types.
- `AGENTS.md`, `llms.txt`, an agent skill, and docs per gateway with Express, Next.js and NestJS recipes.

### Changed

- No runtime dependencies. HTTP uses the built-in `fetch` (Node 18 or later), with a timeout on every call.
- `PaymentError` has `code`, `message`, `gateway`, `field` and `response: { status, data }`, with every secret removed.

### Upgrading

- `import { NepPayments } from 'nepal-payments/compat'` keeps the 2.0.8 API and outputs, including 2.x status names.

## 2.0.7 (2026-11-27)

Security fix. Upgrade from any 2.x version. The public API is the same.

### Security

- Khalti and eSewa errors no longer carry the request. Before, a failed call
  rethrew the Axios error, whose `config.headers.Authorization` held the
  Khalti secret key. Every error is now a `PaymentError` with `message`,
  `code` and `response: { status, data }` only.
- The Khalti error check read `error_key` and `detail` from the Axios error
  instead of `error.response.data`, so it never matched. Fixed.
- eSewa no longer writes the full request or response to `console.error`.

### Added

- `verifyPayment({ pidx, expectedAmount })` for Khalti (paisa) and
  `verifyPayment({ ..., expectedAmount })` for eSewa (rupees). When the
  gateway's amount differs, it throws `PaymentError` with code
  `AMOUNT_MISMATCH`.
- `raw_status` on every verify result: the gateway's own status word.
- `PaymentErrorCode.AMOUNT_MISMATCH`.

### Fixed

- Khalti lookup: `Initiated` maps to `PENDING` and `User canceled` to
  `CANCELED` (both were `FAILED`). `Expired` and `User canceled` come back
  with HTTP 400; they are now returned as statuses, not thrown.
  `Refunded` and `Partially Refunded` stay `FAILED`; read `raw_status`.
- Khalti verify returned `amount: undefined`, because the lookup sends
  `total_amount`. It now returns `total_amount`.
- An `environment` other than `'sandbox'` or `'production'` throws
  `INVALID_CONFIG` when the gateway is created. No environment still means
  production.
- package.json has `repository`, `homepage` and `bugs`; the MIT LICENSE
  file is included.
