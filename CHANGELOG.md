# Changelog

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
