# neppayments: Khalti and eSewa payment integration for Node.js

[![npm version](https://img.shields.io/npm/v/neppayments)](https://www.npmjs.com/package/neppayments)
[![npm downloads](https://img.shields.io/npm/dm/neppayments)](https://www.npmjs.com/package/neppayments)
[![license: MIT](https://img.shields.io/npm/l/neppayments)](LICENSE)
[![types: TypeScript](https://img.shields.io/badge/types-TypeScript-informational)](https://www.npmjs.com/package/neppayments)

Accept payments in Nepal with **Khalti** and **eSewa** from one Node.js or TypeScript API. Create a payment, send the customer to the gateway, then verify it on your server. Works with Express, Next.js, NestJS and any Node.js backend.

- **One API for both gateways:** `createPayment` and `verifyPayment` work the same way for Khalti and eSewa.
- **Amount check:** pass `expectedAmount` and a payment for the wrong amount throws `AMOUNT_MISMATCH`.
- **Safe to log:** errors never carry request headers or your secret key.
- **Sandbox and production:** switch with one `environment` setting. Test credentials are below.

> **Upgrade to 2.0.7 now** (`npm install neppayments@latest`). In 2.0.6 and earlier, a failed Khalti call threw the raw HTTP error, which held your Khalti secret key in its headers. If your app logged errors, check your logs and roll your Khalti key. 2.0.7 is a drop-in update, no code change needed. See the [changelog](CHANGELOG.md).

## Installation

```bash
npm install neppayments
```

## Usage

### 1. Initialize the Payment Gateway

```ts
import { NepPayments } from 'neppayments';

const payments = new NepPayments({
  khalti: {
    secretKey: process.env.KHALTI_SECRET_KEY, // Obtain from [Khalti Dashboard](https://test-admin.khalti.com/#/settings/keys)
    environment: 'sandbox', // or 'production'
  },
  esewa: {
    productCode: 'EPAYTEST',
    secretKey: '8gBm/:&EnhH.1/q', // Provided in the documentation for sandbox environment
    environment: 'sandbox', // or 'production'
    successUrl: 'https://yourdomain.com/payment-success',
    failureUrl: 'https://yourdomain.com/payment-failure',
  },
});
```

### 2. Create a Payment

#### **Khalti**

```ts
const khaltiPayment = await payments.khalti.createPayment({
  amount: 1000, // in paisa (Rs. 10)
  purchase_order_id: 'ORDER_123',
  purchase_order_name: 'Test Product',
  return_url: 'https://yourdomain.com/payment-success',
  website_url: 'https://yourdomain.com',
  customer_info: {
    name: 'Test User',
    email: 'test@example.com',
    phone: '9800000000',
  },
});

// Return the payment URL to the client
console.log(khaltiPayment.payment_url); // e.g., https://test-pay.khalti.com/?pidx=...
```

#### **eSewa**

```ts
const esewaPayment = await payments.esewa.createPayment({
  amount: 10, // in rupees
  tax_amount: 0,
  total_amount: 10,
  transaction_uuid: 'ORDER_' + Date.now(),
  product_code: 'EPAYTEST',
  product_service_charge: 0,
  product_delivery_charge: 0,
  success_url: 'https://yourdomain.com/payment-success',
  failure_url: 'https://yourdomain.com/payment-failure',
  signed_field_names: 'total_amount,transaction_uuid,product_code',
});

// The package returns the HTML content for the eSewa payment form.
// Your backend should serve this HTML to the client.
console.log(esewaPayment.form_html); // Serve this HTML to the client
```

### 3. Serve the Payment Form to the Client

- **Khalti:** Redirect the client to the `payment_url` returned by the package.
- **eSewa:** Serve the HTML content (`esewaPayment.form_html`) to the client. The HTML includes an auto-submitting form that redirects to the eSewa payment page.

#### eSewa Test Credentials
- **eSewa ID:** 9806800001 (or 9806800002, 9806800003, 9806800004, 9806800005)
- **Password:** Nepal@123
- **Token:** 123456

### 4. Verify the Payment (Same for Both)

```ts
// Khalti: pass the amount you charged (paisa). A different amount throws AMOUNT_MISMATCH.
const verification = await payments.khalti.verifyPayment({
  pidx: 'YOUR_KHALTI_PIDX',
  expectedAmount: 1000,
});
console.log(verification.status, verification.raw_status);

// eSewa: expectedAmount is in rupees.
const verification = await payments.esewa.verifyPayment({
  product_code: 'EPAYTEST',
  transaction_uuid: 'YOUR_TRANSACTION_UUID',
  total_amount: 10,
  expectedAmount: 10,
});
console.log(verification);
```

Always verify on your server and pass `expectedAmount`. Only `status === 'COMPLETED'` means paid.

### 5. Handling Payment Success [KHALTI]

After the user completes the payment, the success response is obtained in the return URL specified during payment initiation. The callback URL should support the GET method, and the user will be redirected to the return URL with the following parameters for confirmation:

- **pidx**: The initial payment identifier.
- **status**: Status of the transaction.
  - **Completed**: Transaction is successful.
  - **Pending**: Transaction is in a pending state; request the lookup API.
  - **User canceled**: Transaction has been canceled by the user.
- **transaction_id**: The transaction identifier at Khalti.
- **tidx**: Same value as the transaction ID.
- **amount**: Amount paid in paisa.
- **mobile**: Payer KHALTI ID.
- **purchase_order_id**: The initial purchase_order_id provided during payment initiation.
- **purchase_order_name**: The initial purchase_order_name provided during payment initiation.
- **total_amount**: Same value as the amount.

**Do not trust these parameters.** Anyone can type them into the URL. Always call `verifyPayment` on your server before you mark an order paid.

**Save the `pidx` when you create the payment, and verify that saved `pidx`, never the one from the return URL.** Khalti's lookup does not return your order id, so this is how you know the payment belongs to this order.

## Developer Experience
- The API for both Khalti and eSewa is designed to be as similar as possible.
- For eSewa, your backend serves the HTML form to the client, which auto-submits and redirects to the eSewa payment page.
- Payment verification is identical for both gateways.

## Error Handling
- Every method throws a `PaymentError` with `message`, `code` and, when the gateway answered, `response: { status, data }`.
- Errors never carry request headers or your secret key, so they are safe to log.
- Khalti's `Expired` and `User canceled` lookups are returned as statuses, not thrown.

## Contributing
Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License
MIT
