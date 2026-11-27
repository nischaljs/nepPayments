# nepal-payments: rules for coding agents

Read these before you write payment code with this package.

1. **Verify on your server before you ship the order.** A redirect or a callback only says the buyer came back. Call `verify({ ref, expectedAmount, expectedOrderId })` on the server and ship only when `result.paid` is `true`. Never trust amounts or statuses from the browser.
2. **Pass the amount you expect, in paisa.** Use `rupees(100)` or `paisa(10000)`. `verify` throws `AMOUNT_MISMATCH` or `ORDER_MISMATCH` when the gateway disagrees. Treat that as fraud or a bug, not a retry.
3. **Keep secrets on the server.** Secret keys, the ConnectIPS `.pfx` and the Hamro Pay client secret come from environment variables. Never import this package in browser code. Error messages and results already hide secrets; do not log the config yourself.
4. **Handle every status.** `paid` ships. `pending` and `ambiguous` mean ask again later (eSewa says AMBIGUOUS on its own). `failed`, `canceled`, `expired` and `refunded` do not ship. Errors are thrown only for bad input, bad config, bad signatures, mismatches and network trouble: catch `PaymentError` and read `code`.
5. **Test without keys.** Use `mode: 'mock'` for local runs and demos, and `nepal-payments/testing` (`fakeFetch`, `fakeKhalti`, `fakeEsewa`, `fakeConnectIps`, `fakeHamroPay`) in tests. Tests must never call a sandbox or live host.

Docs per gateway: `docs/khalti.md`, `docs/esewa.md`, `docs/connectips.md`, `docs/hamropay.md`. Recipes: `docs/express.md`, `docs/nextjs.md`, `docs/nestjs.md`.
