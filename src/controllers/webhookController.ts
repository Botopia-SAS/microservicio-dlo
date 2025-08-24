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
            <title>Transacción Completada - Botopia</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: #f8fafc;
                    color: #1e293b;
                    line-height: 1.6;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                .container {
                    background: #ffffff;
                    border-radius: 12px;
                    border: 1px solid #e2e8f0;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                    max-width: 500px;
                    width: 100%;
                    overflow: hidden;
                }
                .header {
                    background: #059669;
                    color: white;
                    padding: 24px;
                    text-align: center;
                }
                .success-icon {
                    width: 48px;
                    height: 48px;
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 50%;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 16px;
                    font-size: 24px;
                }
                .header h1 {
                    font-size: 24px;
                    font-weight: 600;
                    margin-bottom: 8px;
                }
                .header p {
                    font-size: 16px;
                    opacity: 0.9;
                }
                .content {
                    padding: 32px 24px;
                }
                .status-card {
                    background: #f0fdf4;
                    border: 1px solid #bbf7d0;
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 24px;
                }
                .status-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                }
                .status-row:last-child {
                    margin-bottom: 0;
                }
                .status-label {
                    font-weight: 500;
                    color: #374151;
                }
                .status-value {
                    color: #059669;
                    font-weight: 600;
                }
                .transaction-summary {
                    margin-bottom: 24px;
                }
                .summary-card {
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    padding: 20px;
                }
                .summary-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                    padding-bottom: 12px;
                    border-bottom: 1px solid #e5e7eb;
                }
                .summary-row:last-child {
                    margin-bottom: 0;
                    padding-bottom: 0;
                    border-bottom: none;
                }
                .summary-label {
                    font-weight: 500;
                    color: #6b7280;
                    font-size: 14px;
                }
                .summary-value {
                    color: #111827;
                    font-weight: 600;
                    font-size: 14px;
                    text-align: right;
                    max-width: 60%;
                    word-break: break-word;
                }
                .completion-notice {
                    background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
                    border: 1px solid #bbf7d0;
                    border-radius: 8px;
                    padding: 20px;
                    margin-bottom: 24px;
                    text-align: center;
                }
                .action-section {
                    text-align: center;
                    padding-top: 8px;
                }
                .continue-btn {
                    background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
                    color: white;
                    text-decoration: none;
                    padding: 16px 32px;
                    border-radius: 8px;
                    font-weight: 600;
                    display: inline-flex;
                    align-items: center;
                    gap: 12px;
                    transition: all 0.3s ease;
                    font-size: 16px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    border: 2px solid transparent;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                }
                .continue-btn:hover {
                    background: linear-gradient(135deg, #111827 0%, #1f2937 100%);
                    transform: translateY(-1px);
                    box-shadow: 0 8px 15px -3px rgba(0, 0, 0, 0.15);
                }
                .continue-icon {
                    font-size: 18px;
                    font-weight: bold;
                }
                .action-note {
                    color: #6b7280;
                    font-size: 12px;
                    margin-top: 12px;
                    font-style: italic;
                }
                .transaction-details {
                    background: #f8fafc;
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 24px;
                }
                .detail-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                    font-size: 14px;
                }
                .detail-row:last-child {
                    margin-bottom: 0;
                }
                .detail-label {
                    color: #6b7280;
                }
                .detail-value {
                    color: #1f2937;
                    font-weight: 500;
                    word-break: break-all;
                }
                .support-section {
                    text-align: center;
                    padding-top: 24px;
                    border-top: 1px solid #e5e7eb;
                }
                .support-text {
                    color: #6b7280;
                    margin-bottom: 16px;
                    font-size: 14px;
                }
                .contact-btn {
                    background: #25d366;
                    color: white;
                    text-decoration: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    font-weight: 500;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    transition: background-color 0.2s ease;
                    font-size: 14px;
                }
                .contact-btn:hover {
                    background: #22c55e;
                }
                .contact-icon {
                    font-size: 16px;
                }
                .footer {
                    background: #f8fafc;
                    padding: 16px 24px;
                    text-align: center;
                    color: #6b7280;
                    font-size: 12px;
                }
                @media (max-width: 480px) {
                    .container {
                        margin: 10px;
                    }
                    .content {
                        padding: 24px 16px;
                    }
                    .status-row, .detail-row, .summary-row {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 4px;
                    }
                    .summary-value {
                        max-width: 100%;
                        text-align: left;
                        font-size: 13px;
                    }
                    .continue-btn {
                        width: 100%;
                        justify-content: center;
                        padding: 14px 24px;
                        font-size: 14px;
                    }
                    .header h1 {
                        font-size: 20px;
                    }
                    .header p {
                        font-size: 14px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="success-icon">✓</div>
                    <h1>Transacción Exitosa</h1>
                    <p>Su suscripción ha sido procesada correctamente</p>
                </div>
                
                <div class="content">
                    <div class="status-card">
                        <div class="status-row">
                            <span class="status-label">Estado de la transacción</span>
                            <span class="status-value">Completado</span>
                        </div>
                        <div class="status-row">
                            <span class="status-label">Fecha de procesamiento</span>
                            <span class="status-value">${new Date().toLocaleDateString('es-ES', { 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}</span>
                        </div>
                    </div>
                    
                    <div class="transaction-summary">
                        <h3 style="margin-bottom: 16px; font-size: 18px; color: #111827; font-weight: 600;">Resumen de la Transacción</h3>
                        
                        <div class="summary-card">
                            <div class="summary-row">
                                <span class="summary-label">Tipo de servicio</span>
                                <span class="summary-value">Suscripción Premium</span>
                            </div>
                            <div class="summary-row">
                                <span class="summary-label">Método de pago</span>
                                <span class="summary-value">DLocal Gateway</span>
                            </div>
                            ${paymentId ? `
                            <div class="summary-row">
                                <span class="summary-label">Referencia de pago</span>
                                <span class="summary-value">${paymentId}</span>
                            </div>
                            ` : ''}
                            ${subscriptionToken ? `
                            <div class="summary-row">
                                <span class="summary-label">Token de suscripción</span>
                                <span class="summary-value">${subscriptionToken.substring(0, 16)}...</span>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    
                    <div class="completion-notice">
                        <div class="notice-content">
                            <h4 style="color: #059669; margin-bottom: 8px; font-size: 16px;">Su transacción ha sido procesada exitosamente</h4>
                            <p style="color: #374151; margin-bottom: 16px; font-size: 14px;">
                                Para completar la activación de su servicio y recibir las credenciales de acceso, 
                                por favor continúe con el siguiente paso.
                            </p>
                        </div>
                    </div>
                    
                    <div class="action-section">
                        <a href="${whatsappLink}" class="continue-btn" target="_blank">
                            <span class="continue-icon">→</span>
                            Continuar con la Activación
                        </a>
                        <p class="action-note">
                            Será redirigido a WhatsApp para completar la configuración de su cuenta
                        </p>
                    </div>
                </div>
                
                <div class="footer">
                    <p>© 2024 Botopia. Todos los derechos reservados.</p>
                </div>
            </div>
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
      const errorCode = req.query.error_code as string;
      const errorMessage = req.query.error_message as string;
      
      if (paymentId) {
        // Actualizar el status a Failed
        const updateResult = await supabaseService.updatePaymentStatus(paymentId, 'Failed');
        console.log('Payment updated to Failed:', updateResult);
      }

      // Generar el enlace de WhatsApp para soporte
      const phoneNumber = '573138381310';
      const message = encodeURIComponent('Necesito ayuda con un problema en mi pago');
      const whatsappLink = `https://wa.me/${phoneNumber}?text=${message}`;

      // Responder con una página HTML profesional de error
      const errorHtml = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Error en la Transacción - Botopia</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: #f8fafc;
                    color: #1e293b;
                    line-height: 1.6;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                .container {
                    background: #ffffff;
                    border-radius: 12px;
                    border: 1px solid #e2e8f0;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                    max-width: 500px;
                    width: 100%;
                    overflow: hidden;
                }
                .header {
                    background: #dc2626;
                    color: white;
                    padding: 24px;
                    text-align: center;
                }
                .error-icon {
                    width: 48px;
                    height: 48px;
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 50%;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 16px;
                    font-size: 24px;
                }
                .header h1 {
                    font-size: 24px;
                    font-weight: 600;
                    margin-bottom: 8px;
                }
                .header p {
                    font-size: 16px;
                    opacity: 0.9;
                }
                .content {
                    padding: 32px 24px;
                }
                .status-card {
                    background: #fef2f2;
                    border: 1px solid #fecaca;
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 24px;
                }
                .status-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                }
                .status-row:last-child {
                    margin-bottom: 0;
                }
                .status-label {
                    font-weight: 500;
                    color: #374151;
                }
                .status-value {
                    color: #dc2626;
                    font-weight: 600;
                }
                .error-details {
                    background: #f8fafc;
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 24px;
                }
                .detail-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                    font-size: 14px;
                }
                .detail-row:last-child {
                    margin-bottom: 0;
                }
                .detail-label {
                    color: #6b7280;
                }
                .detail-value {
                    color: #1f2937;
                    font-weight: 500;
                    word-break: break-all;
                }
                .help-section {
                    background: #f0f9ff;
                    border: 1px solid #bae6fd;
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 24px;
                }
                .help-title {
                    font-weight: 600;
                    color: #0369a1;
                    margin-bottom: 8px;
                    font-size: 16px;
                }
                .help-text {
                    color: #0f172a;
                    font-size: 14px;
                    margin-bottom: 12px;
                }
                .help-list {
                    color: #374151;
                    font-size: 14px;
                    padding-left: 16px;
                }
                .support-section {
                    text-align: center;
                    padding-top: 24px;
                    border-top: 1px solid #e5e7eb;
                }
                .support-text {
                    color: #6b7280;
                    margin-bottom: 16px;
                    font-size: 14px;
                }
                .contact-btn {
                    background: #25d366;
                    color: white;
                    text-decoration: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    font-weight: 500;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    transition: background-color 0.2s ease;
                    font-size: 14px;
                }
                .contact-btn:hover {
                    background: #22c55e;
                }
                .contact-icon {
                    font-size: 16px;
                }
                .retry-btn {
                    background: #3b82f6;
                    color: white;
                    text-decoration: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    font-weight: 500;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    transition: background-color 0.2s ease;
                    font-size: 14px;
                    margin-right: 12px;
                }
                .retry-btn:hover {
                    background: #2563eb;
                }
                .footer {
                    background: #f8fafc;
                    padding: 16px 24px;
                    text-align: center;
                    color: #6b7280;
                    font-size: 12px;
                }
                @media (max-width: 480px) {
                    .container {
                        margin: 10px;
                    }
                    .content {
                        padding: 24px 16px;
                    }
                    .status-row, .detail-row {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 4px;
                    }
                    .retry-btn {
                        margin-right: 0;
                        margin-bottom: 12px;
                        width: 100%;
                        justify-content: center;
                    }
                    .contact-btn {
                        width: 100%;
                        justify-content: center;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="error-icon">✕</div>
                    <h1>Error en la Transacción</h1>
                    <p>No se pudo procesar su pago</p>
                </div>
                
                <div class="content">
                    <div class="status-card">
                        <div class="status-row">
                            <span class="status-label">Estado de la transacción</span>
                            <span class="status-value">Fallida</span>
                        </div>
                    </div>
                    
                    ${(paymentId || errorCode || errorMessage) ? `
                    <div class="error-details">
                        <h3 style="margin-bottom: 12px; font-size: 16px; color: #374151;">Detalles del error</h3>
                        ${paymentId ? `
                        <div class="detail-row">
                            <span class="detail-label">ID de Pago:</span>
                            <span class="detail-value">${paymentId}</span>
                        </div>
                        ` : ''}
                        ${errorCode ? `
                        <div class="detail-row">
                            <span class="detail-label">Código de Error:</span>
                            <span class="detail-value">${errorCode}</span>
                        </div>
                        ` : ''}
                        ${errorMessage ? `
                        <div class="detail-row">
                            <span class="detail-label">Descripción:</span>
                            <span class="detail-value">${errorMessage}</span>
                        </div>
                        ` : ''}
                    </div>
                    ` : ''}
                    
                    <div class="help-section">
                        <div class="help-title">¿Qué puedo hacer?</div>
                        <div class="help-text">Los errores en los pagos pueden ocurrir por varios motivos:</div>
                        <ul class="help-list">
                            <li>Fondos insuficientes en su cuenta</li>
                            <li>Datos de tarjeta incorrectos</li>
                            <li>Problemas temporales con el banco</li>
                            <li>Límites de transacción excedidos</li>
                        </ul>
                    </div>
                    
                    <div class="support-section">
                        <p class="support-text">
                            Puede intentar nuevamente o contactar a nuestro equipo de soporte para asistencia inmediata.
                        </p>
                        <div>
                            <a href="javascript:history.back()" class="retry-btn">
                                <span>↶</span>
                                Intentar Nuevamente
                            </a>
                            <a href="${whatsappLink}" class="contact-btn" target="_blank">
                                <span class="contact-icon">💬</span>
                                Contactar Soporte
                            </a>
                        </div>
                    </div>
                </div>
                
                <div class="footer">
                    <p>© 2024 Botopia. Todos los derechos reservados.</p>
                </div>
            </div>
        </body>
        </html>
      `;

      res.status(200).send(errorHtml);

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