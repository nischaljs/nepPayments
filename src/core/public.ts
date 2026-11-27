// What users of the package see from the core. The plug API (connect, Plug) stays internal.
export { PaymentError, isPaymentError } from './errors';
export type { PaymentErrorCode, PaymentErrorInit } from './errors';
export { paisa, rupees, toRupeeString } from './money';
export type { Paisa } from './money';
export type {
  GatewayName,
  Mode,
  MockOutcome,
  PaymentStatus,
  InitiateResult,
  RedirectStart,
  FormStart,
  QrStart,
  VerifyInput,
  VerifyResult,
  CallbackResult,
  StatusResult,
  RefundResult
} from './types';
export type { Client } from './socket';
