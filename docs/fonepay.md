# Fonepay Dynamic QR

Try `nepal-payments-demo fonepay pending` locally. For a merchant sandbox, request the **Dynamic QR API**, merchant code, portal username/password and HMAC secret from your acquiring bank or Fonepay. Confirm the endpoints and specification version with your enrollment contact. The adapter implements the published copy of the July 2024 v1.1 protocol. [Fonepay merchant onboarding](https://fonepay.com/business) · [Fonepay specification, public copy](https://github.com/DexA1948/fonepay-dynamic-qr-demo/blob/master/API_Details.md)

```ts
import { createFonepay, rupees } from 'nepal-payments/fonepay';

const qr = createFonepay({
  mode: 'sandbox', merchantCode: process.env.FONEPAY_CODE!,
  username: process.env.FONEPAY_USER!, password: process.env.FONEPAY_PASSWORD!,
  secretKey: process.env.FONEPAY_SECRET!
});
const attempt = { id: 'tea-a1', amount: rupees(100) };
const start = await qr.initiate({ orderId: attempt.id, amount: attempt.amount });
await saveAttempt({ ...attempt, ref: start.ref }); // your database
```

Use a unique PRN (the attempt ID) for each checkout. Start listening on your server as soon as the QR is created. Return the QR payload to the buyer immediately, while the server continues listening. Use a long-lived Node 22+ process for the listener. On older Node versions supply a compatible WebSocket constructor as `webSocket`.

```ts
// In a server worker that receives the original start result:
const { callback, receipt } = await qr.watchPayment(start);
await saveReceipt(start.ref, receipt); // persist before verification
const row = await findAttempt(start.ref);
const result = await qr.verify({ ref: row.ref, expectedOrderId: row.id, expectedAmount: row.amount, callback });
if (result.paid) await grantOrderOnce(row.orderId);
```

Keep the socket URL and receipt server-side. Use `start.payload` from a `kind === 'qr'` result for the QR renderer. Your UI polls your own order state. A socket timeout leaves the attempt open for reconciliation. The default wait is two minutes and the optional second argument to `watchPayment` sets it in milliseconds.

After a restart, load the saved receipt and call `qr.parseCallback({ receipt })`, then pass the returned callback to `verify`. The SDK pairs the server-received amount and trace ID with a fresh merchant status lookup. A successful lookup without amount evidence remains ambiguous. If the notification was missed and the lookup omits the amount, reconcile against the merchant report.
