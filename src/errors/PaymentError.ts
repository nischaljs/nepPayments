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
  INVALID_TRANSACTION = 'INVALID_TRANSACTION',
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',

  // Gateway errors
  GATEWAY_ERROR = 'GATEWAY_ERROR',
  GATEWAY_TIMEOUT = 'GATEWAY_TIMEOUT',
  GATEWAY_UNAVAILABLE = 'GATEWAY_UNAVAILABLE'
}

/**
 * Standard payment error class
 */
export class PaymentError extends Error {
  code: PaymentErrorCode;
  gateway?: string;
  details?: Record<string, unknown>;

  constructor(code: PaymentErrorCode, message: string, gateway?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
    this.gateway = gateway;
    this.details = details;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PaymentError);
    }
  }

  /**
   * User-friendly error message
   */
  get friendlyMessage(): string {
    switch (this.code) {
      case PaymentErrorCode.INVALID_CONFIG:
        return 'Invalid payment configuration. Please check your setup.';
      case PaymentErrorCode.GATEWAY_NOT_CONFIGURED:
        return `Payment gateway ${this.gateway} is not configured.`;
      case PaymentErrorCode.VALIDATION_ERROR:
        return 'Validation error: ' + this.message;
      case PaymentErrorCode.INVALID_AMOUNT:
        return 'Amount should be greater than Rs. 10 (1000 paisa).';
      case PaymentErrorCode.INVALID_URL:
        return 'Invalid URL provided. Please provide valid return_url and website_url.';
      case PaymentErrorCode.AUTHENTICATION_ERROR:
        return 'Authentication failed. Please check your credentials.';
      case PaymentErrorCode.INVALID_CREDENTIALS:
        return 'Invalid credentials provided.';
      case PaymentErrorCode.TOKEN_EXPIRED:
        return 'Authentication token has expired.';
      case PaymentErrorCode.PAYMENT_FAILED:
        return 'Payment failed. Please try again.';
      case PaymentErrorCode.PAYMENT_EXPIRED:
        return 'Payment link has expired. Please try again.';
      case PaymentErrorCode.PAYMENT_CANCELED:
        return 'Payment was cancelled by the user.';
      case PaymentErrorCode.PAYMENT_ALREADY_COMPLETED:
        return 'Payment has already been completed.';
      case PaymentErrorCode.VERIFICATION_FAILED:
        return 'Payment verification failed.';
      case PaymentErrorCode.INVALID_TRANSACTION:
        return 'Invalid transaction.';
      case PaymentErrorCode.AMOUNT_MISMATCH:
        return 'Payment amount does not match.';
      case PaymentErrorCode.GATEWAY_ERROR:
        return `Payment gateway error: ${this.message}`;
      case PaymentErrorCode.GATEWAY_TIMEOUT:
        return 'Payment gateway is not responding. Please try again later.';
      case PaymentErrorCode.GATEWAY_UNAVAILABLE:
        return 'Payment gateway is currently unavailable.';
      default:
        return this.message || 'An unknown error occurred.';
    }
  }

  /**
   * Convert error to JSON for logging/response
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      friendlyMessage: this.friendlyMessage,
      gateway: this.gateway,
      details: this.details
    };
  }
}
