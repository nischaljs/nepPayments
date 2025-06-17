import { PaymentError, PaymentErrorCode } from '../errors/PaymentError';

/**
 * Validate payment amount
 * @param amount Amount in paisa
 * @param gateway Payment gateway name
 */
export function validateAmount(amount: number, gateway: string): void {
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new PaymentError(
      PaymentErrorCode.INVALID_AMOUNT,
      'Payment amount must be a valid number',
      gateway
    );
  }

  if (amount < 1000) {
    throw new PaymentError(
      PaymentErrorCode.INVALID_AMOUNT,
      'Amount should be greater than Rs. 10 (1000 paisa)',
      gateway
    );
  }
}

/**
 * Validate URL
 * @param url URL to validate
 * @param fieldName Name of the field for error message
 * @param gateway Payment gateway name
 */
export function validateUrl(url: string, fieldName: string, gateway: string): void {
  try {
    new URL(url);
  } catch {
    throw new PaymentError(
      PaymentErrorCode.INVALID_URL,
      `Invalid ${fieldName} URL: ${url}. Must be a valid absolute URL`,
      gateway
    );
  }
}

/**
 * Validate required field
 * @param value Field value
 * @param fieldName Name of the field
 * @param gateway Payment gateway name
 */
export function validateRequiredField(value: unknown, fieldName: string, gateway: string): void {
  if (value === undefined || value === null || value === '') {
    throw new PaymentError(
      PaymentErrorCode.VALIDATION_ERROR,
      `Missing required field: ${fieldName}`,
      gateway,
      { field: fieldName }
    );
  }
}

/**
 * Validate customer info
 * @param customerInfo Customer information
 * @param gateway Payment gateway name
 */
export function validateCustomerInfo(customerInfo: { name?: string; email?: string; phone?: string }, gateway: string): void {
  if (customerInfo.name && typeof customerInfo.name !== 'string') {
    throw new PaymentError(
      PaymentErrorCode.VALIDATION_ERROR,
      'Customer name must be a string',
      gateway
    );
  }

  if (customerInfo.email && typeof customerInfo.email !== 'string') {
    throw new PaymentError(
      PaymentErrorCode.VALIDATION_ERROR,
      'Customer email must be a string',
      gateway
    );
  }

  if (customerInfo.phone && typeof customerInfo.phone !== 'string') {
    throw new PaymentError(
      PaymentErrorCode.VALIDATION_ERROR,
      'Customer phone must be a string',
      gateway
    );
  }
}

/**
 * Validate amount breakdown
 * @param amountBreakdown Amount breakdown array
 * @param totalAmount Total amount
 * @param gateway Payment gateway name
 */
export function validateAmountBreakdown(
  amountBreakdown: Array<{ label: string; amount: number }>,
  totalAmount: number,
  gateway: string
): void {
  if (!Array.isArray(amountBreakdown)) {
    throw new PaymentError(
      PaymentErrorCode.VALIDATION_ERROR,
      'Amount breakdown must be an array',
      gateway
    );
  }

  const sum = amountBreakdown.reduce((acc, item) => acc + item.amount, 0);
  if (sum !== totalAmount) {
    throw new PaymentError(
      PaymentErrorCode.AMOUNT_MISMATCH,
      'Sum of amount breakdown must equal total amount',
      gateway
    );
  }
}

/**
 * Validate product details
 * @param productDetails Product details array
 * @param gateway Payment gateway name
 */
export function validateProductDetails(
  productDetails: Array<{
    identity: string;
    name: string;
    total_price: number;
    quantity: number;
    unit_price: number;
  }>,
  gateway: string
): void {
  if (!Array.isArray(productDetails)) {
    throw new PaymentError(
      PaymentErrorCode.VALIDATION_ERROR,
      'Product details must be an array',
      gateway
    );
  }

  for (const product of productDetails) {
    if (typeof product.identity !== 'string') {
      throw new PaymentError(
        PaymentErrorCode.VALIDATION_ERROR,
        'Product identity must be a string',
        gateway
      );
    }

    if (typeof product.name !== 'string') {
      throw new PaymentError(
        PaymentErrorCode.VALIDATION_ERROR,
        'Product name must be a string',
        gateway
      );
    }

    if (typeof product.total_price !== 'number' || isNaN(product.total_price)) {
      throw new PaymentError(
        PaymentErrorCode.VALIDATION_ERROR,
        'Product total price must be a number',
        gateway
      );
    }

    if (typeof product.quantity !== 'number' || isNaN(product.quantity)) {
      throw new PaymentError(
        PaymentErrorCode.VALIDATION_ERROR,
        'Product quantity must be a number',
        gateway
      );
    }

    if (typeof product.unit_price !== 'number' || isNaN(product.unit_price)) {
      throw new PaymentError(
        PaymentErrorCode.VALIDATION_ERROR,
        'Product unit price must be a number',
        gateway
      );
    }
  }
}
