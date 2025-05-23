# NepPayments

A Node.js package for easy integration of Nepali payment gateways (Khalti, eSewa, and Fonepay) into your application.

## Features

- ✅ Support for Khalti, eSewa, and Fonepay
- 🔒 Sandbox/Test mode support
- 🚀 TypeScript support with full type definitions
- 🛡️ Comprehensive error handling
- 📝 Easy-to-use API
- ⚡ Promise-based async operations
- 🔄 Payment verification support

## Installation

```bash
npm install neppayments
```

After installation, the setup script will run automatically to help you configure your payment gateways.

## Configuration

You can run the configuration script manually anytime:

```bash
npm run configure
```

This will:
1. Ask whether you want to use sandbox or production mode
2. Let you select which payment gateways to enable
3. Help you configure the credentials for each gateway
4. Create a `.env` file with your settings

## Sandbox Testing

For testing purposes, you can use these sandbox credentials:

### Khalti Test Credentials
```
Secret Key: test_secret_key_dc74e0fd57cb46cd93832aee0a507256
Public Key: test_public_key_dc74e0fd57cb46cd93832aee0a390775
```

### eSewa Test Credentials
```
Merchant Code: EPAYTEST
Merchant Secret: 8gBm/:&EnhH.1/q
```

### Fonepay Test Credentials
```
Merchant ID: TEST_MERCHANT
Secret Key: test_secret_key
```

## Usage Examples

### Khalti Payment

```typescript
import { initiateKhaltiPayment, verifyKhaltiPayment } from 'neppayments';

// Initiate payment
const payment = await initiateKhaltiPayment({
  amount: 1000,            // Amount in NPR
  customerName: 'John Doe',
  productIdentity: 'prod_123',
  productName: 'Test Product',
  returnUrl: 'https://your-site.com/verify',
  websiteUrl: 'https://your-site.com'
});

// Verify payment
const verification = await verifyKhaltiPayment({
  pidx: 'payment_id_from_khalti'
});
```

### eSewa Payment

```typescript
import { initiateEsewaPayment, verifyEsewaPayment } from 'neppayments';

// Initiate payment
const esewaForm = initiateEsewaPayment({
  amount: 1000,
  taxAmount: 0,
  productCode: 'EPAYTEST',
  successUrl: 'https://your-site.com/success',
  failureUrl: 'https://your-site.com/failure'
});

// Render the form in your frontend
// The form will automatically submit to eSewa

// Verify payment
const verification = await verifyEsewaPayment({
  oid: 'order_id',
  amt: '1000',
  refId: 'ref_id_from_esewa'
});
```

### Fonepay Payment

```typescript
import { initiateFonepayPayment, verifyFonepayPayment } from 'neppayments';

// Initiate payment
const paymentUrl = await initiateFonepayPayment({
  customerName: 'John Doe',
  amount: 1000,
  transactionId: 'trans_123',
  returnUrl: 'https://your-site.com/verify'
});

// Verify payment
const verification = await verifyFonepayPayment({
  PRN: 'prn_from_fonepay',
  PID: 'your_merchant_id',
  BID: 'bank_id',
  AMT: '1000',
  UID: 'unique_id',
  DV: 'NPR'
});
```

## Error Handling

The package uses a standard error class `PaymentError` for all errors:

```typescript
try {
  await initiateKhaltiPayment(options);
} catch (error) {
  if (error instanceof PaymentError) {
    console.log(error.code);        // Error code (e.g., INVALID_AMOUNT)
    console.log(error.message);     // Technical error message
    console.log(error.gateway);     // Gateway name (KHALTI/ESEWA/FONEPAY)
    console.log(error.friendlyMessage); // User-friendly error message
  }
}
```

## Official Documentation References

- Khalti: [https://docs.khalti.com/](https://docs.khalti.com/)
- eSewa: [https://developer.esewa.com.np/](https://developer.esewa.com.np/)
- Fonepay: [https://www.fonepay.com/developer](https://www.fonepay.com/developer)

## License

MIT

A Node.js package for easily integrating popular Nepali payment gateways (Khalti, eSewa, and Fonepay) into your application.

## Features

- 🚀 Easy to set up and use
- 💳 Support for multiple payment gateways
- 🛡️ TypeScript support with full type definitions
- 🔒 Secure credential management
- ✅ Payment verification support
- 🛠️ Comprehensive error handling
- 📝 Well-documented API

## Installation

```bash
npm install neppayments
```

## Quick Setup

After installation, the package will prompt you to configure your payment gateway credentials. You can also run the setup manually:

```bash
npx neppayments configure
```

## Usage

### 1. Khalti Integration

```typescript
import { initiateKhaltiPayment, verifyKhaltiPayment } from 'neppayments';

// Initiate payment
const paymentUrl = await initiateKhaltiPayment({
  amount: 1000, // amount in NPR
  customerName: 'John Doe',
  customerEmail: 'john@example.com',
  customerPhone: '9841234567',
  productIdentity: 'prod_123',
  productName: 'Test Product',
  returnUrl: 'https://yourapp.com/payment/verify',
  websiteUrl: 'https://yourapp.com'
});

// Verify payment
const verificationResult = await verifyKhaltiPayment({
  pidx: 'payment_id_from_khalti',
  transaction_id: 'your_transaction_id'
});
```

### 2. eSewa Integration

```typescript
import { initiateEsewaPayment, verifyEsewaPayment } from 'neppayments';

// Initiate payment
const formHtml = initiateEsewaPayment({
  amount: 1000,
  taxAmount: 0,
  productCode: 'EPAYTEST',
  successUrl: 'https://yourapp.com/payment/success',
  failureUrl: 'https://yourapp.com/payment/failure'
});

// Verify payment
const verificationResult = await verifyEsewaPayment({
  oid: 'order_id',
  amt: '1000',
  refId: 'ref_id_from_esewa'
});
```

### 3. Fonepay Integration

```typescript
import { initiateFonepayPayment, verifyFonepayPayment } from 'neppayments';

// Initiate payment
const paymentUrl = await initiateFonepayPayment({
  amount: 1000,
  customerName: 'John Doe',
  transactionId: 'trans_123',
  returnUrl: 'https://yourapp.com/payment/verify'
});

// Verify payment
const verificationResult = await verifyFonepayPayment({
  PRN: 'transaction_id',
  PID: 'merchant_id',
  BID: 'bank_id',
  AMT: '1000',
  UID: 'unique_id',
  DV: 'NPR'
});
```

## Error Handling

The package uses a custom `PaymentError` class for error handling. All errors thrown by the package will be instances of this class:

```typescript
try {
  const paymentUrl = await initiateKhaltiPayment(options);
} catch (error) {
  if (error instanceof PaymentError) {
    console.log(error.code); // Error code (e.g., INVALID_AMOUNT)
    console.log(error.message); // Technical error message
    console.log(error.friendlyMessage); // User-friendly error message
    console.log(error.gateway); // Payment gateway name
    console.log(error.details); // Additional error details
  }
}
```

## Configuration

The package reads configuration from environment variables. You can set these manually or use the setup script:

```env
# Khalti Configuration
KHALTI_SECRET_KEY="your_secret_key"
KHALTI_PUBLIC_KEY="your_public_key"

# eSewa Configuration
ESEWA_MERCHANT_CODE="your_merchant_code"
ESEWA_MERCHANT_SECRET="your_merchant_secret"

# Fonepay Configuration
FONEPAY_MERCHANT_ID="your_merchant_id"
FONEPAY_SECRET_KEY="your_secret_key"
```

## Development Mode

The package automatically detects development mode when `NODE_ENV !== 'production'` and uses test URLs for the payment gateways.

## Support

For issues and feature requests, please use the [GitHub issue tracker](https://github.com/nischaljs/neppayments/issues).

## License

MIT License - see the [LICENSE](LICENSE) file for details.
