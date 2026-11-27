import { KhaltiGateway } from './khalti';
import { EsewaGateway } from './esewa';
import { PaymentError, PaymentErrorCode } from './enums';
import type { KhaltiConfig, EsewaConfig } from './types';

/**
 * The 2.0.7 `NepPayments` class, unchanged for callers, built on the v3 core.
 * Move to `createPayments` when you can: it checks the order id too and
 * keeps eSewa's AMBIGUOUS and Khalti's Refunded as their own statuses.
 *
 * @example
 * import { NepPayments } from 'nepal-payments/compat';
 * const payments = new NepPayments({ khalti: { secretKey: process.env.KHALTI_SECRET_KEY!, environment: 'sandbox' } });
 */
export class NepPayments {
  public readonly khalti?: KhaltiGateway;
  public readonly esewa?: EsewaGateway;

  constructor(config: { khalti?: KhaltiConfig; esewa?: EsewaConfig }) {
    if (config.khalti) this.khalti = new KhaltiGateway(config.khalti);
    if (config.esewa) this.esewa = new EsewaGateway(config.esewa);
    if (!this.khalti && !this.esewa) {
      throw new PaymentError('At least one payment gateway must be configured', PaymentErrorCode.GATEWAY_NOT_CONFIGURED);
    }
  }

  get khaltiGateway(): KhaltiGateway {
    if (!this.khalti) throw new PaymentError('Khalti gateway is not configured', PaymentErrorCode.GATEWAY_NOT_CONFIGURED);
    return this.khalti;
  }

  get esewaGateway(): EsewaGateway {
    if (!this.esewa) throw new PaymentError('eSewa gateway is not configured', PaymentErrorCode.GATEWAY_NOT_CONFIGURED);
    return this.esewa;
  }

  get configuredGateways(): string[] {
    const gateways: string[] = [];
    if (this.khalti) gateways.push('khalti');
    if (this.esewa) gateways.push('esewa');
    return gateways;
  }
}

export { KhaltiGateway, EsewaGateway };
export * from './types';
export * from './enums';
