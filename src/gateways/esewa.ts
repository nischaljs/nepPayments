import { paymentConfig, API_ENDPOINTS } from '../config';
import { EsewaPaymentOptions } from '../types/payment.types';
import { generateEsewaSignature } from '../utils/signatureGenerator';
import { PaymentError, PaymentErrorCode } from '../errors/PaymentError';
import { validateAmount, validateUrl, validateRequiredField } from '../utils/validators';
import { v4 as uuidv4 } from 'uuid';

export function initiateEsewaPayment(options: EsewaPaymentOptions): string {
  // Validate required fields
  validateAmount(options.amount, 'ESEWA');
  validateUrl(options.successUrl, 'success', 'ESEWA');
  validateUrl(options.failureUrl, 'failure', 'ESEWA');
  validateRequiredField(options.productCode, 'productCode', 'ESEWA');

  if (!paymentConfig.esewa) {
    throw new PaymentError(
      PaymentErrorCode.GATEWAY_NOT_CONFIGURED,
      'eSewa gateway is not configured',
      'ESEWA'
    );
  }

  const {
    amount,
    taxAmount = 0,
    productCode,
    successUrl,
    failureUrl,
    productServiceCharge = 0,
    productDeliveryCharge = 0,
    transactionUuid = uuidv4().replace(/-/g, '').substring(0, 12) // Limit to 12 chars
  } = options;

  // Additional validation
  if (taxAmount < 0) {
    throw new PaymentError(
      PaymentErrorCode.INVALID_AMOUNT,
      'Tax amount cannot be negative',
      'ESEWA'
    );
  }

  if (productServiceCharge < 0) {
    throw new PaymentError(
      PaymentErrorCode.INVALID_AMOUNT,
      'Service charge cannot be negative',
      'ESEWA'
    );
  }

  if (productDeliveryCharge < 0) {
    throw new PaymentError(
      PaymentErrorCode.INVALID_AMOUNT,
      'Delivery charge cannot be negative',
      'ESEWA'
    );
  }

  const totalAmount = amount + taxAmount;

  if (!paymentConfig.esewa.merchantSecret) {
    throw new PaymentError(
      PaymentErrorCode.INVALID_CONFIG,
      'eSewa merchant secret is required for signature generation',
      'ESEWA'
    );
  }

  const signature = generateEsewaSignature(
    totalAmount.toString(),
    transactionUuid,
    productCode,
    paymentConfig.esewa.merchantSecret
  );

  const formData = {
    amount: amount.toFixed(2),
    tax_amount: taxAmount.toFixed(2),
    total_amount: totalAmount.toFixed(2),
    product_service_charge: productServiceCharge.toFixed(2),
    product_delivery_charge: productDeliveryCharge.toFixed(2),
    success_url: successUrl,
    failure_url: failureUrl,
    product_code: productCode,
    transaction_uuid: transactionUuid,
    signed_field_names: 'total_amount,transaction_uuid,product_code',
    signature
  };

  const esewaUrl = paymentConfig.isTest ? API_ENDPOINTS.ESEWA.TEST : API_ENDPOINTS.ESEWA.LIVE;

  // Generate a hidden HTML form that can be submitted to eSewa
  const formHtml = `
    <form id="esewaForm" action="${esewaUrl}" method="POST">
      ${Object.entries(formData)
        .map(([key, value]) => `<input type="hidden" name="${key}" value="${value}" />`)
        .join('\n')}
    </form>
    <script>
      document.getElementById("esewaForm").submit();
    </script>
  `;

  return formHtml;
}
