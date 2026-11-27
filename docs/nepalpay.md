# NEPALPAY Dynamic QR

Try a local NPR 100 payment with `nepal-payments-demo nepalpay paid` from an installation that includes this adapter. The mock QR is for local development. A banking app can scan the QR issued in sandbox or live mode.

## Connect your merchant

Ask your acquiring bank or NCHL for dynamic merchant QR generation **and individual transaction reporting**. Obtain the two full HTTPS endpoint URLs, NPI user, password, signing certificate and merchant registration details. The signing key stays on your server. [Enrollment](https://nchl.com.np/nepalpay-qr/) · [QR request fields](https://doc.connectips.com/docs_nepalpay_qr/NepalPAY-QR/Merchant-QR-generation/introduction)

```ts
import { readFileSync } from 'node:fs';
import { createNepalPay, rupees } from 'nepal-payments/nepalpay';

const qr = createNepalPay({
  mode: 'sandbox',
  generateUrl: process.env.NQR_GENERATE_URL!, reportUrl: process.env.NQR_REPORT_URL!,
  userId: process.env.NQR_USER!, password: process.env.NQR_PASSWORD!,
  acquirerId: process.env.NQR_ACQUIRER!, merchantId: process.env.NQR_MERCHANT!,
  merchantCategoryCode: Number(process.env.NQR_CATEGORY), merchantName: process.env.NQR_NAME!,
  city: process.env.NQR_CITY!, postalCode: process.env.NQR_POSTAL_CODE!, storeLabel: process.env.NQR_STORE!,
  pfx: readFileSync(process.env.NQR_PFX_PATH!), pfxPassword: process.env.NQR_PFX_PASSWORD!
});

const attempt = { id: 'tea-a1', amount: rupees(100) };
const start = await qr.initiate({ orderId: attempt.id, amount: attempt.amount });
await saveAttempt({ ...attempt, ref: start.ref }); // your database
if (start.kind === 'qr') {
  // Send start.payload to the UI. Encode this exact text with your QR renderer.
}
```

The SDK uses HTTP Basic for generation and, by default, reporting. If your enrollment uses separate report authentication, supply `reportAuthorization: async () => ...` returning the full Authorization header from your server credential provider.

## Verify the invoice

Use a unique bill number of up to 25 characters per attempt. Poll your own server for the order state. Your server looks up the stored attempt and calls:

```ts
const result = await qr.verify({ ref: attemptRow.ref, expectedOrderId: attemptRow.id, expectedAmount: attemptRow.amount });
if (result.paid) await grantOrderOnce(attemptRow.orderId);
```

An empty successful report is pending. Verification checks the bill number and rupee amount in the report. A failed attempt followed by one final payment can succeed. Multiple final payments or mixed payment and refund records require reconciliation. Finality follows NCHL's debit and credit status rules. [Individual transaction report](https://doc.connectips.com/docs/NepalPAY-QR/Transaction-Report/transaction_report)
