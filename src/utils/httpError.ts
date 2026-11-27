import { PaymentError, PaymentErrorCode } from '../types/payment.enums';

/**
 * Turn any error from an HTTP call into a PaymentError that is safe to log.
 * Axios errors carry the request config, and the config carries the
 * Authorization header with the secret key. Only the response status and
 * body are kept.
 */
export function toPaymentError(
  error: unknown,
  fallbackMessage: string,
  fallbackCode: PaymentErrorCode
): PaymentError {
  if (error instanceof PaymentError) return error;

  const err = error as {
    code?: string;
    response?: { status?: number; data?: unknown };
  } | null;

  if (err && err.response && typeof err.response.status === 'number') {
    const { status, data } = err.response;
    return new PaymentError(messageFrom(data) || fallbackMessage, codeFor(status, data, fallbackCode), {
      status,
      data
    });
  }

  if (err && (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT')) {
    return new PaymentError(`${fallbackMessage}: the request timed out`, PaymentErrorCode.REQUEST_TIMEOUT);
  }
  return new PaymentError(`${fallbackMessage}: no response from the gateway`, PaymentErrorCode.NETWORK_ERROR);
}

function codeFor(status: number, data: unknown, fallback: PaymentErrorCode): PaymentErrorCode {
  if (isRecord(data) && data.error_key === 'validation_error') return PaymentErrorCode.VALIDATION_ERROR;
  if (status === 401 || status === 403) return PaymentErrorCode.AUTHENTICATION_ERROR;
  return fallback;
}

function messageFrom(data: unknown): string {
  if (!isRecord(data)) return '';
  if (typeof data.detail === 'string') return data.detail;
  if (typeof data.error_message === 'string') return data.error_message;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === 'error_key' || key === 'status_code') continue;
    if (Array.isArray(value)) parts.push(`${key}: ${value.filter(v => typeof v === 'string').join(' ')}`);
  }
  return parts.join(', ');
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
