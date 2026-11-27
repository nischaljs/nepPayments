# nepal-payments: rules for coding agents

Read these before you write payment code with this package.

1. **Verify on your server before you ship the order.** A redirect or a callback only says the buyer came back. Call `verify({ ref, expectedAmount, expectedOrderId })` on the server and ship only when `result.paid` is `true`. For eSewa, pass the signed callback too, `verify({ ..., callback: cb })`: the eSewa status API only echoes the amount you send, so the signed callback's amount is the real check. `status()` is not for fulfilment: it checks nothing and has no `paid` field. Never trust amounts or statuses from the browser.
2. **Pass the amount you expect, in paisa.** Use `rupees(100)` or `paisa(10000)`. `verify` throws `AMOUNT_MISMATCH` or `ORDER_MISMATCH` when the gateway disagrees. Treat that as fraud or a bug, not a retry.
3. **Keep secrets on the server.** Secret keys, the ConnectIPS `.pfx` and the Hamro Pay client secret come from environment variables. Never import this package in browser code. Error messages and results already hide secrets; do not log the config yourself.
4. **Handle every status.** `paid` ships. `pending` and `ambiguous` mean ask again later (eSewa says AMBIGUOUS on its own). `failed`, `canceled`, `expired` and `refunded` do not ship. Errors are thrown only for bad input, bad config, bad signatures, mismatches and network trouble: catch the error, check it with `isPaymentError(e)` (not `instanceof`, which can fail when two copies of the package are loaded) and read `e.code`.
5. **Khalti: verify the pidx you stored.** The Khalti lookup has no order id, so `verify` cannot check `expectedOrderId` for Khalti. Store `start.ref` (the pidx) with the order at initiate and pass that stored value to `verify`. Never pass the pidx from the callback URL; use it only to find the order.
6. **Test without keys.** Use `mode: 'mock'` for local runs and demos (refused when `NODE_ENV` is `production`; a mock ref works only in the process that made it), and `nepal-payments/testing` (`fakeFetch`, `fakeKhalti`, `fakeEsewa`, `fakeConnectIps`, `fakeHamroPay`) in tests. Tests must never call a sandbox or live host.

Docs per gateway: `docs/khalti.md`, `docs/esewa.md`, `docs/connectips.md`, `docs/hamropay.md`. Recipes: `docs/express.md`, `docs/nextjs.md`, `docs/nestjs.md`.

## Releasing

Only GitHub Actions publishes (`.github/workflows/publish.yml`, npm trusted publishing, no token).

1. Set `version` in `package.json`, add `## <version> (<date>)` to `CHANGELOG.md`, and change the pinned tag in the README links to `v<version>`.
2. Commit, then `git tag v<version> && git push origin v<version>`.
3. The workflow checks the tag matches the version, runs the checks, publishes (a version with `-` goes to the npm tag `next`, any other to `latest`) and creates the GitHub release from the CHANGELOG section.
