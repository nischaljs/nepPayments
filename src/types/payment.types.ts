export type KhaltiPaymentOptions = {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  amount: number; // in rupees (will convert to paisa internally)
  productIdentity: string;
  productName: string;
  productUrl?: string;
  returnUrl: string;
  websiteUrl: string;
  purchaseOrderId?: string;
  purchaseOrderName?: string;
};

export type EsewaPaymentOptions = {
  amount: number; // in rupees (before tax)
  taxAmount?: number; // optional tax amount
  productCode: string; // usually EPAYTEST for test
  transactionUuid?: string; // auto-generated if not provided
  successUrl: string;
  failureUrl: string;
  productServiceCharge?: number; // optional
  productDeliveryCharge?: number; // optional
};

export type FonepayPaymentOptions = {
  customerName: string;
  amount: number;
  transactionId: string;
  returnUrl: string;
};

export interface PaymentVerificationResult {
  success: boolean;
  message: string;
  transactionId: string;
  amount: number;
  status: 'completed' | 'pending' | 'failed' | 'expired' | 'cancelled' | 'refunded';
  gatewayResponse?: any;
}

export interface KhaltiVerificationParams {
  pidx: string;
  transaction_id?: string;
}

export interface EsewaVerificationParams {
  oid: string;
  amt: string;
  refId: string;
}

export interface FonepayVerificationParams {
  PRN: string; // Transaction ID/Reference
  PID: string; // Merchant ID
  BID: string; // Bank ID
  AMT: string; // Amount
  UID: string; // Unique ID
  DV: string; // Currency
}
