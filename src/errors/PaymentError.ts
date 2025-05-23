/**
 * Payment error codes
 */
export enum PaymentErrorCode {
  // Configuration errors
  INVALID_CONFIG = 'INVALID_CONFIG',
  GATEWAY_NOT_CONFIGURED = 'GATEWAY_NOT_CONFIGURED',

  // Validation errors
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  INVALID_CURRENCY = 'INVALID_CURRENCY',
  INVALID_CALLBACK_URL = 'INVALID_CALLBACK_URL',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // Gateway errors
  GATEWAY_ERROR = 'GATEWAY_ERROR',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAYMENT_EXPIRED = 'PAYMENT_EXPIRED',
  PAYMENT_CANCELLED = 'PAYMENT_CANCELLED',

  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  GATEWAY_TIMEOUT = 'GATEWAY_TIMEOUT',

  // Unknown errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Standard payment error class
 */
export class PaymentError extends Error {
  code: PaymentErrorCode;
  gateway?: string;
  details?: any;

  constructor(code: PaymentErrorCode, message: string, gateway?: string, details?: any) {
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
        return `Payment gateway ${this.gateway} is not configured. Run setup script first.`;
      case PaymentErrorCode.INVALID_AMOUNT:
        return 'Invalid payment amount. Amount must be greater than 0.';
      case PaymentErrorCode.INVALID_CALLBACK_URL:
        return 'Invalid callback URL provided.';
      case PaymentErrorCode.MISSING_REQUIRED_FIELD:
        return `Missing required field: ${this.details?.field || 'unknown'}`;
      case PaymentErrorCode.GATEWAY_ERROR:
        return `Payment gateway error: ${this.message}`;
      case PaymentErrorCode.PAYMENT_FAILED:
        return 'Payment failed. Please try again.';
      case PaymentErrorCode.PAYMENT_EXPIRED:
        return 'Payment link has expired. Please try again.';
      case PaymentErrorCode.PAYMENT_CANCELLED:
        return 'Payment was cancelled by the user.';
      case PaymentErrorCode.NETWORK_ERROR:
        return 'Network error occurred. Please check your connection and try again.';
      case PaymentErrorCode.GATEWAY_TIMEOUT:
        return 'Payment gateway is not responding. Please try again later.';
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
