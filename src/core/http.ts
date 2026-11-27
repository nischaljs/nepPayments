import { PaymentError } from './errors';
import type { Redactor } from './redact';
import type { GatewayName } from './types';

export interface HttpRequest {
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  json?: unknown;
  form?: Record<string, string>;
}

export interface HttpResponse {
  status: number;
  /** Parsed JSON when the body is JSON, else the text. */
  data: unknown;
  text: string;
}

export interface Http {
  send(req: HttpRequest): Promise<HttpResponse>;
}

/**
 * HTTP over fetch with a timeout. It resolves for every HTTP status; the
 * gateway decides what a status means. It throws only when no answer came,
 * and that error never holds the URL's query, the headers or the body.
 */
export function createHttp(opts: { gateway: GatewayName; timeoutMs: number; fetch?: typeof fetch; redactor: Redactor }): Http {
  return {
    async send(req) {
      const doFetch = opts.fetch ?? globalThis.fetch;
      if (typeof doFetch !== 'function') {
        throw new PaymentError({ code: 'NOT_SUPPORTED', gateway: opts.gateway, message: 'No global fetch. Use Node.js 18 or later, or pass options.fetch.' });
      }
      const url = new URL(req.url);
      for (const [k, v] of Object.entries(req.query ?? {})) url.searchParams.set(k, v);
      const headers: Record<string, string> = { accept: 'application/json', ...req.headers };
      let body: string | undefined;
      if (req.json !== undefined) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(req.json);
      } else if (req.form) {
        headers['content-type'] = 'application/x-www-form-urlencoded';
        body = new URLSearchParams(req.form).toString();
      }

      let res: Response;
      try {
        res = await doFetch(url.toString(), { method: req.method, headers, body, signal: AbortSignal.timeout(opts.timeoutMs) });
      } catch (err) {
        const name = (err as { name?: string } | null)?.name;
        const timedOut = name === 'TimeoutError' || name === 'AbortError';
        throw new PaymentError({
          code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
          gateway: opts.gateway,
          message: timedOut
            ? `${opts.gateway} did not answer within ${opts.timeoutMs} ms (${req.method} ${url.origin}${url.pathname}).`
            : `Could not reach ${opts.gateway} (${req.method} ${url.origin}${url.pathname}).`
        });
      }
      const text = await res.text();
      let data: unknown = text;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      return { status: res.status, data: opts.redactor.value(data), text: opts.redactor.text(text) };
    }
  };
}
