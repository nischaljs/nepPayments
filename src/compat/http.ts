import { createHttp, isPaymentError, Redactor, type HttpRequest, type HttpResponse } from '../core';
import { PaymentError, PaymentErrorCode } from './enums';

/** The 2.x error rules on top of the v3 HTTP: the answer's status and body only, never the request. */
export class CompatHttp {
  private readonly redactor = new Redactor();
  private readonly http;

  constructor(gateway: 'khalti' | 'esewa', secrets: string[]) {
    this.redactor.add(...secrets);
    this.http = createHttp({ gateway, timeoutMs: 30000, redactor: this.redactor });
  }

  async send(req: HttpRequest, fallbackMessage: string, fallbackCode: PaymentErrorCode, okStatus: (s: number) => boolean): Promise<HttpResponse> {
    let res: HttpResponse;
    try {
      res = await this.http.send(req);
    } catch (err) {
      if (isPaymentError(err) && err.code === 'TIMEOUT') {
        throw new PaymentError(`${fallbackMessage}: the request timed out`, PaymentErrorCode.REQUEST_TIMEOUT);
      }
      throw new PaymentError(`${fallbackMessage}: no response from the gateway`, PaymentErrorCode.NETWORK_ERROR);
    }
    if (!okStatus(res.status)) throw responseError(res.status, res.data, fallbackMessage, fallbackCode);
    return res;
  }
}

export function responseError(status: number, data: unknown, fallbackMessage: string, fallbackCode: PaymentErrorCode): PaymentError {
  return new PaymentError(messageFrom(data) || fallbackMessage, codeFor(status, data, fallbackCode), { status, data });
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

/**
 * Let the layer's own PaymentErrors through. `send` already turned every
 * request with no answer into NETWORK_ERROR or REQUEST_TIMEOUT, so anything
 * else is a bug or bad input and gets the method's own code. Only the error's
 * name is kept, so no outside text ends up in the message.
 */
export function rethrow(err: unknown, fallbackMessage: string, fallbackCode: PaymentErrorCode): never {
  if (err instanceof PaymentError) throw err;
  const name = err instanceof Error ? err.name : typeof err;
  throw new PaymentError(`${fallbackMessage}: unexpected ${name}`, fallbackCode);
}
