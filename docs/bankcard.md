# Bank-hosted card checkout

This adapter supports **Cybersource Secure Acceptance Hosted Checkout** profiles for NPR sales. NIC ASIA offers a Cybersource internet payment gateway. Have the bank confirm the integration type enabled for your merchant. [NIC ASIA gateway](https://helpdesk.nicasiabank.com/support/solutions/articles/35000164571-cybersource-internet-payment-gateway-ipg-) · [Cybersource hosted checkout guide](https://developer.cybersource.com/docs/cybs/en-us/sa/developer/all/sa-hosted/secure-acceptance.html)

Try a local result with `nepal-payments-demo bankcard paid`. For the sandbox, activate the test profile, configure its hosted billing fields, customer return page and HTTPS merchant POST notification URL. Obtain the profile ID, access key and secret signing key. Have the customer enter their card details on the hosted page. [Notification setup](https://developer.cybersource.com/docs/cybs/en-us/sa/developer/all/sa-hosted/secure-acceptance/sa-notification-types.html)

```ts
import { createBankCard, rupees } from 'nepal-payments/bankcard';

const cards = createBankCard({
  mode: 'sandbox', profileId: process.env.CARD_PROFILE_ID!,
  accessKey: process.env.CARD_ACCESS_KEY!, secretKey: process.env.CARD_SECRET_KEY!
});
const attempt = { id: 'tea-a1', amount: rupees(100) };
const start = await cards.initiate({ orderId: attempt.id, amount: attempt.amount });
await saveAttempt({ ...attempt, ref: start.ref });
// Render start.fields as hidden inputs and POST to start.action when start.kind === 'form'.
```

In your merchant notification endpoint, pass the URL-encoded request body to `parseCallback`. A successful sale requires a valid processor signature covering the decision, reason code, profile, currency, sale type, amount and transaction identifiers. The SDK compares the full authorized amount with the requested amount, then verifies the stored reference, order and expected amount.

```ts
const callback = await cards.parseCallback(rawFormBody);
const row = await findAttempt(callback.ref);
if (!row) throw new Error('Unknown payment attempt');
const result = await cards.verify({ ref: row.ref, expectedOrderId: row.id, expectedAmount: row.amount, callback });
if (result.paid) await grantOrderOnce(row.orderId);
```

Return success to the processor after committing your database update. Handle repeated notifications idempotently. Persist the original signed fields in protected server storage if you need to reparse them later. The customer's return page reads the stored order state. Confirmation uses the signed sale notification. Polling and refunds are outside this adapter.
