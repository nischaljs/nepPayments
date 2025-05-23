/**
 * Available payment gateways
 */
export enum PaymentGateway {
  KHALTI = 'KHALTI',
  ESEWA = 'ESEWA',
  FONEPAY = 'FONEPAY'
}

/**
 * Payment status types
 */
export enum PaymentStatus {
  COMPLETED = 'COMPLETED',
  PENDING = 'PENDING',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
  CANCELED = 'CANCELED',
  REFUNDED = 'REFUNDED'
}
