export interface KhaltiPaymentParams {
  amount: number;
  returnUrl: string;
  purchaseOrderId: string;
  purchaseOrderName: string;
}

export interface KhaltiVerificationParams {
  pidx: string;
  amount: number;
}

export interface EsewaPaymentParams {
  amount: number;
  returnUrl: string;
  purchaseOrderId: string;
  purchaseOrderName: string;
}

export interface EsewaVerificationParams {
  refId: string;
  amount: number;
}

export interface FonepayPaymentParams {
  amount: number;
  returnUrl: string;
  purchaseOrderId: string;
  purchaseOrderName: string;
}

export interface FonepayVerificationParams {
  refId: string;
  amount: number;
}

export interface PaymentVerificationResult {
  status: 'success' | 'failed';
  amount: number;
  transactionId: string;
}
