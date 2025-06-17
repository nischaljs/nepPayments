import crypto from 'crypto';

/**
 * Generates HMAC-SHA256 signature for eSewa request
 * @param requestId Unique request identifier
 * @param amount Payment amount
 * @param clientSecret Base64 encoded client secret
 */
export function generateEsewaSignature(
  requestId: string,
  amount: number,
  clientSecret: string
): string {
  const data = `request_id=${requestId},amount=${amount}`;
  const hmac = crypto.createHmac('sha256', Buffer.from(clientSecret, 'base64'));
  hmac.update(data);
  return hmac.digest('base64');
}

/**
 * Validates eSewa signature
 * @param signature Signature to validate
 * @param requestId Unique request identifier
 * @param amount Payment amount
 * @param clientSecret Base64 encoded client secret
 */
export function validateEsewaSignature(
  signature: string,
  requestId: string,
  amount: number,
  clientSecret: string
): boolean {
  const expectedSignature = generateEsewaSignature(requestId, amount, clientSecret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
