import axios from 'axios';
import { PaymentError, PaymentErrorCode } from '../types/payment.enums';
import { 
  EsewaConfig, 
  EsewaPaymentOptions, 
  EsewaPaymentResponse,
  EsewaVerificationOptions,
  PaymentVerificationResponse
} from '../types/payment.types';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  refresh_expires_in: number;
}

interface PaymentResponse {
  token: string;
  request_id: string;
  response_code: number;
  response_message: string;
  amount: number;
  properties: Record<string, string>;
  packages?: Array<{
    display: string;
    value: number;
    properties: Record<string, string>;
  }>;
}

interface VerificationResponse {
  response_code: number;
  response_message: string;
  transaction_id: string;
  amount: number;
}

interface ApiError {
  response_message?: string;
  response_code?: number;
}

function isApiError(error: unknown): error is ApiError {
  return typeof error === 'object' && error !== null && 
    ('response_message' in error || 'response_code' in error);
}

/**
 * eSewa payment gateway implementation
 */
export class EsewaGateway {
  private readonly baseUrl: string;
  private accessToken?: string;
  private refreshToken?: string;
  private tokenExpiry?: number;

  /**
   * Create a new eSewa gateway instance
   * @param config eSewa configuration
   */
  constructor(private readonly config: EsewaConfig) {
    if (!config.username || !config.password || !config.clientSecret) {
      throw new PaymentError(
        'eSewa username, password and client secret are required',
        PaymentErrorCode.INVALID_CONFIG
      );
    }

    // Validate client secret length
    const decodedSecret = Buffer.from(config.clientSecret, 'base64').toString();
    if (decodedSecret.length < 32 || decodedSecret.length > 64) {
      throw new PaymentError(
        'Client secret must be base64 encoded and 32-64 characters long',
        PaymentErrorCode.INVALID_CONFIG
      );
    }

    // Set base URL based on environment
    this.baseUrl = config.environment === 'sandbox'
      ? 'https://uat.esewa.com.np/api'
      : 'https://esewa.com.np/api';
  }

  /**
   * Get authentication token
   * @private
   */
  private async getAuthToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // If we have a refresh token, try to use it
    if (this.refreshToken) {
      try {
        const response = await axios.post<TokenResponse>(`${this.baseUrl}/access-token`, {
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
          client_secret: this.config.clientSecret
        });

        this.accessToken = response.data.access_token;
        this.refreshToken = response.data.refresh_token;
        this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
        return this.accessToken;
      } catch (error) {
        // If refresh fails, we'll get a new token
        this.refreshToken = undefined;
      }
    }

    // Get new token
    try {
      const response = await axios.post<TokenResponse>(`${this.baseUrl}/access-token`, {
        grant_type: 'password',
        client_secret: this.config.clientSecret,
        username: this.config.username,
        password: this.config.password
      });

      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
      return this.accessToken;
    } catch (error) {
      if (isApiError(error)) {
        throw new PaymentError(
          error.response_message || 'Authentication failed',
          PaymentErrorCode.AUTHENTICATION_ERROR
        );
      }
      throw new PaymentError('Authentication failed', PaymentErrorCode.AUTHENTICATION_ERROR);
    }
  }

  /**
   * Create a new payment
   * @param options Payment options
   * @returns Payment response with token and request ID
   */
  async createPayment(options: EsewaPaymentOptions): Promise<EsewaPaymentResponse> {
    try {
      const token = await this.getAuthToken();
      const response = await axios.post<PaymentResponse>(
        `${this.baseUrl}/inquiry`,
        {
          request_id: options.request_id,
          amount: options.amount,
          properties: options.properties
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.response_code !== 0) {
        throw new PaymentError(
          response.data.response_message || 'Failed to create payment',
          PaymentErrorCode.PAYMENT_FAILED
        );
      }

      return {
        token: response.data.token,
        request_id: response.data.request_id,
        amount: response.data.amount,
        properties: response.data.properties,
        packages: response.data.packages
      };
    } catch (error) {
      if (isApiError(error)) {
        throw new PaymentError(
          error.response_message || 'Failed to create payment',
          PaymentErrorCode.PAYMENT_FAILED
        );
      }
      throw new PaymentError('Failed to create payment', PaymentErrorCode.PAYMENT_FAILED);
    }
  }

  /**
   * Verify a payment
   * @param options Verification options
   * @returns Payment verification response
   */
  async verifyPayment(options: EsewaVerificationOptions): Promise<PaymentVerificationResponse> {
    try {
      const token = await this.getAuthToken();
      const response = await axios.post<VerificationResponse>(
        `${this.baseUrl}/payment`,
        {
          request_id: options.request_id,
          amount: options.amount,
          transaction_code: options.transaction_code
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const payment = response.data;

      return {
        status: payment.response_code === 0 ? 'COMPLETED' : 'FAILED',
        transaction_id: payment.transaction_id,
        amount: payment.amount,
        payment_details: payment
      };
    } catch (error) {
      if (isApiError(error)) {
        throw new PaymentError(
          error.response_message || 'Failed to verify payment',
          PaymentErrorCode.VERIFICATION_FAILED
        );
      }
      throw new PaymentError('Failed to verify payment', PaymentErrorCode.VERIFICATION_FAILED);
    }
  }
}
