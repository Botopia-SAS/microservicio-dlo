import axios, { AxiosInstance, AxiosResponse } from 'axios';
import config from '../config';
import {
  DLocalSubscriptionPlanRequest,
  DLocalSubscriptionPlanResponse,
  DLocalPlansListResponse,
  ApiResponse,
} from '../types';

export class DLocalSubscriptionService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: 'https://api-sbx.dlocalgo.com',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.dlocal.xLogin}:${config.dlocal.xTransKey}`,
      },
    });
  }

  /**
   * Crea un plan de suscripción
   */
  async createPlan(planData: DLocalSubscriptionPlanRequest): Promise<ApiResponse<DLocalSubscriptionPlanResponse>> {
    try {
      const response: AxiosResponse<DLocalSubscriptionPlanResponse> = await this.api.post(
        '/v1/subscription/plan',
        planData
      );

      return {
        success: true,
        data: response.data,
        message: 'Subscription plan created successfully',
      };
    } catch (error: any) {
      console.error('Error creating subscription plan:', error);
      return this.handleError(error);
    }
  }

  /**
   * Obtiene todos los planes de suscripción
   */
  async getAllPlans(page: number = 1, pageSize: number = 10): Promise<ApiResponse<DLocalPlansListResponse>> {
    try {
      const response: AxiosResponse<DLocalPlansListResponse> = await this.api.get(
        `/v1/subscription/plan/all?page=${page}&page_size=${pageSize}`
      );

      return {
        success: true,
        data: response.data,
        message: 'Plans retrieved successfully',
      };
    } catch (error: any) {
      console.error('Error getting subscription plans:', error);
      return this.handleError(error);
    }
  }

  /**
   * Obtiene un plan específico por ID
   */
  async getPlan(planId: string): Promise<ApiResponse<DLocalSubscriptionPlanResponse>> {
    try {
      const response: AxiosResponse<DLocalSubscriptionPlanResponse> = await this.api.get(
        `/v1/subscription/plan/${planId}`
      );

      return {
        success: true,
        data: response.data,
        message: 'Plan retrieved successfully',
      };
    } catch (error: any) {
      console.error('Error getting subscription plan:', error);
      return this.handleError(error);
    }
  }

  /**
   * Actualiza un plan de suscripción
   */
  async updatePlan(planId: string, planData: Partial<DLocalSubscriptionPlanRequest>): Promise<ApiResponse<DLocalSubscriptionPlanResponse>> {
    try {
      const response: AxiosResponse<DLocalSubscriptionPlanResponse> = await this.api.put(
        `/v1/subscription/plan/${planId}`,
        planData
      );

      return {
        success: true,
        data: response.data,
        message: 'Plan updated successfully',
      };
    } catch (error: any) {
      console.error('Error updating subscription plan:', error);
      return this.handleError(error);
    }
  }

  /**
   * Elimina un plan de suscripción
   */
  async deletePlan(planId: string): Promise<ApiResponse<void>> {
    try {
      await this.api.delete(`/v1/subscription/plan/${planId}`);

      return {
        success: true,
        message: 'Plan deleted successfully',
      };
    } catch (error: any) {
      console.error('Error deleting subscription plan:', error);
      return this.handleError(error);
    }
  }

  /**
   * Maneja errores de la API
   */
  private handleError(error: any): ApiResponse<any> {
    if (error.response) {
      return {
        success: false,
        error: 'API Error',
        message: error.response.data?.message || 'Unknown API error',
      };
    }

    if (error.request) {
      return {
        success: false,
        error: 'Network Error',
        message: 'No response received from DLocal API',
      };
    }

    return {
      success: false,
      error: 'Request Error',
      message: error.message || 'Unknown error occurred',
    };
  }
}

export default new DLocalSubscriptionService();
