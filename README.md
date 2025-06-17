# NepPayments

A simple and easy-to-use package for integrating Nepali payment gateways (Khalti and eSewa) into your applications. Works with both JavaScript and TypeScript projects.

## Features

- 🔒 Secure payment processing with proper authentication
- 💳 Support for multiple payment gateways:
  - Khalti (Web Checkout)
  - eSewa (Token-based payment)
- 🛠 TypeScript support with full type definitions
- ✅ Comprehensive error handling
- 🔄 Payment verification and status checking
- 🧪 Test environment support with sandbox credentials
- �� Zero dependencies
- 🔄 Automatic token refresh for eSewa
- 🎯 Detailed payment status tracking

## Quick Start

### 1. Install the package

```bash
npm install nep-payments
# or
yarn add nep-payments
```

### 2. Get your test credentials

#### Khalti
1. Go to [Khalti Merchant Dashboard](https://test-admin.khalti.com)
2. Sign up for a merchant account
3. Go to Settings > API Keys
4. Create a new API key with test mode enabled
5. Copy your Live secret key (e.g., `1db0691eb0ce459588eba0c81a2b560e`)

Test Credentials:
- Test Khalti IDs: 9800000000, 9800000001, 9800000002, 9800000003, 9800000004, 9800000005
- Test MPIN: 1111
- Test OTP: 987654

#### eSewa
1. Go to [eSewa Merchant Portal](https://merchant.esewa.com.np)
2. Sign up for a merchant account
3. Go to Settings > API Configuration
4. Get your:
   - eSewa ID: 9806800001/2/3/4/5
   - Password: Nepal@123
   - MPIN: 1122 (for application only)
   - Merchant ID/Service Code: EPAYTEST
   - Token: 123456
   - Secret Key: 8gBm/:&EnhH.1/q
   - Client ID: JB0BBQ4aD0UqIThFJwAKBgAXEUkEGQUBBAwdOgABHD4DChwUAB0R
   - Client Secret: BhwIWQQADhIYSxILExMcAgFXFhcOBwAKBgAXEQ==

### 3. Use in your code

#### JavaScript Example
```javascript
const { NepPayments } = require('nep-payments');

// Initialize with your credentials
const payments = new NepPayments({
  khalti: {
    secretKey: 'test_...', // Your Khalti test secret key
    environment: 'sandbox' // or 'production'
  },
  esewa: {
    username: 'your_username',
    password: 'base64_encoded_password',
    clientSecret: 'base64_encoded_client_secret',
    environment: 'sandbox' // or 'production'
  }
});

// Create a Khalti payment
async function createKhaltiPayment() {
  try {
    const payment = await payments.khalti.createPayment({
      amount: 1000, // Amount in paisa (1000 = Rs. 10)
      purchase_order_id: 'ORDER_123',
      purchase_order_name: 'Product Name',
      return_url: 'https://your-domain.com/success',
      website_url: 'https://your-domain.com',
      customer_info: {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '9800000000'
      },
      amount_breakdown: [
        {
          label: 'Product Price',
          amount: 800
        },
        {
          label: 'VAT',
          amount: 200
        }
      ],
      product_details: [
        {
          identity: 'PROD_123',
          name: 'Product Name',
          total_price: 1000,
          quantity: 1,
          unit_price: 1000
        }
      ]
    });

    // Redirect user to payment URL
    window.location.href = payment.payment_url;
  } catch (error) {
    console.error('Payment failed:', error.message);
  }
}

// Create an eSewa payment
async function createEsewaPayment() {
  try {
    const payment = await payments.esewa.createPayment({
      amount: 1000,
      request_id: 'ORDER_123',
      properties: {
        customer_name: 'John Doe',
        address: 'Kathmandu',
        customer_id: '1A4DDF',
        invoice_number: '123456789',
        product_name: 'Product Name'
      }
    });

    // Get the token to show to user
    console.log('Payment Token:', payment.token);
  } catch (error) {
    console.error('Payment failed:', error.message);
  }
}

// Verify a Khalti payment
async function verifyKhaltiPayment(pidx) {
  try {
    const verification = await payments.khalti.verifyPayment({
      pidx: pidx
    });

    if (verification.status === 'COMPLETED') {
      console.log('Payment successful!');
      console.log('Transaction ID:', verification.transaction_id);
      console.log('Amount:', verification.amount);
    } else {
      console.log('Payment failed');
    }
  } catch (error) {
    console.error('Verification failed:', error.message);
  }
}

// Verify an eSewa payment
async function verifyEsewaPayment(requestId, transactionCode) {
  try {
    const verification = await payments.esewa.verifyPayment({
      request_id: requestId,
      transaction_code: transactionCode,
      amount: 1000
    });

    if (verification.response_code === 0) {
      console.log('Payment successful!');
      console.log('Transaction ID:', verification.transaction_id);
    } else {
      console.log('Payment failed:', verification.response_message);
    }
  } catch (error) {
    console.error('Verification failed:', error.message);
  }
}
```

## API Reference

### Khalti

#### Create Payment
```typescript
const payment = await payments.khalti.createPayment({
  amount: number;              // Amount in paisa (1000 = Rs. 10)
  purchase_order_id: string;   // Unique order identifier
  purchase_order_name: string; // Order name
  return_url: string;         // URL to redirect after payment
  website_url: string;        // Your website URL
  customer_info?: {           // Optional customer information
    name: string;
    email: string;
    phone: string;
  };
  amount_breakdown?: Array<{  // Optional amount breakdown
    label: string;
    amount: number;
  }>;
  product_details?: Array<{   // Optional product details
    identity: string;
    name: string;
    total_price: number;
    quantity: number;
    unit_price: number;
  }>;
  merchant_username?: string;  // Optional merchant name
  merchant_extra?: string;     // Optional merchant extra data
});

// Returns:
{
  pidx: string;           // Payment ID for verification
  payment_url: string;    // URL to redirect user to
  expires_at: string;     // Expiration timestamp
  expires_in: number;     // Expiration in seconds
}
```

#### Verify Payment
```typescript
const verification = await payments.khalti.verifyPayment({
  pidx: string;   // Payment ID from createPayment
});

// Returns:
{
  status: 'COMPLETED' | 'FAILED' | 'PENDING' | 'EXPIRED' | 'CANCELED';
  transaction_id: string;
  amount: number;
  payment_details: any;
}
```

### eSewa

#### Create Payment
```typescript
const payment = await payments.esewa.createPayment({
  amount: number;              // Amount in NPR
  request_id: string;          // Unique request identifier
  properties: {                // Additional payment details
    [key: string]: string;     // Dynamic properties as needed
  };
});

// Returns:
{
  token: string;              // Payment token to show to user
  request_id: string;         // Request ID for verification
}
```

#### Verify Payment
```typescript
const verification = await payments.esewa.verifyPayment({
  request_id: string;         // Request ID from createPayment
  transaction_code: string;   // Transaction code from eSewa
  amount: number;             // Amount in NPR
});

// Returns:
{
  response_code: number;      // 0 for success, 1 for failure
  response_message: string;   // Success/error message
  transaction_id: string;     // Unique transaction ID
}
```

## Error Handling

```typescript
try {
  await payments.khalti.createPayment(options);
} catch (error) {
  if (error instanceof PaymentError) {
    switch (error.code) {
      case 'INVALID_AMOUNT':
        console.error('Amount should be greater than Rs. 10 (1000 paisa)');
        break;
      case 'INVALID_URL':
        console.error('Invalid return_url or website_url');
        break;
      case 'AUTHENTICATION_ERROR':
        console.error('Invalid API key or authentication failed');
        break;
      case 'GATEWAY_ERROR':
        console.error('Payment gateway error');
        break;
      default:
        console.error('Payment failed:', error.message);
    }
  }
}
```

## Environment Configuration

### Khalti
- Sandbox: `https://dev.khalti.com/api/v2/`
- Production: `https://khalti.com/api/v2/`

### eSewa
- Sandbox: `https://uat.esewa.com.np/api`
- Production: `https://esewa.com.np/api`

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, please open an issue in the GitHub repository or contact us at [support email].
