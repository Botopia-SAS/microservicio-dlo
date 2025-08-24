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
   * Crea un payment en estado pending
   */
  async createPayment(paymentData: {
    user_id: string;
    plan_id: string;
    amount: number;
    currency: string;
    description?: string;
    dlocal_payment_id?: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await this.supabase
        .from('payments')
        .insert([{
          id: paymentData.user_id,
          plan_id: paymentData.plan_id,
          amount: paymentData.amount,
          currency: paymentData.currency,
          status: 'Pending',
          description: paymentData.description || `Subscription payment for plan ${paymentData.plan_id} for user ${paymentData.user_id}`,
          dlo_payment_id: paymentData.dlocal_payment_id || `temp_${Date.now()}`,
        }])
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
  async updateUserPlan(userId: string, planId: string): Promise<{ success: boolean; data?: any; error?: string }> {
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