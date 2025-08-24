import axios, { AxiosInstance, AxiosResponse } from 'axios';
import config from '../config';
import {
  DLocalPaymentRequest,
  DLocalPaymentResponse,
  PaymentStatus,
  ApiResponse,
  ErrorResponse,
} from '../types';
import {
  generateDLocalSignature,
  generateTimestamp,
  formatAmountForDLocal,
  formatAmountFromDLocal,
} from '../utils/helpers';

export class DLocalService {
  private api: AxiosInstance;
  private xLogin: string;
  private xTransKey: string;
  constructor() {
    this.xLogin = config.dlocal.xLogin;
    this.xTransKey = config.dlocal.xTransKey;

    this.api = axios.create({
      baseURL: 'https://api-sbx.dlocalgo.com',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.xLogin}:${this.xTransKey}`,
      },
    });
  }

  /**
   * Crea un pago en DLocal
   */
  async createPayment(paymentData: DLocalPaymentRequest): Promise<ApiResponse<DLocalPaymentResponse>> {
    try {
      // Formatear el monto a centavos
      const formattedPaymentData = {
        ...paymentData,
        amount: formatAmountForDLocal(paymentData.amount),
      };

      const response: AxiosResponse<DLocalPaymentResponse> = await this.api.post(
        '/v1/payments',
        formattedPaymentData
      );

      // Formatear la respuesta
      const responseData = {
        ...response.data,
        amount: formatAmountFromDLocal(response.data.amount),
      };

      return {
        success: true,
        data: responseData,
        message: 'Payment created successfully',
      };
    } catch (error: any) {
      console.error('Error creating payment:', error);
      return this.handleError(error);
    }
  }

  /**
   * Obtiene el estado de un pago
   */
  async getPaymentStatus(paymentId: string): Promise<ApiResponse<PaymentStatus>> {
    try {
      const response: AxiosResponse<DLocalPaymentResponse> = await this.api.get(
        `/payments/${paymentId}`
      );

      const paymentStatus: PaymentStatus = {
        id: response.data.id,
        status: response.data.status,
        statusDetail: response.data.status_detail,
        amount: formatAmountFromDLocal(response.data.amount),
        currency: response.data.currency,
        orderId: response.data.order_id,
        createdDate: response.data.created_date,
        approvedDate: response.data.approved_date,
      };

      return {
        success: true,
        data: paymentStatus,
        message: 'Payment status retrieved successfully',
      };
    } catch (error: any) {
      console.error('Error getting payment status:', error);
      return this.handleError(error);
    }
  }

  /**
   * Cancela un pago
   */
  async cancelPayment(paymentId: string): Promise<ApiResponse<void>> {
    try {
      await this.api.post(`/payments/${paymentId}/cancel`);

      return {
        success: true,
        message: 'Payment cancelled successfully',
      };
    } catch (error: any) {
      console.error('Error cancelling payment:', error);
      return this.handleError(error);
    }
  }

  /**
   * Obtiene los métodos de pago disponibles para un país
   */
  async getPaymentMethods(country: string): Promise<ApiResponse<any[]>> {
    try {
      const response = await this.api.get(`/payment-methods?country=${country}`);

      return {
        success: true,
        data: response.data,
        message: 'Payment methods retrieved successfully',
      };
    } catch (error: any) {
      console.error('Error getting payment methods:', error);
      return this.handleError(error);
    }
  }

  /**
   * Maneja los errores de la API de DLocal
   */
  private handleError(error: any): ErrorResponse {
    if (error.response) {
      // Error de respuesta de la API
      const { status, data } = error.response;
      return {
        success: false,
        error: data.message || `API Error: ${status}`,
        details: data.errors || [],
      };
    } else if (error.request) {
      // Error de red
      return {
        success: false,
        error: 'Network error - unable to reach DLocal API',
      };
    } else {
      // Error interno
      return {
        success: false,
        error: error.message || 'Internal server error',
      };
    }
  }
}

export default new DLocalService();
