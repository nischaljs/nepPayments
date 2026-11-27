# Changelog

## 2.0.8 (2026-11-27)

Fixes from the 2.0.7 review. The public API is the same.

### Changed

- eSewa `AMBIGUOUS` now maps to `PENDING` (was `FAILED`). The payment is not
  settled yet, so do not ask the buyer to pay again. `raw_status` still says
  `AMBIGUOUS`.
- `expectedAmount` is checked only when the status is `COMPLETED`. An expired,
  canceled or pending payment returns its status with no amount check.

### Fixed

- Bad input no longer comes back as `NETWORK_ERROR`. `createPayment` checks its
  input before any request: eSewa without `signed_field_names` and Khalti with
  a `product_details` or `amount_breakdown` that is not an array throw
  `INVALID_PAYMENT_OPTIONS`; a Khalti amount that is not a number throws
  `INVALID_AMOUNT`.
- Only a request that got no answer gives `NETWORK_ERROR` or
  `REQUEST_TIMEOUT`. Any other error gets the method's own code
  (`PAYMENT_FAILED` or `VERIFICATION_FAILED`).
- The secret key is no longer a property of the gateway object, so
  `console.log(gateway)` and `JSON.stringify(gateway)` do not show it.
- Khalti `transaction_id` is `''` when Khalti sends `null`, as with eSewa.
- A completed payment with no amount in the gateway's answer and
  `expectedAmount` set throws `INVALID_RESPONSE` with a clear message (was
  `AMOUNT_MISMATCH` against `NaN`).
- Removed the unused `src/types/payment.errors.ts`.

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
