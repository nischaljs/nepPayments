# NepPayments: Unified Khalti & eSewa Payment Integration

A simple Node.js package to integrate both **Khalti** and **eSewa** payment gateways with a unified, developer-friendly API. This package is designed for backend use, where your server generates the payment form or URL and serves it to the client.

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
    secretKey: 'YOUR_KHALTI_Live secret key_SECRET_KEY', // Obtain from [Khalti Dashboard](https://test-admin.khalti.com/#/settings/keys)
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
// Khalti
const verification = await payments.khalti.verifyPayment({ pidx: 'YOUR_KHALTI_PIDX' });
console.log(verification);

// eSewa
const verification = await payments.esewa.verifyPayment({
  product_code: 'EPAYTEST',
  transaction_uuid: 'YOUR_TRANSACTION_UUID',
  total_amount: 10,
});
console.log(verification);
```

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

There is no further step required to complete the payment; however, the merchant can process their own validation and confirmation steps if required. It is recommended that during implementation, the payment lookup API is checked for confirmation after the redirect callback is received.

## Developer Experience
- The API for both Khalti and eSewa is designed to be as similar as possible.
- For eSewa, your backend serves the HTML form to the client, which auto-submits and redirects to the eSewa payment page.
- Payment verification is identical for both gateways.

## Error Handling
- All methods throw errors with clear messages if something goes wrong (e.g., invalid credentials, network issues, payment not found).

## Contributing
Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License
MIT
