import { getEnvVar } from './utils/envLoader';
import { PaymentGateway, PaymentStatus } from './types/payment.enums';

export { PaymentGateway, PaymentStatus };

/**
 * API endpoints configuration
 */
export const API_ENDPOINTS = {
  KHALTI: {
    TEST: 'https://a.khalti.com/api/v2/epayment/initiate/',
    LIVE: 'https://khalti.com/api/v2/epayment/initiate/'
  },
  ESEWA: {
    TEST: 'https://uat.esewa.com.np/api/epay/main/v2/form',
    LIVE: 'https://epay.esewa.com.np/api/epay/main/v2/form'
  },
  FONEPAY: {
    TEST: 'https://dev-clientapi.fonepay.com/api/merchant/payment',
    LIVE: 'https://clientapi.fonepay.com/api/merchant/payment'
  }
};

/**
 * Environment configuration
 */
export interface PaymentConfig {
  isTest: boolean;
  khalti?: {
    secretKey: string;
    publicKey: string;
  };
  esewa?: {
    merchantCode: string;
    merchantSecret?: string;
  };
  fonepay?: {
    merchantId: string;
    secretKey: string;
  };
}

/**
 * Load and validate payment configuration from environment variables
 */
export function loadPaymentConfig(): PaymentConfig {
  const config: PaymentConfig = {
    isTest: process.env.NODE_ENV !== 'production'
  };

  try {
    // Try to load Khalti config
    try {
      config.khalti = {
        secretKey: getEnvVar('KHALTI_SECRET_KEY'),
        publicKey: getEnvVar('KHALTI_PUBLIC_KEY')
      };
    } catch (e) {
      console.error(e);
      // Khalti config not found, skip
    }

    // Try to load eSewa config
    try {
      config.esewa = {
        merchantCode: getEnvVar('ESEWA_MERCHANT_CODE'),
        merchantSecret: process.env.ESEWA_MERCHANT_SECRET // Optional
      };
    } catch (e) {
      console.error(e);
      // eSewa config not found, skip
    }

    // Try to load Fonepay config
    try {
      config.fonepay = {
        merchantId: getEnvVar('FONEPAY_MERCHANT_ID'),
        secretKey: getEnvVar('FONEPAY_SECRET_KEY')
      };
    } catch (e) {
      console.error(e);
      // Fonepay config not found, skip
    }

    // Validate that at least one gateway is configured
    if (!config.khalti && !config.esewa && !config.fonepay) {
      throw new Error(
        'No payment gateways configured. Use setup-nep-payments script to configure.'
      );
    }

    return config;
  } catch (error: any) {
    throw new Error(`Failed to load payment configuration: ${error.message}`);
  }
}

// Export singleton instance
export const paymentConfig = loadPaymentConfig();
