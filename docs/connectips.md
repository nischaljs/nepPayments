# ConnectIPS

NCHL connectIPS e-payment. Your page posts a form signed with your RSA key (from the `.pfx` NCHL gives you) to connectIPS. connectIPS sends the buyer back to the success or failure URL registered with NCHL. You confirm with `validatetxn`.

> **Note.** The amount check is an echo (see below).

## Config

```ts
import fs from 'node:fs';

const payments = createPayments({
  mode: 'sandbox',
  connectips: {
    merchantId: Number(process.env.CIPS_MERCHANT_ID),
    appId: process.env.CIPS_APP_ID!,
    appName: process.env.CIPS_APP_NAME!,
    password: process.env.CIPS_PASSWORD!,   // the API password for appId, for validatetxn
    pfx: fs.readFileSync(process.env.CIPS_PFX_PATH!),
    pfxPassword: process.env.CIPS_PFX_PASSWORD!
  }
});
```

| Field | Required | Notes |
|---|---|---|
| `merchantId`, `appId`, `appName` | yes (not in mock) | From NCHL. |
| `password` | yes (not in mock) | The API password. Sent as HTTP Basic `appId:password` to validatetxn. |
| `pfx` + `pfxPassword` | one of the two | The `CREDITOR.pfx` file as a Buffer. AES and 3DES files work. A wrong password throws `INVALID_CONFIG` when the client is made. |
| `privateKeyPem` | one of the two | A PEM private key, instead of the pfx. |
| `endpoints` | no | `{ base }` with the host NCHL gave you. |

Hosts: sandbox `https://uat.connectips.com`, live `https://login.connectips.com`. Ask NCHL to confirm both for your account and pass `endpoints.base` if they differ.

## Start a payment

```ts
const start = await payments.connectips.initiate({ amount: rupees(500), orderId: 'order-42' });
// start.kind === 'form': post start.fields to start.action ({base}/connectipswebgw/loginpage)
```

Use a new `orderId` for every payment attempt, including a retry of the same order (for example `order-42-a2`): `TXNID` must be unique at connectIPS, and `validatetxn` looks the payment up by it. Keep the attempt id with your order and verify that one.

`TXNID` and `REFERENCEID` are the `orderId`. `REMARKS` and `PARTICULARS` default to it. `TXNDATE` is today in Nepal time (DD-MM-YYYY); pass `date` to set it. `TXNAMT` is in paisa. `TOKEN` is RSA-SHA256 in base64 over `MERCHANTID=…,APPID=…,APPNAME=…,TXNID=…,TXNDATE=…,TXNCRNCY=NPR,TXNAMT=…,REFERENCEID=…,REMARKS=…,PARTICULARS=…,TOKEN=TOKEN`.

## Callback and verify

```ts
const cb = await payments.connectips.parseCallback(req.url); // reads TXNID; signed: false
const result = await payments.connectips.verify({ ref: cb.ref, expectedAmount: order.amount, expectedOrderId: order.id });
```

`verify` posts `{ merchantId, appId, referenceId, txnAmt, token }` to `{base}/connectipswebws/api/creditor/validatetxn`, where `token` signs `MERCHANTID=…,APPID=…,REFERENCEID=…,TXNAMT=…`.

**The amount check is an echo.** validatetxn is asked with `txnAmt` (your expected amount) and answers with the `txnAmt` it was asked about. So `result.checked.amount` only says the echo matched, not that connectIPS charged that amount. It is not known yet whether connectIPS answers SUCCESS when `txnAmt` differs from the amount paid. Until there are sandbox tests that settle this, treat the amount check for connectIPS as an echo, and compare the amount in your connectIPS merchant report when it matters.

## Statuses

| connectIPS | nepal-payments |
|---|---|
| SUCCESS | `paid` |
| FAILED | `failed` |
| ERROR with a "not found" description | `failed` |
| anything else | `ambiguous` |

There is no refund API in this package for connectIPS.

## Testing

In tests use `fakeConnectIps()` from `nepal-payments/testing` and a key you made yourself. Never commit NCHL's pfx.
