// index.ts
import { KhaltiGateway } from './gateways/khalti';
import { EsewaGateway } from './gateways/esewa';
import { PaymentError, PaymentErrorCode } from './types/payment.enums';
import { KhaltiConfig, EsewaConfig } from './types/payment.types';

/**
 * Main class for handling Nepali payment gateways
 */
export class NepPayments {
  public readonly khalti?: KhaltiGateway;
  public readonly esewa?: EsewaGateway;

  /**
   * Create a new NepPayments instance
   * @param config Configuration for payment gateways
   */
  constructor(config: {
    khalti?: KhaltiConfig;
    esewa?: EsewaConfig;
  }) {
    if (config.khalti) {
      this.khalti = new KhaltiGateway(config.khalti);
    }
    if (config.esewa) {
      this.esewa = new EsewaGateway(config.esewa);
    }

    // Check if at least one gateway is configured
    if (!this.khalti && !this.esewa) {
      throw new PaymentError(
        'At least one payment gateway must be configured',
        PaymentErrorCode.GATEWAY_NOT_CONFIGURED
      );
    }
  }

  /**
   * Get the configured Khalti gateway
   * @throws {PaymentError} If Khalti is not configured
   */
  get khaltiGateway(): KhaltiGateway {
    if (!this.khalti) {
      throw new PaymentError(
        'Khalti gateway is not configured',
        PaymentErrorCode.GATEWAY_NOT_CONFIGURED
      );
    }
    return this.khalti;
  }

  /**
   * Get the configured eSewa gateway
   * @throws {PaymentError} If eSewa is not configured
   */
  get esewaGateway(): EsewaGateway {
    if (!this.esewa) {
      throw new PaymentError(
        'eSewa gateway is not configured',
        PaymentErrorCode.GATEWAY_NOT_CONFIGURED
      );
    }
    return this.esewa;
  }

  /**
   * Get list of configured gateways
   */
  get configuredGateways(): string[] {
    const gateways: string[] = [];
    if (this.khalti) gateways.push('khalti');
    if (this.esewa) gateways.push('esewa');
    return gateways;
  }
}

// Export types
export * from './types/payment.types';
export * from './types/payment.enums';
export { PaymentError } from './types/payment.enums';

// Export individual gateways for direct use if needed
export { KhaltiGateway } from './gateways/khalti';
export { EsewaGateway } from './gateways/esewa';
