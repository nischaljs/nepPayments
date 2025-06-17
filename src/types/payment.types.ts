import { NormalizedPaymentStatus } from './payment.enums';

/**
 * Amount breakdown item for Khalti payment
 */
export type KhaltiAmountBreakdown = {
  /** Label describing the amount (e.g., "Base Price", "VAT") */
  label: string;
  /** Amount in NPR */
  amount: number;
};

/**
 * Product detail for Khalti payment
 */
export type KhaltiProductDetail = {
  /** Unique identifier for the product */
  identity: string;
  /** Name of the product */
  name: string;
  /** Total price in paisa */
  total_price: number;
  /** Quantity of the product */
  quantity: number;
  /** Unit price in paisa */
  unit_price: number;
};

/**
 * Customer information for Khalti payment
 */
export type KhaltiCustomerInfo = {
  /** Customer's full name */
  name: string;
  /** Customer's email address (optional) */
  email?: string;
  /** Customer's phone number (optional) */
  phone?: string;
};

/**
 * Configuration for Khalti payment gateway
 */
export interface KhaltiConfig {
  secretKey: string;
  environment?: 'sandbox' | 'production';
}

/**
 * Configuration for eSewa payment gateway
 */
export interface EsewaConfig {
  productCode: string;
  secretKey: string;
  environment?: 'sandbox' | 'production';
}

/**
 * Main configuration interface for NepPayments
 */
export interface NepPaymentsConfig {
  khalti?: KhaltiConfig;
  esewa?: EsewaConfig;
}

/**
 * Base interface for payment creation options
 */
export interface BasePaymentOptions {
  amount: number;
  customerName: string;
  productIdentity: string;
  productName: string;
  returnUrl: string;
  websiteUrl: string;
  customerEmail?: string;
  customerPhone?: string;
}

/**
 * Khalti payment creation options
 */
export interface KhaltiPaymentOptions {
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
}

/**
 * eSewa payment creation options
 */
export interface EsewaPaymentOptions {
  amount: number;
  tax_amount: number;
  total_amount: number;
  transaction_uuid: string;
  product_code: string;
  product_service_charge: number;
  product_delivery_charge: number;
  success_url: string;
  failure_url: string;
  signed_field_names: string;
}

/**
 * Base interface for payment response
 */
export interface PaymentResponse {
  paymentUrl: string;
  status: 'PENDING';
}

/**
 * Khalti payment response
 */
export interface KhaltiPaymentResponse {
  pidx: string;           // Payment ID for verification
  payment_url: string;    // URL to redirect user to
  expires_at: string;     // Expiration timestamp
  expires_in: number;     // Expiration in seconds
}

/**
 * eSewa payment response
 */
export interface EsewaPaymentResponse {
  payment_url: string;
  transaction_uuid: string;
  signature: string;
}

/**
 * Base interface for payment verification options
 */
export interface BaseVerificationOptions {
  amount: number;
}

/**
 * Khalti payment verification options
 */
export interface KhaltiVerificationOptions {
  pidx: string;   // Payment ID from createPayment
}

/**
 * eSewa payment verification options
 */
export interface EsewaVerificationOptions {
  product_code: string;
  transaction_uuid: string;
  total_amount: number;
}

/**
 * Payment verification response
 */
export interface PaymentVerificationResponse {
  status: 'COMPLETED' | 'FAILED' | 'PENDING' | 'EXPIRED' | 'CANCELED';
  transaction_id: string;
  amount: number;
  payment_details: any;
}

/**
 * Result of payment verification
 * Normalized response across all payment gateways
 */
export type PaymentVerificationResult = {
  /** Whether the payment was successful */
  success: boolean;
  /** User-friendly status message */
  message: string;
  /** Transaction ID from the payment gateway */
  transactionId: string;
  /** Amount in NPR */
  amount: number;
  /** Normalized payment status */
  status: NormalizedPaymentStatus;
  /** Full response from the payment gateway */
  gatewayResponse?: any;
};
