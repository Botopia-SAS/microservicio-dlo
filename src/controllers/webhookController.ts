import { Request, Response } from 'express';
import supabaseService from '../services/supabaseService';

export class WebhookController {
  /**
   * Maneja los webhooks de DLocal para actualizar el status de payments
   */
  async handleDLocalWebhook(req: Request, res: Response): Promise<void> {
    try {
      console.log('📥 Webhook received from DLocal:');
      console.log('Headers:', JSON.stringify(req.headers, null, 2));
      console.log('Body:', JSON.stringify(req.body, null, 2));
      console.log('Query:', JSON.stringify(req.query, null, 2));

      const { type, data, subscriptionId, invoiceId, subscription_token, plan_token } = req.body;

      // Para webhooks de suscripción, puede venir subscriptionId directamente
      const dLocalSubscriptionId = subscriptionId || (data && data.id) || (data && data.subscription_id);
      const planToken = plan_token || subscription_token || (data && data.plan_token) || (data && data.subscription_token);
      
      console.log('🔍 Extracted values:');
      console.log('- subscriptionId:', dLocalSubscriptionId);
      console.log('- planToken:', planToken);
      
      const eventType = type || 'subscription.payment_success'; // Asumir éxito si no hay tipo

      if (!dLocalSubscriptionId && !planToken) {
        res.status(400).json({
          success: false,
          error: 'Invalid webhook payload - no subscription ID or plan token found'
        });
        return;
      }

      // Determinar el nuevo status basado en el tipo de evento
      let newStatus = 'Completed'; // Por defecto asumir éxito para webhooks de suscripción
      
      switch (eventType) {
        // Eventos de pagos
        case 'PAYMENT_NOTIFICATION':
        case 'payment.approved':
        case 'payment.completed':
        case 'payment.success':
          newStatus = 'Completed';
          break;
        case 'payment.rejected':
        case 'payment.failed':
        case 'payment.cancelled':
          newStatus = 'Failed';
          break;
        case 'payment.pending':
        case 'payment.processing':
          newStatus = 'Pending';
          break;
        
        // Eventos de suscripciones
        case 'subscription.payment_success':
        case 'subscription.activated':
          newStatus = 'Completed';
          break;
        case 'subscription.payment_failed':
        case 'subscription.cancelled':
          newStatus = 'Failed';
          break;
        case 'subscription.created':
          newStatus = 'Pending';
          break;
          
        default:
          console.log(`⚠️ Unknown event type: ${eventType}, assuming success`);
          newStatus = 'Completed';
      }

      console.log(`🔄 Updating payment for subscription ${dLocalSubscriptionId} to status: ${newStatus}`);

      let updateResult;

      // Estrategia 1: Buscar por subscriptionId exacto
      if (dLocalSubscriptionId) {
        updateResult = await supabaseService.updatePaymentBySubscription(dLocalSubscriptionId.toString(), newStatus);
        console.log('💡 Strategy 1 - Search by subscriptionId:', updateResult.success);
      }

      // Estrategia 2: Si no encontró por subscriptionId, buscar por planToken
      if (!updateResult?.success && planToken) {
        console.log('🔄 Trying to find payment by plan token...');
        updateResult = await supabaseService.updatePaymentBySubscription(planToken, newStatus);
        console.log('💡 Strategy 2 - Search by planToken:', updateResult.success);
      }

      // Estrategia 3: Si no encontró, buscar payment pendiente y actualizar con subscriptionId
      if (!updateResult?.success && dLocalSubscriptionId) {
        console.log('🔄 Looking for pending payments to update with subscriptionId...');
        updateResult = await supabaseService.updatePendingPaymentWithSubscription(
          dLocalSubscriptionId.toString(),
          newStatus
        );
        console.log('💡 Strategy 3 - Update pending with subscriptionId:', updateResult.success);
      }

      if (!updateResult?.success) {
        console.error('❌ Failed to update payment status:', updateResult?.error || 'No update result');
        res.status(500).json({
          success: false,
          error: 'Failed to update payment status',
          details: updateResult?.error || 'No matching payment found'
        });
        return;
      }

      console.log('✅ Payment status updated successfully');

      // Si el pago es exitoso (Completed), actualizar el plan del usuario
      if (newStatus === 'Completed' && updateResult.data) {
        const payment = updateResult.data;
        console.log('� Payment data for user update:', JSON.stringify(payment, null, 2));
        console.log('�🔄 Updating user plan for successful payment...');
        
        // Verificar que tengamos user_id y plan_id válidos
        const userId = payment.id; // El id del payment ES el user_id
        const planId = payment.plan_id;
        
        console.log('📝 Values for user update:');
        console.log('- userId:', userId);
        console.log('- planId:', planId);
        
        if (!userId || !planId) {
          console.log('⚠️ Missing user_id or plan_id in payment data');
          console.log('- user_id (payment.id):', userId);
          console.log('- plan_id:', planId);
          
          // Si no tenemos plan_id, intentar obtenerlo del payment original
          if (!planId && userId) {
            console.log('🔄 Attempting to get plan_id from original payment...');
            // Aquí podrías hacer una consulta adicional si fuera necesario
          }
        } else {
          console.log(`✅ Proceeding to update user ${userId} with plan ${planId}`);
          
          const userUpdateResult = await supabaseService.updateUserPlan(userId, planId);
          
          if (userUpdateResult.success) {
            console.log('✅ User plan updated successfully');
          } else {
            console.log('⚠️ Failed to update user plan:', userUpdateResult.error);
          }
        }
      }

      // Responder a DLocal que recibimos el webhook
      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully',
        subscription_id: dLocalSubscriptionId,
        new_status: newStatus
      });

    } catch (error: any) {
      console.error('❌ Error processing webhook:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error.message
      });
    }
  }

  /**
   * Maneja la URL de éxito de DLocal
   */
  async handleSuccess(req: Request, res: Response): Promise<void> {
    try {
      console.log('✅ Success callback received from DLocal:', req.query);
      
      // Extraer parámetros de la URL
      const subscriptionToken = req.query.subscription_token as string;
      const paymentId = req.query.payment_id as string;
      
      if (paymentId) {
        // Actualizar el status a Completed
        const updateResult = await supabaseService.updatePaymentStatus(paymentId, 'Completed');
        console.log('Payment updated to Completed:', updateResult);
        
        // Si el pago se actualizó exitosamente, también actualizar el plan del usuario
        if (updateResult.success && updateResult.data) {
          const payment = updateResult.data;
          console.log('🔄 Updating user plan for successful payment...');
          
          const userUpdateResult = await supabaseService.updateUserPlan(
            payment.id, // El id del payment ES el user_id
            payment.plan_id
          );
          
          if (userUpdateResult.success) {
            console.log('✅ User plan updated successfully');
          } else {
            console.log('⚠️ Failed to update user plan:', userUpdateResult.error);
          }
        }
      }

      // Generar el enlace de WhatsApp
      const phoneNumber = '573138381310'; // Número con código de país Colombia
      const message = encodeURIComponent('Ya realicé el pago');
      const whatsappLink = `https://wa.me/${phoneNumber}?text=${message}`;

      // Responder con una página HTML que incluya el botón de WhatsApp
      const successHtml = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Pago Exitoso</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    margin: 0;
                    padding: 0;
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                .container {
                    background: white;
                    padding: 40px;
                    border-radius: 20px;
                    box-shadow: 0 15px 35px rgba(0,0,0,0.1);
                    text-align: center;
                    max-width: 500px;
                    width: 90%;
                }
                .success-icon {
                    font-size: 64px;
                    color: #4CAF50;
                    margin-bottom: 20px;
                }
                h1 {
                    color: #333;
                    margin-bottom: 10px;
                    font-size: 28px;
                }
                .subtitle {
                    color: #666;
                    margin-bottom: 30px;
                    font-size: 16px;
                }
                .whatsapp-btn {
                    background: #25D366;
                    color: white;
                    padding: 15px 30px;
                    border: none;
                    border-radius: 25px;
                    font-size: 18px;
                    font-weight: bold;
                    text-decoration: none;
                    display: inline-flex;
                    align-items: center;
                    gap: 10px;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 15px rgba(37, 211, 102, 0.3);
                }
                .whatsapp-btn:hover {
                    background: #20BA5A;
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(37, 211, 102, 0.4);
                }
                .whatsapp-icon {
                    font-size: 24px;
                }
                .payment-info {
                    background: #f8f9fa;
                    padding: 20px;
                    border-radius: 10px;
                    margin: 20px 0;
                    border-left: 4px solid #4CAF50;
                }
                .payment-info p {
                    margin: 5px 0;
                    color: #555;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="success-icon">✅</div>
                <h1>¡Pago Exitoso!</h1>
                <p class="subtitle">Tu suscripción ha sido activada correctamente</p>
                
                <div class="payment-info">
                    <p><strong>Estado:</strong> Completado</p>
                    ${subscriptionToken ? `<p><strong>Token:</strong> ${subscriptionToken}</p>` : ''}
                    ${paymentId ? `<p><strong>ID de Pago:</strong> ${paymentId}</p>` : ''}
                </div>
                
                <p style="color: #666; margin: 20px 0;">
                    Para cualquier consulta o soporte, contáctanos:
                </p>
                
                <a href="${whatsappLink}" class="whatsapp-btn" target="_blank">
                    <span class="whatsapp-icon">📱</span>
                    Volver a Chat
                </a>
            </div>
            
            <script>
                // Auto redirect after 30 seconds if user doesn't click
                setTimeout(() => {
                    if (confirm('¿Quieres ir automáticamente al chat de WhatsApp?')) {
                        window.open('${whatsappLink}', '_blank');
                    }
                }, 30000);
            </script>
        </body>
        </html>
      `;

      res.status(200).send(successHtml);

    } catch (error: any) {
      console.error('Error in success handler:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error.message
      });
    }
  }

  /**
   * Maneja la URL de error de DLocal
   */
  async handleError(req: Request, res: Response): Promise<void> {
    try {
      console.log('❌ Error callback received from DLocal:', req.query);
      
      const paymentId = req.query.payment_id as string;
      
      if (paymentId) {
        // Actualizar el status a Failed
        const updateResult = await supabaseService.updatePaymentStatus(paymentId, 'Failed');
        console.log('Payment updated to Failed:', updateResult);
      }

      res.status(200).json({
        success: false,
        message: 'Payment failed',
        payment_id: paymentId
      });

    } catch (error: any) {
      console.error('❌ Error processing error callback:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
}

export default new WebhookController();