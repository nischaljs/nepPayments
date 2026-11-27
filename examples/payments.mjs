// Copy into your server project. Load .env before importing this module.
import { readFileSync } from 'node:fs';
import { createPayments } from 'nepal-payments';

function required(name) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Set ${name} in the server environment.`);
  return value;
}

function signingKey(prefix) {
  const pemPath = process.env[prefix + '_PRIVATE_KEY_PATH'];
  if (pemPath) return { privateKeyPem: readFileSync(pemPath, 'utf8') };
  return {
    pfx: readFileSync(required(prefix + '_PFX_PATH')),
    pfxPassword: process.env[prefix + '_PFX_PASSWORD']
  };
}

const mode = required('PAYMENT_MODE');
if (!['mock', 'sandbox', 'live'].includes(mode)) throw new Error('PAYMENT_MODE must be mock, sandbox or live.');
const config = {
  khalti: () => ({ secretKey: required('KHALTI_SECRET_KEY') }),
  esewa: () => ({ productCode: required('ESEWA_PRODUCT_CODE'), secretKey: required('ESEWA_SECRET_KEY') }),
  connectips: () => ({
    merchantId: required('CIPS_MERCHANT_ID'), appId: required('CIPS_APP_ID'), appName: required('CIPS_APP_NAME'),
    password: required('CIPS_PASSWORD'), ...signingKey('CIPS'),
    ...(process.env.CIPS_BASE_URL && { endpoints: { base: process.env.CIPS_BASE_URL } })
  }),
  hamropay: () => ({
    merchantId: required('HAMROPAY_MERCHANT_ID'), clientId: required('HAMROPAY_CLIENT_ID'),
    clientApiKey: required('HAMROPAY_CLIENT_API_KEY'), clientSecret: required('HAMROPAY_CLIENT_SECRET'),
    webhookSecret: process.env.HAMROPAY_WEBHOOK_SECRET || undefined,
    ...(mode === 'live' && { endpoints: { api: required('HAMROPAY_API_BASE'), gateway: required('HAMROPAY_GATEWAY_BASE') } })
  }),
  nepalpay: () => ({
    generateUrl: required('NQR_GENERATE_URL'), reportUrl: required('NQR_REPORT_URL'),
    userId: required('NQR_USER'), password: required('NQR_PASSWORD'), acquirerId: required('NQR_ACQUIRER'),
    merchantId: required('NQR_MERCHANT'), merchantName: required('NQR_NAME'), merchantCategoryCode: Number(required('NQR_CATEGORY')),
    city: required('NQR_CITY'), postalCode: required('NQR_POSTAL_CODE'), storeLabel: required('NQR_STORE'),
    ...signingKey('NQR'),
    ...(process.env.NQR_REPORT_AUTHORIZATION && { reportAuthorization: async () => required('NQR_REPORT_AUTHORIZATION') })
  }),
  fonepay: () => ({
    merchantCode: required('FONEPAY_CODE'), username: required('FONEPAY_USER'),
    password: required('FONEPAY_PASSWORD'), secretKey: required('FONEPAY_SECRET')
  }),
  bankcard: () => ({
    profileId: required('CARD_PROFILE_ID'), accessKey: required('CARD_ACCESS_KEY'), secretKey: required('CARD_SECRET_KEY')
  })
};

const enabled = required('PAYMENT_GATEWAYS').split(',').map(name => name.trim());
const gateways = Object.fromEntries(enabled.map(name => {
  if (!Object.hasOwn(config, name)) throw new Error('Choose PAYMENT_GATEWAYS from: ' + Object.keys(config).join(', '));
  return [name, mode === 'mock' ? {} : config[name]()];
}));
export const payments = createPayments({ mode, ...gateways });
