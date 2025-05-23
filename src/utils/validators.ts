import { PaymentError, PaymentErrorCode } from '../errors/PaymentError';

export function validateAmount(amount: number, gateway: string): void {
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new PaymentError(
      PaymentErrorCode.INVALID_AMOUNT,
      'Payment amount must be a valid number',
      gateway
    );
  }

  if (amount <= 0) {
    throw new PaymentError(
      PaymentErrorCode.INVALID_AMOUNT,
      'Payment amount must be greater than 0',
      gateway
    );
  }
}

export function validateUrl(url: string, fieldName: string, gateway: string): void {
  try {
    new URL(url);
  } catch {
    throw new PaymentError(
      PaymentErrorCode.INVALID_CALLBACK_URL,
      `Invalid ${fieldName} URL: ${url}. Must be a valid absolute URL`,
      gateway
    );
  }
}

export function validateRequiredField(value: any, fieldName: string, gateway: string): void {
  if (value === undefined || value === null || value === '') {
    throw new PaymentError(
      PaymentErrorCode.MISSING_REQUIRED_FIELD,
      `Missing required field: ${fieldName}`,
      gateway,
      { field: fieldName }
    );
  }
}
