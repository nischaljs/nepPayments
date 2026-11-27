import { PaymentErrorCode } from './payment.enums';

export class PaymentError extends Error {
  constructor(
    public readonly code: PaymentErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'PaymentError';
  }
} 