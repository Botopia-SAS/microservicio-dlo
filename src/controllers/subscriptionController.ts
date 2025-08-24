import { Request, Response } from 'express';
import dLocalSubscriptionService from '../services/dLocalSubscriptionService';
import supabaseService from '../services/supabaseService';
import { DLocalSubscriptionPlanRequest } from '../types';
import { isValidAmount } from '../utils/helpers';

export class SubscriptionController {
  /**
   * Crear suscripción con user_id y plan_id - crea payment en Supabase
   */
  async createSubscriptionWithUser(req: Request, res: Response): Promise<void> {
    try {
      const { user_id, plan_id } = req.body;

      // Validaciones básicas
      if (!user_id || !plan_id) {
        res.status(400).json({
          success: false,
          error: 'user_id and plan_id are required',
        });
        return;
      }

      // Obtener información del usuario
      const userResult = await supabaseService.getUser(user_id);
      if (!userResult.success || !userResult.data) {
        res.status(404).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      // Obtener información del plan
      const planResult = await supabaseService.getPlan(plan_id);
      if (!planResult.success || !planResult.data) {
        res.status(404).json({
          success: false,
          error: 'Plan not found',
        });
        return;
      }

      const user = userResult.data;
      const plan = planResult.data;

      // Impedir múltiples suscripciones activas por usuario
      const activeCheck = await supabaseService.hasActiveSubscription(user_id);
      if (activeCheck.success && activeCheck.active) {
        res.status(409).json({
          success: false,
          error: 'User already has an active subscription',
          currentSubscription: activeCheck.data,
        });
        return;
      }

      // Configurar el plan de suscripción para DLocal
      const planData: DLocalSubscriptionPlanRequest = {
        name: `${plan.plan_name} - ${user.name}`,
        description: plan.description || `Subscription for ${user.name}`,
        currency: plan.currency,
        amount: parseFloat(plan.price),
        frequency_type: plan.frequency_type as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY',
        frequency_value: plan.frequency_value,
        active: true,
        free_trial_days: 0,
        notification_url: 'https://pzzh33k5-3000.use2.devtunnels.ms/api/webhooks/dlocal',
        success_url: 'https://pzzh33k5-3000.use2.devtunnels.ms/api/webhooks/success',
        back_url: 'http://localhost:3000/subscription-cancel',
        error_url: 'https://pzzh33k5-3000.use2.devtunnels.ms/api/webhooks/error',
      };

      // Crear el plan en DLocal
      const dLocalResult = await dLocalSubscriptionService.createPlan(planData);

      if (!dLocalResult.success || !dLocalResult.data) {
        res.status(400).json({
          success: false,
          error: 'Failed to create DLocal subscription plan',
          details: dLocalResult,
        });
        return;
      }

      // Crear payment en Supabase con status pending usando datos del plan
      const paymentResult = await supabaseService.createPayment({
        user_id: user_id,
        plan_id: plan_id,
        amount: parseFloat(plan.price),
        currency: plan.currency,
        description: plan.description || plan.plan_name || `Subscription to ${plan.plan_name}`,
        dlocal_plan_id: String(dLocalResult.data.id),
        plan_token: dLocalResult.data.plan_token,
      });

      if (!paymentResult.success) {
        res.status(500).json({
          success: false,
          error: 'Failed to create payment record',
          details: paymentResult.error,
        });
        return;
      }

      // Respuesta exitosa
      res.status(201).json({
        success: true,
        subscribeLink: dLocalResult.data.subscribe_url,
        payment: paymentResult.data,
        planInfo: {
          dLocalPlanId: dLocalResult.data.id,
          planToken: dLocalResult.data.plan_token,
          name: dLocalResult.data.name,
          amount: dLocalResult.data.amount,
          currency: dLocalResult.data.currency,
          frequency: `${dLocalResult.data.frequency_value} ${dLocalResult.data.frequency_type}`,
        },
        userInfo: {
          userId: user.id,
          name: user.name,
          email: user.email,
        },
        message: `Subscription created for ${user.name}. Payment record created with status: pending`,
      });

    } catch (error) {
      console.error('Error in createSubscriptionWithUser:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to create subscription',
      });
    }
  }
  async createSimplePlan(req: Request, res: Response): Promise<void> {
    try {
      const { 
        name, 
        amount, 
        currency = 'USD', // Moneda base, DLocal convertirá según país seleccionado
        frequency_type = 'MONTHLY',
        frequency_value = 1,
        description = 'Plan de Suscripción'
      } = req.body;

      // Validaciones básicas
      if (!name || name.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: 'Plan name is required',
        });
        return;
      }

      if (!amount || !isValidAmount(amount)) {
        res.status(400).json({
          success: false,
          error: 'Valid amount is required',
        });
        return;
      }

      const validFrequencies = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
      if (!validFrequencies.includes(frequency_type.toUpperCase())) {
        res.status(400).json({
          success: false,
          error: 'Invalid frequency. Supported: DAILY, WEEKLY, MONTHLY, YEARLY',
        });
        return;
      }

      // Configurar el plan SIN especificar país para que DLocal Go muestre selector
      const planData: DLocalSubscriptionPlanRequest = {
        name: name.trim(),
        description,
        // NO incluimos 'country' para que DLocal Go muestre el selector de país
        currency: currency.toUpperCase(),
        amount: amount, // Monto base, DLocal convertirá según país
        frequency_type: frequency_type.toUpperCase() as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY',
        frequency_value: frequency_value || 1,
        active: true,
        free_trial_days: 0,
        notification_url: `${req.protocol}://${req.get('host')}/api/subscriptions/webhook`,
        success_url: 'http://localhost:3000/subscription-success',
        back_url: 'http://localhost:3000/subscription-cancel',
        error_url: 'http://localhost:3000/subscription-error',
      };

      // Crear el plan en DLocal
      const result = await dLocalSubscriptionService.createPlan(planData);

      if (result.success && result.data) {
        res.status(201).json({
          success: true,
          subscribeLink: result.data.subscribe_url,
          planInfo: {
            planId: result.data.id,
            planToken: result.data.plan_token,
            name: result.data.name,
            amount: result.data.amount,
            currency: result.data.currency,
            country: result.data.country || 'Multi-país',
            frequency: `${result.data.frequency_value} ${result.data.frequency_type}`,
            active: result.data.active,
          },
          message: `Plan creado con selector de país automático. DLocal convertirá la moneda según el país elegido.`,
        });
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in createSimplePlan:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to create subscription plan',
      });
    }
  }

  /**
   * Cancelar suscripción de DLocal pasando user_id
   * Busca el payment activo del usuario, obtiene dlocal_plan_id y subscriptionId
   */
  async cancelByUser(req: Request, res: Response): Promise<void> {
    try {
      // Allow passing overrides when DB doesn't have all identifiers
      const { user_id, plan_token: planTokenOverride, subscription_id: subscriptionIdOverride, dlocal_plan_id: dlocalPlanIdOverride } = req.body || {};
      if (!user_id) {
        res.status(400).json({ success: false, error: 'user_id is required' });
        return;
      }

  // Buscar payment activo (prefiere Completed, luego Active)
      const paymentResult = await supabaseService.getActivePaymentByUser(user_id);
      if (!paymentResult.success || !paymentResult.data) {
        res.status(404).json({ success: false, error: paymentResult.error || 'Active subscription not found' });
        return;
      }

      const payment = paymentResult.data;
      // Buscar identificadores en payment o overrides
      let planId: string | undefined = dlocalPlanIdOverride || payment.dlocal_plan_id || payment.dLocal_plan_id || payment.dlocal_plan || payment.dlocal_plan_token;
      const planToken: string | undefined = planTokenOverride || payment.plan_token;
      let subscriptionId: string | undefined = subscriptionIdOverride || payment.dlo_payment_id || payment.subscription_id || payment.subscription_token;

      // Si faltan, intentar encontrarlos en pagos recientes
      if (!planId || !subscriptionId) {
        const findIds = await supabaseService.findPlanAndSubscriptionForUser(user_id);
        if (findIds.success) {
          planId = planId || findIds.data?.planId;
          subscriptionId = subscriptionId || findIds.data?.subscriptionId;
        }
      }

      // Si aún no hay planId pero sí hay planToken, intentar resolverlo desde DLocal
      if (!planId && planToken) {
        try {
          const plansPage = await dLocalSubscriptionService.getAllPlans(1, 50);
          if (plansPage.success && plansPage.data?.data?.length) {
            const match = plansPage.data.data.find((p: any) => p.plan_token === planToken);
            if (match?.id) {
              planId = String(match.id);
            }
          }
        } catch (e) {
          // ignore, fallback below will handle
        }
      }

      // Si seguimos sin planId, tratar de obtenerlo desde la suscripción en DLocal
      if (!planId && subscriptionId) {
        const subInfo = await dLocalSubscriptionService.getSubscription(String(subscriptionId));
        if (subInfo.success && subInfo.data?.plan?.id) {
          planId = String(subInfo.data.plan.id);
        }
      }

      if (!subscriptionId) {
        res.status(400).json({ success: false, error: 'Missing subscription id/token. Pass subscription_id in body to override.' });
        return;
      }

      // Intentar cancelar con plan+subscription si tenemos ambos; si no, usar solo subscription
      if (!planId) {
        res.status(400).json({
          success: false,
          error: 'Missing DLocal plan id',
          message: 'Could not resolve plan id from DB, plan token, or DLocal subscription lookup',
          details: { planToken, subscriptionId }
        });
        return;
      }
      const cancelResult = await dLocalSubscriptionService.cancelSubscription(String(planId), String(subscriptionId));
      if (!cancelResult.success) {
        res.status(400).json({
          success: false,
          error: cancelResult.error || 'DLocal API error',
          message: cancelResult.message,
          details: {
            attemptedPlanId: planId,
            planToken,
            subscriptionId,
          },
          dlocal: cancelResult.data,
        });
        return;
      }

  // Marcar payment como Cancelled
  const updateResult = await supabaseService.setPaymentStatusByIdxOrUser({ userId: user_id, newStatus: 'Cancelled' });
  // Además, desvincular el plan del usuario (plan_id = null)
  const userNullPlan = await supabaseService.updateUserPlan(user_id, null);

      res.status(200).json({
        success: true,
        message: 'Subscription cancelled',
        dlocal: cancelResult.data,
  payment: updateResult.success ? updateResult.data : undefined,
  user: userNullPlan.success ? userNullPlan.data : undefined,
      });
    } catch (error: any) {
      console.error('Error in cancelByUser:', error);
      res.status(500).json({ success: false, error: 'Internal server error', message: error.message });
    }
  }

  /**
   * Obtener todos los planes
   */
  async getAllPlans(req: Request, res: Response): Promise<void> {
    try {
      const { page = 1, page_size = 10 } = req.query;

      const result = await dLocalSubscriptionService.getAllPlans(
        Number(page),
        Number(page_size)
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in getAllPlans:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to get subscription plans',
      });
    }
  }

  /**
   * Obtener un plan específico
   */
  async getPlan(req: Request, res: Response): Promise<void> {
    try {
      const { planId } = req.params;

      if (!planId) {
        res.status(400).json({
          success: false,
          error: 'Plan ID is required',
        });
        return;
      }

      const result = await dLocalSubscriptionService.getPlan(planId);
      res.status(result.success ? 200 : 404).json(result);
    } catch (error) {
      console.error('Error in getPlan:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * Manejar webhooks de suscripciones
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      console.log('Subscription webhook received:', req.body);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error in handleWebhook:', error);
      res.status(500).json({ success: false });
    }
  }

  /**
   * Formatea el monto según la moneda
   */
  private formatAmount(amount: number, currency: string): number {
    const upperCurrency = currency.toUpperCase();
    
    // Para COP (peso colombiano), usar el monto directo
    if (upperCurrency === 'COP') {
      return Math.min(amount, 50000); // Máximo 50,000 COP para sandbox
    }
    
    // Para UYU (peso uruguayo)
    if (upperCurrency === 'UYU') {
      return Math.min(amount, 1000); // Máximo 1,000 UYU para sandbox
    }
    
    // Para USD y otras monedas
    return Math.min(amount, 100); // Máximo $100 USD para sandbox
  }

  /**
   * Mapeo automático de moneda a país
   */
  private getCurrencyCountryMapping(): Record<string, string> {
    return {
      'COP': 'CO', // Peso Colombiano -> Colombia
      'USD': 'US', // Dólar -> Estados Unidos  
      'BRL': 'BR', // Real -> Brasil
      'MXN': 'MX', // Peso Mexicano -> México
      'ARS': 'AR', // Peso Argentino -> Argentina
      'UYU': 'UY', // Peso Uruguayo -> Uruguay
      'PEN': 'PE', // Sol -> Perú
      'CLP': 'CL', // Peso Chileno -> Chile
    };
  }

  /**
   * Formatea el monto según la moneda específica
   */
  private formatAmountByCurrency(amount: number, currency: string): number {
    switch (currency) {
      case 'COP':
        return Math.min(amount, 50000); // Máximo 50,000 COP
      case 'UYU':
        return Math.min(amount, 2000);  // Máximo 2,000 UYU
      case 'BRL':
        return Math.min(amount, 500);   // Máximo 500 BRL
      case 'MXN':
        return Math.min(amount, 2000);  // Máximo 2,000 MXN
      case 'ARS':
        return Math.min(amount, 10000); // Máximo 10,000 ARS
      case 'PEN':
        return Math.min(amount, 300);   // Máximo 300 PEN
      case 'CLP':
        return Math.min(amount, 80000); // Máximo 80,000 CLP
      case 'USD':
      default:
        return Math.min(amount, 100);   // Máximo 100 USD
    }
  }

  /**
   * Obtiene el nombre del país en español
   */
  private getCountryName(countryCode: string): string {
    const countryNames: Record<string, string> = {
      'CO': 'Colombia',
      'US': 'Estados Unidos',
      'BR': 'Brasil', 
      'MX': 'México',
      'AR': 'Argentina',
      'UY': 'Uruguay',
      'PE': 'Perú',
      'CL': 'Chile',
    };
    return countryNames[countryCode] || countryCode;
  }
}

export default new SubscriptionController();
