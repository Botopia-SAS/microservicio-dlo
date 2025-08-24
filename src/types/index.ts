// Tipos para DLocal API

// Tipos para Suscripciones
export interface DLocalSubscriptionPlanRequest {
  name: string;
  description?: string;
  country?: string; // Opcional para permitir selector automático de país
  currency: string;
  amount: number;
  frequency_type: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  frequency_value: number;
  active?: boolean;
  free_trial_days?: number;
  notification_url?: string;
  back_url?: string;
  success_url?: string;
  error_url?: string;
}

export interface DLocalSubscriptionPlanResponse {
  id: number;
  merchant_id: number;
  name: string;
  description: string;
  country: string;
  currency: string;
  amount: number;
  frequency_type: string;
  frequency_value: number;
  active: boolean;
  free_trial_days: number;
  plan_token: string;
  created_at: string;
  updated_at: string;
  notification_url: string;
  subscribe_url: string;
  back_url: string;
  success_url: string;
  error_url: string;
}

export interface DLocalPlansListResponse {
  data: DLocalSubscriptionPlanResponse[];
  total_elements: number;
  total_pages: number;
  page: number;
  number_of_elements: number;
  size: number;
}

// Tipos para Pagos (mantenidos para compatibilidad)
export interface DLocalPaymentRequest {
  amount: number;
  currency: string;
  country: string;
  payment_method_id?: string;
  payment_method_flow?: string;
  payer?: {
    name: string;
    email: string;
    document?: string;
    phone?: string;
    address?: {
      street: string;
      city: string;
      state: string;
      zip_code: string;
    };
  };
  order_id: string;
  description?: string;
  notification_url?: string;
  success_url?: string;
  back_url?: string;
  error_url?: string;
  cancel_url?: string;
}

export interface DLocalPaymentResponse {
  id: string;
  amount: number;
  currency: string;
  country: string;
  payment_method_id: string;
  payment_method_flow: string;
  payer: {
    name: string;
    email: string;
    document?: string;
    phone?: string;
  };
  order_id: string;
  description?: string;
  status: string;
  status_detail: string;
  status_code: string;
  created_date: string;
  approved_date?: string;
  live_mode: boolean;
  redirect_url?: string;
}

export interface DLocalWebhookPayload {
  id: string;
  type: string;
  created_date: string;
  object: {
    id: string;
    amount: number;
    currency: string;
    country: string;
    payment_method_id: string;
    payment_method_flow: string;
    payer: {
      name: string;
      email: string;
      document?: string;
    };
    order_id: string;
    status: string;
    status_detail: string;
    status_code: string;
    created_date: string;
    approved_date?: string;
  };
}

export interface PaymentRequestBody {
  amount: number;
  currency?: string;
  country?: string;
  payer: {
    name: string;
    email: string;
    document?: string;
    phone?: string;
  };
  orderId: string;
  description?: string;
  successUrl?: string;
  errorUrl?: string;
  cancelUrl?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaymentStatus {
  id: string;
  status: string;
  statusDetail: string;
  amount: number;
  currency: string;
  orderId: string;
  createdDate: string;
  approvedDate?: string;
}

// Enums para estados de pago
export enum PaymentStatusEnum {
  PENDING = 'PENDING',
  PAID = 'PAID',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum PaymentMethodFlow {
  DIRECT = 'DIRECT',
  REDIRECT = 'REDIRECT',
  IFRAME = 'IFRAME',
}

// Tipos para errores
export interface DLocalError {
  code: number;
  message: string;
  param?: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
  details?: DLocalError[];
}
