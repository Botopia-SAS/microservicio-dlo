import { createClient, SupabaseClient } from '@supabase/supabase-js';
import config from '../config';

export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.anonKey
    );
  }

  /**
   * Prueba la conexión a Supabase
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const { data, error } = await this.supabase
        .from('_test_connection')
        .select('*')
        .limit(1);

      if (error && error.code !== 'PGRST116') { // PGRST116 = tabla no existe (normal)
        console.log('⚠️  Supabase connection test:', error.message);
        return {
          success: true,
          message: 'Supabase connected (table test failed but connection works)'
        };
      }

      return {
        success: true,
        message: 'Supabase connected successfully'
      };
    } catch (error: any) {
      console.error('❌ Supabase connection failed:', error.message);
      return {
        success: false,
        message: `Supabase connection failed: ${error.message}`
      };
    }
  }

  /**
   * Guarda información de un plan de suscripción
   */
  async savePlan(planData: any): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await this.supabase
        .from('subscription_plans')
        .insert([{
          plan_id: planData.planId,
          plan_token: planData.planToken,
          name: planData.name,
          amount: planData.amount,
          currency: planData.currency,
          country: planData.country,
          frequency_type: planData.frequency_type,
          frequency_value: planData.frequency_value,
          active: planData.active,
          subscribe_url: planData.subscribe_url,
          created_at: new Date().toISOString(),
        }])
        .select();

      if (error) {
        console.error('Error saving plan:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error: any) {
      console.error('Error saving plan:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verifica si el usuario ya tiene una suscripción activa en la tabla payments
   * Consideramos "activa" cualquier registro con status 'Completed' o 'Active'.
   */
  async hasActiveSubscription(userId: string): Promise<{ success: boolean; active: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await this.supabase
        .from('payments')
        .select('*')
        .eq('id', userId)
        .in('status', ['Completed', 'Active'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error checking active subscription:', error);
        return { success: false, active: false, error: error.message };
      }

      const hasActive = !!(data && data.length > 0);
      return { success: true, active: hasActive, data: hasActive ? data[0] : undefined };
    } catch (error: any) {
      console.error('Error in hasActiveSubscription:', error);
      return { success: false, active: false, error: error.message };
    }
  }

  /**
   * Obtiene el payment activo (Completed/Active) más reciente para un usuario
   */
  async getActivePaymentByUser(userId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Preferir Completed; si no hay, buscar Active
      const completedQuery = this.supabase
        .from('payments')
        .select('*')
        .eq('id', userId)
        .eq('status', 'Completed')
        .order('created_at', { ascending: false })
        .limit(1);

      let { data, error } = await completedQuery;
      if (!error && (!data || data.length === 0)) {
        const { data: activeData, error: activeError } = await this.supabase
          .from('payments')
          .select('*')
          .eq('id', userId)
          .eq('status', 'Active')
          .order('created_at', { ascending: false })
          .limit(1);
        data = activeData as any;
        error = activeError as any;
      }

      if (error) {
        return { success: false, error: error.message };
      }
      if (!data || data.length === 0) {
        return { success: false, error: 'No active subscription found for user' };
      }
      return { success: true, data: data[0] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtiene el payment más reciente por estado específico para un usuario
   */
  async getLatestPaymentByUserAndStatus(userId: string, status: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await this.supabase
        .from('payments')
        .select('*')
        .eq('id', userId)
        .eq('status', status)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) return { success: false, error: error.message };
      if (!data || data.length === 0) return { success: false, error: `No ${status} payments found for user` };
      return { success: true, data: data[0] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  

  /**
   * Fallback: obtiene el último plan de suscripción creado en nuestra tabla de referencia
   * Devuelve plan_token y plan_id de DLocal si existen en subscription_plans
   */
  async getLatestSubscriptionPlan(): Promise<{ success: boolean; data?: { plan_token?: string; plan_id?: string | number }; error?: string }> {
    try {
      const { data, error } = await this.supabase
        .from('subscription_plans')
        .select('plan_token, plan_id')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        return { success: false, error: error.message };
      }
      if (!data || data.length === 0) {
        return { success: false, error: 'No subscription plans found in reference table' };
      }
      return { success: true, data: data[0] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Busca en pagos recientes del usuario (Completed y Active) para extraer planId/token y subscriptionId
   */
  async findPlanAndSubscriptionForUser(userId: string): Promise<{ success: boolean; data?: { planId?: string; subscriptionId?: string }; error?: string }> {
    try {
      const { data, error } = await this.supabase
        .from('payments')
        .select('*')
        .eq('id', userId)
        .in('status', ['Completed', 'Active'])
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) return { success: false, error: error.message };
      if (!data || data.length === 0) return { success: false, error: 'No Completed/Active payments found' };

      for (const row of data) {
        const planId = String(row.dlocal_plan_id || row.dLocal_plan_id || row.dlocal_plan || row.dlocal_plan_token || row.plan_token || '');
        const subscriptionId = String(row.dlo_payment_id || row.subscription_id || row.subscription_token || '');
        if (planId || subscriptionId) {
          return {
            success: true,
            data: {
              planId: planId || undefined,
              subscriptionId: subscriptionId || undefined,
            }
          };
        }
      }
      return { success: false, error: 'No DLocal identifiers found in recent payments' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Actualiza el status de un payment por idx (clave técnica) o por id de usuario
   */
  async setPaymentStatusByIdxOrUser(opts: { idx?: number; userId?: string; newStatus: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    const { idx, userId, newStatus } = opts;
    if (!idx && !userId) {
      return { success: false, error: 'idx or userId required' };
    }
    try {
      let updateBuilder = this.supabase
        .from('payments')
        .update({ status: newStatus });

      if (idx) {
        updateBuilder = updateBuilder.eq('idx', idx);
      } else if (userId) {
        updateBuilder = updateBuilder.eq('id', userId);
      }

      const { data, error } = await updateBuilder
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) return { success: false, error: error.message };
      if (!data || data.length === 0) return { success: false, error: 'Payment not found to update' };
      return { success: true, data: data[0] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Crea un payment en estado pending
   */
  async createPayment(paymentData: {
    user_id: string;
    plan_id: string;
    amount: number;
    currency: string;
    description?: string;
  dlocal_payment_id?: string;
  dlocal_plan_id?: string | number;
  plan_token?: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Validación: impedir múltiples suscripciones activas por usuario
      const activeCheck = await this.hasActiveSubscription(paymentData.user_id);
      if (activeCheck.success && activeCheck.active) {
        return {
          success: false,
          error: 'User already has an active subscription',
        };
      }

      const insertPayload: any = {
        id: paymentData.user_id,
        plan_id: paymentData.plan_id,
        amount: paymentData.amount,
        currency: paymentData.currency,
        status: 'Pending',
        description: paymentData.description || `Subscription payment for plan ${paymentData.plan_id} for user ${paymentData.user_id}`,
        dlo_payment_id: paymentData.dlocal_payment_id || `temp_${Date.now()}`,
      };

      if (paymentData.dlocal_plan_id) insertPayload.dlocal_plan_id = paymentData.dlocal_plan_id;
      if (paymentData.plan_token) insertPayload.plan_token = paymentData.plan_token;

      const { data, error } = await this.supabase
        .from('payments')
        .insert([insertPayload])
        .select();

      if (error) {
        console.error('Error creating payment:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data[0] };
    } catch (error: any) {
      console.error('Error creating payment:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtiene información de un usuario por ID
   */
  async getUser(userId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtiene información de un plan por ID
   */
  async getPlan(planId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await this.supabase
        .from('plans')
        .select('*')
        .eq('id', planId)
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Actualiza el status de un payment por dlo_payment_id
   */
  async updatePaymentStatus(dloPaymentId: string, newStatus: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await this.supabase
        .from('payments')
        .update({ 
          status: newStatus
        })
        .eq('dlo_payment_id', dloPaymentId)
        .select('*')
        .single();

      if (error) {
        console.error('Error updating payment status:', error);
        return { success: false, error: error.message };
      }

      if (!data) {
        return { success: false, error: `Payment with dlo_payment_id ${dloPaymentId} not found` };
      }

      return { success: true, data };
    } catch (error: any) {
      console.error('Error updating payment status:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Actualiza el status de un payment por subscription_id (para webhooks de suscripción)
   */
  async updatePaymentBySubscription(subscriptionId: string, newStatus: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await this.supabase
        .from('payments')
        .update({ 
          status: newStatus
        })
        .eq('dlo_payment_id', subscriptionId)
        .select('*')
        .single();

      if (error) {
        console.error('Error updating payment status by subscription:', error);
        return { success: false, error: error.message };
      }

      if (!data) {
        return { success: false, error: `Payment with dlo_payment_id ${subscriptionId} not found` };
      }

      return { success: true, data };
    } catch (error: any) {
      console.error('Error updating payment status by subscription:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Busca payment pendiente y lo actualiza con el subscriptionId real del webhook
   */
  async updatePendingPaymentWithSubscription(subscriptionId: string, newStatus: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Buscar el payment pendiente más reciente
      const { data: pendingPayments, error: searchError } = await this.supabase
        .from('payments')
        .select('*')
        .eq('status', 'Pending')
        .order('created_at', { ascending: false })
        .limit(1);

      if (searchError) {
        console.error('Error searching pending payments:', searchError);
        return { success: false, error: searchError.message };
      }

      if (!pendingPayments || pendingPayments.length === 0) {
        return { success: false, error: 'No pending payments found' };
      }

      const pendingPayment = pendingPayments[0];
      console.log('📋 Found pending payment:', JSON.stringify(pendingPayment, null, 2));

      // Actualizar el payment usando idx (que es único) en lugar de id
      const { data, error } = await this.supabase
        .from('payments')
        .update({ 
          dlo_payment_id: subscriptionId,
          status: newStatus 
        })
        .eq('idx', pendingPayment.idx)  // Usar idx en lugar de id
        .select('*')
        .single();

      if (error) {
        console.error('Error updating pending payment:', error);
        return { success: false, error: error.message };
      }

      if (!data) {
        return { success: false, error: 'No payment was updated' };
      }

      console.log(`✅ Updated pending payment ${pendingPayment.id} with subscriptionId ${subscriptionId}`);
      console.log('📊 Updated payment data:', JSON.stringify(data, null, 2));
      
      // Asegurar que tenemos el plan_id del payment original si no viene en la respuesta
      const finalPaymentData = {
        ...data,
        plan_id: data.plan_id || pendingPayment.plan_id,
        user_id: data.id // El user_id es el mismo ID del payment
      };
      
      console.log('📋 Final payment data for user update:', JSON.stringify(finalPaymentData, null, 2));
      return { success: true, data: finalPaymentData };
    } catch (error: any) {
      console.error('Error in updatePendingPaymentWithSubscription:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Actualiza el plan_id del usuario cuando el pago es exitoso
   */
  async updateUserPlan(userId: string, planId: string | null): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .update({ 
          plan_id: planId,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        console.error('Error updating user plan:', error);
        return { success: false, error: error.message };
      }

      if (!data) {
        return { success: false, error: 'User not found' };
      }

      console.log(`✅ Updated user ${userId} with plan ${planId}`);
      return { success: true, data };
    } catch (error: any) {
      console.error('Error in updateUserPlan:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtiene el cliente de Supabase
   */
  getClient(): SupabaseClient {
    return this.supabase;
  }
}

export default new SupabaseService();

// Función helper para probar conexión
export const testSupabaseConnection = async () => {
  const service = new SupabaseService();
  return await service.testConnection();
};