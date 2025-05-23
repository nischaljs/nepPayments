import crypto from 'crypto';

/**
 * Generates HMAC-SHA256 signature for eSewa request
 */
export function generateEsewaSignature(
  totalAmount: string,
  transactionUuid: string,
  productCode: string,
  secretKey: string
): string {
  const data = `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${productCode}`;
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(data);
  return hmac.digest('base64');
}
