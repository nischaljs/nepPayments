import axios, { AxiosError } from 'axios';
import { API_ENDPOINTS, paymentConfig } from '../config';
import { PaymentError, PaymentErrorCode } from '../errors/PaymentError';
import {
  EsewaVerificationParams,
  FonepayVerificationParams,
  KhaltiVerificationParams,
  PaymentVerificationResult
} from '../types/payment.types';
import { generateEsewaSignature } from '../utils/signatureGenerator';

export async function verifyKhaltiPayment(
  params: KhaltiVerificationParams
): Promise<PaymentVerificationResult> {
  if (!paymentConfig.khalti) {
    throw new PaymentError(
      PaymentErrorCode.GATEWAY_NOT_CONFIGURED,
      'Khalti gateway is not configured',
      'KHALTI'
    );
  }

  try {
    const response = await axios.post(
      `${paymentConfig.isTest ? API_ENDPOINTS.KHALTI.TEST : API_ENDPOINTS.KHALTI.LIVE}/lookup/`,
      {
        pidx: params.pidx
      },
      {
        headers: {
          Authorization: `Key ${paymentConfig.khalti.secretKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const { status, amount, transaction_id } = response.data;

    return {
      success: status === 'Completed',
      message: `Payment ${status.toLowerCase()}`,
      transactionId: transaction_id || params.transaction_id || '',
      amount: amount / 100, // Convert paisa to rupees
      status: mapKhaltiStatus(status),
      gatewayResponse: response.data
    };
  } catch (error) {
    handleVerificationError(error, 'KHALTI');
  }
}

export async function verifyEsewaPayment(
  params: EsewaVerificationParams
): Promise<PaymentVerificationResult> {
  if (!paymentConfig.esewa) {
    throw new PaymentError(
      PaymentErrorCode.GATEWAY_NOT_CONFIGURED,
      'eSewa gateway is not configured',
      'ESEWA'
    );
  }

  try {
    // For eSewa, we need to verify the signature of the response
    const signature = generateEsewaSignature(
      params.amt,
      params.oid,
      paymentConfig.esewa.merchantCode,
      paymentConfig.esewa.merchantSecret || ''
    );

    const response = await axios.post(
      `${paymentConfig.isTest ? API_ENDPOINTS.ESEWA.TEST : API_ENDPOINTS.ESEWA.LIVE}/verify`,
      {
        amount: params.amt,
        orderCode: params.oid,
        referenceId: params.refId,
        signature
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: response.data.success,
      message: response.data.message || 'Payment verification completed',
      transactionId: params.oid,
      amount: parseFloat(params.amt),
      status: response.data.success ? 'completed' : 'failed',
      gatewayResponse: response.data
    };
  } catch (error) {
    handleVerificationError(error, 'ESEWA');
  }
}

export async function verifyFonepayPayment(
  params: FonepayVerificationParams
): Promise<PaymentVerificationResult> {
  if (!paymentConfig.fonepay) {
    throw new PaymentError(
      PaymentErrorCode.GATEWAY_NOT_CONFIGURED,
      'Fonepay gateway is not configured',
      'FONEPAY'
    );
  }

  try {
    const response = await axios.post(
      `${paymentConfig.isTest ? API_ENDPOINTS.FONEPAY.TEST : API_ENDPOINTS.FONEPAY.LIVE}/verify`,
      {
        PRN: params.PRN,
        PID: params.PID,
        BID: params.BID,
        AMT: params.AMT,
        UID: params.UID,
        DV: params.DV
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${paymentConfig.fonepay.secretKey}`
        }
      }
    );

    return {
      success: response.data.status === 'success',
      message: response.data.message || 'Payment verification completed',
      transactionId: params.PRN,
      amount: parseFloat(params.AMT),
      status: mapFonepayStatus(response.data.status),
      gatewayResponse: response.data
    };
  } catch (error) {
    handleVerificationError(error, 'FONEPAY');
  }
}

function mapKhaltiStatus(status: string): PaymentVerificationResult['status'] {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'completed';
    case 'pending':
      return 'pending';
    case 'expired':
      return 'expired';
    case 'cancelled':
      return 'cancelled';
    case 'refunded':
      return 'refunded';
    default:
      return 'failed';
  }
}

function mapFonepayStatus(status: string): PaymentVerificationResult['status'] {
  switch (status.toLowerCase()) {
    case 'success':
      return 'completed';
    case 'pending':
      return 'pending';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'failed';
  }
}

function handleVerificationError(error: any, gateway: string): never {
  if (error instanceof PaymentError) {
    throw error;
  }

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<any>;
    throw new PaymentError(
      PaymentErrorCode.GATEWAY_ERROR,
      axiosError.response?.data?.message || `Failed to verify ${gateway} payment`,
      gateway,
      axiosError.response?.data
    );
  }

  throw new PaymentError(
    PaymentErrorCode.UNKNOWN_ERROR,
    `Unknown error occurred while verifying ${gateway} payment`,
    gateway,
    error
  );
}
