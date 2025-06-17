/**
 * Supported payment gateways
 */
export enum PaymentGateway {
  KHALTI = 'KHALTI',
  ESEWA = 'ESEWA'
}

/**
 * Payment status
 */
export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
  CANCELED = 'CANCELED'
}

/**
 * Payment status for internal use
 * Normalized status across all payment gateways
 */
export enum NormalizedPaymentStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  PENDING = 'pending',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  PARTIALLY_REFUNDED = 'partially_refunded'
}

/**
 * Payment error codes
 */
export enum PaymentErrorCode {
  // Configuration errors
  INVALID_CONFIG = 'INVALID_CONFIG',
  GATEWAY_NOT_CONFIGURED = 'GATEWAY_NOT_CONFIGURED',

  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  INVALID_URL = 'INVALID_URL',
  INVALID_PAYMENT_ID = 'INVALID_PAYMENT_ID',
  INVALID_PARAMETER = 'INVALID_PARAMETER',

  // Authentication errors
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',

  // Payment errors
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAYMENT_EXPIRED = 'PAYMENT_EXPIRED',
  PAYMENT_CANCELED = 'PAYMENT_CANCELED',
  PAYMENT_ALREADY_COMPLETED = 'PAYMENT_ALREADY_COMPLETED',

  // Verification errors
  VERIFICATION_FAILED = 'VERIFICATION_FAILED',
  VERIFICATION_TIMEOUT = 'VERIFICATION_TIMEOUT',

  // Gateway errors
  GATEWAY_ERROR = 'GATEWAY_ERROR',
  GATEWAY_TIMEOUT = 'GATEWAY_TIMEOUT',
  GATEWAY_UNAVAILABLE = 'GATEWAY_UNAVAILABLE',

  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  REQUEST_TIMEOUT = 'REQUEST_TIMEOUT',

  // Unknown errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',

  // New errors
  SIGNATURE_GENERATION_FAILED = 'SIGNATURE_GENERATION_FAILED',
  INVALID_PAYMENT_OPTIONS = 'INVALID_PAYMENT_OPTIONS',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  INVALID_VERIFICATION_OPTIONS = 'INVALID_VERIFICATION_OPTIONS'
}

/**
 * Custom error class for payment-related errors
 */
export class PaymentError extends Error {
  constructor(
    message: string,
    public code: PaymentErrorCode
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

export enum PaymentEnvironment {
  SANDBOX = 'sandbox',
  PRODUCTION = 'production'
}
