<!-- Images and doc links are absolute (raw.githubusercontent.com and github.com) and pinned to the release tag, so they also work on npm. Change the tag with each release. -->

# nepal-payments

Nepal payment gateways for Node.js and TypeScript. One API, zero runtime dependencies, built for coding agents too.

[![npm version](https://img.shields.io/npm/v/nepal-payments)](https://www.npmjs.com/package/nepal-payments)
[![npm downloads](https://img.shields.io/npm/dm/nepal-payments)](https://www.npmjs.com/package/nepal-payments)
[![license: MIT](https://img.shields.io/npm/l/nepal-payments)](https://github.com/nischaljs/nepal-payments/blob/v3.0.0/LICENSE)
[![types: included](https://img.shields.io/npm/types/nepal-payments)](https://www.npmjs.com/package/nepal-payments)
[![dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen)](https://github.com/nischaljs/nepal-payments/blob/v3.0.0/package.json)

## Verify your first payment locally

Install the package in a Node.js 18+ server project.

```sh
npm install nepal-payments
```

Save this as `checkout.mjs` and run **`node checkout.mjs`**. It runs entirely on your machine with no account, keys, or network requests.

```js
import { createPayments, rupees } from 'nepal-payments';

const { connectips } = createPayments({ mode: 'mock', connectips: {} });
const attempt = { id: 'tea-1-a1', amount: rupees(100) };
const start = await connectips.initiate({ orderId: attempt.id, amount: attempt.amount });
attempt.ref = start.ref;

const result = await connectips.verify({
  ref: attempt.ref, expectedAmount: attempt.amount, expectedOrderId: attempt.id
});
console.log(result.status, result.amount); // paid 10000 (paisa)
```

To try a pending payment, add `mockOutcome: 'pending'` to the initiate input. A mock reference lasts for the current process. Keep the SDK and your credentials on the server.

**Connect your sandbox.** [Khalti](#khalti) · [eSewa](#esewa) · [ConnectIPS](#connectips) · [Hamro Pay](#hamro-pay). For ConnectIPS and Hamro Pay, the request formats have been reviewed against provider documentation and tested offline. Merchant sandbox acceptance is still pending.

**Try a merchant workflow from this checkout.** On Node 22.13+, run `npm ci && npm run demo:checkout`. The example uses SQLite and a local Hamro Pay fake to handle a pending return, concurrent webhooks, and two successful attempts for one order. It grants one download and removes its temporary database on exit. In a package containing the example, run `node node_modules/nepal-payments/examples/checkout.mjs`.

## Configure your merchant accounts

Your server uses one SDK with a client for each enabled gateway. Your app owns checkout routes, order records and fulfilment. Each provider or acquiring bank issues its own merchant credentials and handles its payment page or QR network.

From your site’s server project, initialize the [environment template](.env.example) and [server module](examples/payments.mjs) with one command after installing the package:

```sh
npx --no-install nepal-payments-init
```

The command creates `.env` and `payments.mjs` and preserves existing files. If your app already has an environment file, merge the entries for the gateways you use. See the [Express](docs/express.md), [Next.js](docs/nextjs.md) and [NestJS](docs/nestjs.md) checkout routes for framework-specific examples.

Set `PAYMENT_GATEWAYS=khalti,fonepay` to enable those two clients, or use the seven names shown in the template to enable all. Leave `PAYMENT_MODE=mock` for local development. For a merchant sandbox, set it to `sandbox` and fill the matching credential blocks. Switch to `live` with production credentials after merchant acceptance. These variables are read by the copied module. Apps that call `createPayments()` directly can choose their own variable names.

Load the environment using your server framework or deployment settings. On Node 20.6+ you can check the configuration from the project root:

```sh
node --env-file=.env --input-type=module -e "import { payments } from './payments.mjs'; console.log(Object.keys(payments))"
```

This prints the enabled client names and makes no payment requests. Import `payments` from that same module in your server routes. Store merchant-issued key files outside your repository and set the file paths in the server environment.

| Client | Merchant setup and payment flow |
|---|---|
| [khalti](docs/khalti.md) | Khalti merchant account. Redirect the buyer and verify the saved payment reference. |
| [esewa](docs/esewa.md) | eSewa ePay merchant. Post a signed form and verify with the signed return. |
| [connectips](docs/connectips.md) | Bank/NCHL creditor enrollment. Register return URLs, sign the form with the creditor key, then validate the attempt. |
| [hamropay](docs/hamropay.md) | Hamro Pay merchant portal. Create a session, post the form and check transaction status. Register a webhook for notifications. |
| [nepalpay](docs/nepalpay.md) | NCHL/acquiring bank. Request both dynamic QR generation and transaction report access. |
| [fonepay](docs/fonepay.md) | Fonepay/acquiring bank. Request Dynamic QR credentials. Run the payment listener on your server. |
| [bankcard](docs/bankcard.md) | Bank-provisioned Cybersource Hosted Checkout profile. Enable NPR sales and register the merchant POST URL. |

Set your application's actual return and webhook URLs in the places specified by each guide. The SDK takes checkout-specific URLs as inputs where the provider supports them. The environment template contains credentials and client settings.

## Try QR and card checkout

**In this checkout**, install dependencies once with `npm ci`, then run `npm run demo:payments` for a verified mock NEPALPAY invoice. After the build, try the other outcomes:

```sh
node examples/try-payment.mjs fonepay pending
node examples/try-payment.mjs bankcard paid
```

**From an installed package**, run `npx --no-install nepal-payments-demo`. You can pass the same gateway and outcome arguments. The demo needs Node 18+, no credentials and no account.

| Checkout | Buyer experience | Sandbox setup |
|---|---|---|
| NEPALPAY Dynamic QR | Scan an invoice QR in a banking app | [NCHL credentials, signing key and report access](docs/nepalpay.md) |
| Fonepay Dynamic QR | Scan a QR linked to a unique merchant PRN | [Fonepay credentials and payment listener](docs/fonepay.md) |
| Bank-hosted cards | Enter card details on the processor's hosted page | [NIC ASIA / Cybersource Secure Acceptance profile](docs/bankcard.md) |

All three implement server-side verification and have offline protocol tests. Merchant UAT is pending.

## How it works

The same three steps for every gateway:

1. **Start.** `initiate()` on your server. Store `start.ref` with the order. Then send the buyer on: a redirect (Khalti) or a form that posts itself (eSewa, ConnectIPS, Hamro Pay, bank-hosted card), or an invoice QR (NEPALPAY, Fonepay).
2. **Find the attempt.** Use the return URL, provider notification, or a scheduled QR lookup to locate the saved attempt. Follow the gateway guide for the evidence required by verification.
3. **Verify.** `verify({ ref, expectedAmount, expectedOrderId })` on your server, with values from your own database. Ship only when `result.paid` is `true`.

Amounts are whole paisa everywhere. `rupees(100)` is `10000` paisa. `paisa(10000)` is the same amount.

## Quick start

### Khalti

```ts
import { createPayments, rupees } from 'nepal-payments';

const payments = createPayments({
  mode: 'sandbox', // 'live' for real money; for local runs with no keys, see Mock mode below
  khalti: { secretKey: process.env.KHALTI_SECRET_KEY! }
});

// 1. Start. Keep start.ref (the pidx) with the order.
const start = await payments.khalti.initiate({
  amount: rupees(100),
  orderId: 'order-42',
  orderName: 'Two cups of tea',
  returnUrl: 'https://shop.example/pay/khalti/return',
  websiteUrl: 'https://shop.example'
});
await saveOrderRef('order-42', start.ref); // your database
// redirect the buyer to start.url

// 2. On the return URL. The pidx in the URL only finds the order.
const cb = await payments.khalti.parseCallback(returnUrl);
const order = await findOrderByRef(cb.ref); // your database

// 3. Verify the pidx you stored, not the one in the URL.
const result = await payments.khalti.verify({ ref: order.ref, expectedAmount: order.amount, expectedOrderId: order.id });
if (result.paid) {
  // ship the order
}
```

Refunds: `payments.khalti.refund({ transactionId, amount? })`. Leave out `amount` for a full refund. Full guide: [docs/khalti.md](https://github.com/nischaljs/nepal-payments/blob/v3.0.0/docs/khalti.md).

### eSewa

```ts
const payments = createPayments({
  mode: 'sandbox',
  esewa: { productCode: process.env.ESEWA_PRODUCT_CODE!, secretKey: process.env.ESEWA_SECRET_KEY! }
});

// 1. Start. eSewa takes a signed form.
const start = await payments.esewa.initiate({
  amount: rupees(100),
  orderId: 'order-42', // letters, digits and hyphens
  successUrl: 'https://shop.example/pay/esewa/success',
  failureUrl: 'https://shop.example/pay/esewa/failure'
});
// render <form method="POST" action={start.action}> with one hidden input per start.fields, and submit it

// 2. On the success URL. The signature is checked here; a forged one throws INVALID_SIGNATURE.
const cb = await payments.esewa.parseCallback(successUrl);
const order = await findOrder(cb.ref);

// 3. Verify, and pass the signed callback too.
const result = await payments.esewa.verify({ ref: cb.ref, expectedAmount: order.amount, expectedOrderId: order.id, callback: cb });
if (result.paid) {
  // ship the order
}
```

Pass `callback: cb`. The eSewa status API only repeats the amount you ask with, so the signed callback's amount is the real check. eSewa has no refund API. Full guide: [docs/esewa.md](https://github.com/nischaljs/nepal-payments/blob/v3.0.0/docs/esewa.md).

### ConnectIPS

Enroll through your bank. NCHL supplies the merchant credentials and signing key and registers your two return URLs. [Merchant enrollment](https://doc.connectips.com/docs_npiqrgt/connectIPS-Gateway/cips-core-module)

```ts
import fs from 'node:fs';
import { createPayments, rupees } from 'nepal-payments';

const payments = createPayments({
  mode: 'sandbox',
  connectips: {
    merchantId: process.env.CIPS_MERCHANT_ID!,
    appId: process.env.CIPS_APP_ID!,
    appName: process.env.CIPS_APP_NAME!,
    password: process.env.CIPS_PASSWORD!,
    pfx: fs.readFileSync(process.env.CIPS_PFX_PATH!), // or privateKeyPem
    pfxPassword: process.env.CIPS_PFX_PASSWORD!
  }
});

// A new orderId for every attempt, also when the buyer tries the same order again.
const start = await payments.connectips.initiate({ amount: rupees(500), orderId: 'order-42-a1' });
// post start.fields to start.action

const cb = await payments.connectips.parseCallback(returnUrl);
const attempt = await findAttemptByRef(cb.ref); // your database
const result = await payments.connectips.verify({ ref: attempt.ref, expectedAmount: attempt.amount, expectedOrderId: attempt.id });
```

The form is signed with your RSA key from the `.pfx` NCHL gives you. NCHL documents a matching amount in its success response. Wrong-amount behavior still needs merchant sandbox confirmation. Full guide: [docs/connectips.md](https://github.com/nischaljs/nepal-payments/blob/v3.0.0/docs/connectips.md).

### Hamro Pay

Create a test merchant and copy your credentials from the [Hamro Pay UAT portal](https://pay-sandbox.hamropatro.com/signup).

```ts
import { createPayments, rupees } from 'nepal-payments';

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

const start = await payments.hamropay.initiate({
  amount: rupees(100),
  orderId: 'order-42', // at most 25 characters
  successUrl: 'https://shop.example/pay/hamropay/success',
  failureUrl: 'https://shop.example/pay/hamropay/failure'
});
// post start.fields to start.action within 10 minutes (start.expiresAt)

// The webhook is signed. Pass the raw body text and the signature header.
const hook = await payments.hamropay.parseCallback({ body: rawBody, signature: signatureHeader });
const result = await payments.hamropay.verify({ ref: hook.ref, expectedAmount: order.amount, expectedOrderId: order.id, callback: hook });
```

Hamro Pay does not publish its live hosts, so `mode: 'live'` needs `endpoints: { api, gateway }` from Hamro Pay. Full guide: [docs/hamropay.md](https://github.com/nischaljs/nepal-payments/blob/v3.0.0/docs/hamropay.md).

### One gateway only

Each gateway has its own entry, if you want only one:

```ts
import { createKhalti, rupees } from 'nepal-payments/khalti';

const khalti = createKhalti({ mode: 'sandbox', secretKey: process.env.KHALTI_SECRET_KEY! });
```

Also `nepal-payments/esewa` (`createEsewa`), `/connectips` (`createConnectIps`) and `/hamropay` (`createHamroPay`).

## Safe by default

The library does the checks that are easy to forget.

- **Amounts are checked.** `verify` compares the gateway's amount with `expectedAmount` and throws `AMOUNT_MISMATCH` when they differ. It compares the order id too, where the gateway reports one, and throws `ORDER_MISMATCH`. A "paid" answer with no amount throws `INVALID_RESPONSE`, so it never passes as paid.
- **Khalti: verify the pidx you stored.** Khalti's lookup has no order id, so the only link between a payment and your order is the pidx you saved at `initiate`. Never verify the pidx from the return URL: a buyer can put a cheaper payment's pidx there. `result.checked.orderId` is `false` for Khalti in sandbox and live, so you can see this.
- **eSewa: the callback is signed, and checked.** `parseCallback` checks eSewa's HMAC signature and throws `INVALID_SIGNATURE` on a bad one. Pass the result to `verify` as `callback`, and its signed amount and order id are compared too. Only the exact object `parseCallback` returned counts: a stored or copied one that says `signed: true` throws `INVALID_INPUT`. The Hamro Pay webhook works the same way.
- **Errors never carry secrets.** Every error is a `PaymentError` with `code`, `message`, `gateway`, `field` and `response: { status, data }`. It never holds the request, the headers or your config, so you can log it and send it to an error tracker. Secrets are also removed from every result's `raw`.
- **No retries.** Each call to a gateway is sent once. A refund or a payment start is never sent twice by the library. If you retry, you decide when it is safe.
- **Timeouts.** Every call gives up after 15 seconds and throws `TIMEOUT` (30 seconds in `nepal-payments/compat`, as in 2.x). Change it with `timeoutMs`, for all gateways or per gateway.
- **Every status is a value.** `paid` ships. `pending` and `ambiguous` mean check again later. `failed`, `canceled`, `expired` and `refunded` do not ship. Everything else throws a `PaymentError`: bad input or config, a bad signature, a mismatch, a rejected key, a gateway error, an answer that makes no sense, a call the gateway does not support, or network trouble.
- **Check errors with `isPaymentError(e)`**, not `instanceof`. It works even when two copies of the package are loaded. Then read `e.code`.

```ts
import { isPaymentError } from 'nepal-payments';

try {
  const result = await payments.khalti.verify({ ref: order.ref, expectedAmount: order.amount, expectedOrderId: order.id });
  if (result.paid) await shipOrder(order);
} catch (e) {
  if (isPaymentError(e) && (e.code === 'AMOUNT_MISMATCH' || e.code === 'ORDER_MISMATCH')) {
    await flagOrder(order); // fraud or a bug, not something to retry
  }
  throw e;
}
```

## Gateways

| Gateway | Starts with | Callback | Refund | Status |
| --- | --- | --- | --- | --- |
| Khalti | redirect | not signed (find the order, verify the stored pidx) | yes | ready |
| eSewa | signed form | signed (HMAC-SHA256) | no | ready |
| ConnectIPS | form signed with your RSA key | not signed | no | docs reviewed, offline tested |
| Hamro Pay | session, then signed form | webhook signed (HMAC-SHA512) | no | docs reviewed, offline tested |
| NEPALPAY | dynamic QR | server transaction report | no | offline tested |
| Fonepay | dynamic QR | server WebSocket event and status lookup | no | offline tested |
| Bank-hosted card | signed hosted form | signed sale notification | no | offline tested |


## Mock mode and tests

![A terminal in mock mode: npm install nepal-payments, a short script that starts a Khalti payment and verifies it, then the run. The first verify says paid = true. The second verify, with a different expected amount, stops with AMOUNT_MISMATCH.](https://raw.githubusercontent.com/nischaljs/nepal-payments/v3.0.0/docs/media/demo.gif)

**Mock mode** needs no keys and makes no network call. Use it for local runs and demos.

```ts
const payments = createPayments({
  mode: 'mock',
  khalti: {},
  esewa: {}
});

const start = await payments.khalti.initiate({ /* ... */ mockOutcome: 'failed' }); // 'paid' (default), 'pending' or 'failed'
const result = await payments.khalti.verify({ ref: start.ref, expectedAmount, expectedOrderId }); // follows mockOutcome
```

- Mock mode is refused when `NODE_ENV` is `production` (`INVALID_CONFIG`). Next.js sets that under `next build`, `next start` and Vercel previews, so use `'sandbox'` there.
- A mock ref is signed with a key made for each process. A typed ref fails, and a ref works only in the process that made it.

**In tests**, use `nepal-payments/testing`. Its fakes answer like the gateway, and `fakeFetch` fails any other request, so a test can never reach a real host.

```ts
import { createPayments, rupees } from 'nepal-payments';
import { fakeFetch, fakeKhalti } from 'nepal-payments/testing';

const khalti = fakeKhalti();
const payments = createPayments({ mode: 'sandbox', fetch: fakeFetch(khalti.handler), khalti: { secretKey: 'test' } });

const start = await payments.khalti.initiate({
  amount: rupees(100), orderId: 'order-42', orderName: 'Tea',
  returnUrl: 'https://shop.example/return', websiteUrl: 'https://shop.example'
});
khalti.set(start.ref, { amount: rupees(10) }); // the gateway now reports Rs 10
// verify({ ref: start.ref, expectedAmount: rupees(100), ... }) throws AMOUNT_MISMATCH
```

Also `fakeEsewa`, `fakeConnectIps`, `fakeHamroPay`, and `esewaCallback()` and `hamroPayWebhook()` to make signed callbacks. The handlers also work with MSW.

## Migrating from `neppayments` 2.x

The package has a new name: `nepal-payments`. To upgrade without changing your code, import the old class from `nepal-payments/compat`. It keeps the 2.0.8 API and outputs, including the 2.x status names.

```ts
// before
import { NepPayments } from 'neppayments';
// after
import { NepPayments } from 'nepal-payments/compat';
```

Then move each call to `createPayments` when you can. It checks the order id too, and keeps eSewa's AMBIGUOUS and Khalti's Refunded as their own statuses.

| 2.x | 3.x |
| --- | --- |
| `new NepPayments({ khalti: { secretKey, environment: 'sandbox' } })` | `createPayments({ mode: 'sandbox', khalti: { secretKey } })` |
| `khalti.createPayment(...)`, `esewa.createPayment(...)` | `payments.khalti.initiate(...)`, `payments.esewa.initiate(...)` |
| `verifyPayment({ ..., expectedAmount })` | `verify({ ref, expectedAmount, expectedOrderId })` |
| Khalti in paisa, eSewa in rupees | paisa everywhere: `rupees(100)` |
| `COMPLETED`, `FAILED`, ... | `paid`, `failed`, `ambiguous`, `refunded`, ... |
| Axios | built-in `fetch`, no dependencies |

## For coding agents

This package is written so an AI coding agent gets payments right the first time. Three files ship inside it:

- [`AGENTS.md`](https://github.com/nischaljs/nepal-payments/blob/v3.0.0/AGENTS.md): six rules for payment code. Verify on the server, amounts in paisa, secrets stay on the server, handle every status, verify the stored Khalti pidx, test without keys.
- [`llms.txt`](https://github.com/nischaljs/nepal-payments/blob/v3.0.0/llms.txt): the API on one page, with links to every guide.
- [`skills/nepal-payments/SKILL.md`](https://github.com/nischaljs/nepal-payments/blob/v3.0.0/skills/nepal-payments/SKILL.md): an agent skill for adding or reviewing payments.

After `npm install`, point your agent at them. For example, add this line to your project's `AGENTS.md` or `CLAUDE.md`:

```md
Before writing payment code, read node_modules/nepal-payments/AGENTS.md.
```

To use the skill with Claude Code, copy it into your project:

```bash
mkdir -p .claude/skills && cp -r node_modules/nepal-payments/skills/nepal-payments .claude/skills/
```

The error messages are written for agents too. Each one names the field and says what to do, such as `verify needs expectedAmount in paisa, from your database. Never take it from the callback.`

## Framework guides

- [Express](https://github.com/nischaljs/nepal-payments/blob/v3.0.0/docs/express.md): one file, Khalti and eSewa.
- [Next.js App Router](https://github.com/nischaljs/nepal-payments/blob/v3.0.0/docs/nextjs.md): Route Handlers on the Node.js runtime.
- [NestJS](https://github.com/nischaljs/nepal-payments/blob/v3.0.0/docs/nestjs.md): a provider and a controller.

## How it is built

![How nepal-payments is built: your server code imports createPayments, a single gateway entry, compat or testing. The gateway plugs (Khalti, eSewa, ConnectIPS and Hamro Pay) are opt-in and sit in one socket, the core. The socket handles fetch with a timeout and no retries, secret removal, signing, the verify checks and mock mode, and talks to the gateway hosts, or to the fakes in tests.](https://raw.githubusercontent.com/nischaljs/nepal-payments/v3.0.0/docs/media/architecture.svg)

- **The socket** (`src/core`) does everything that is the same for every gateway: HTTP with a timeout, removing secrets, signing, the money type, config checks, errors, mock mode and the checks in `verify`.
- **A plug** (`src/gateways/<name>`) only knows its gateway: its config, its hosts and its request and answer shapes. It cannot skip the socket's checks.
- **The entries** are `nepal-payments`, one subpath per gateway, `nepal-payments/testing` and `nepal-payments/compat`.

`npm run depcheck` fails any import that breaks these rules. The rules, and how to add a gateway in five steps: [ARCHITECTURE.md](https://github.com/nischaljs/nepal-payments/blob/v3.0.0/ARCHITECTURE.md).

## Contributing

Issues and pull requests are welcome, especially from anyone who has run ConnectIPS or Hamro Pay against their sandbox.

```bash
npm install
npm run check   # types, import rules, tests and a packed install
```

- Tests run on fake gateways only. A test must never call a sandbox or live host.
- Keep a gateway's code in its own plug. Shared work belongs in the socket.
- Add a line to [CHANGELOG.md](https://github.com/nischaljs/nepal-payments/blob/v3.0.0/CHANGELOG.md) for anything a user would notice.

The pictures can be made again. `scripts/demo/record.sh` records the terminal GIF in mock mode, from the packed package (needs `rsvg-convert`, `ffmpeg` and the JetBrains Mono NL font). `docs/media/architecture.svg` is hand-written SVG.

## License

[MIT](https://github.com/nischaljs/nepal-payments/blob/v3.0.0/LICENSE)
