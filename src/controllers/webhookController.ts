import { Request, Response } from 'express';
import supabaseService from '../services/supabaseService';
import config from '../config';

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
          newStatus = 'Failed';
          break;
                case 'payment.cancelled':
                    newStatus = 'Cancelled';
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
          newStatus = 'Failed';
          break;
                case 'subscription.cancelled':
                    newStatus = 'Cancelled';
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
    // Nota: Aquí es donde el usuario pasa a tener una suscripción activa.
    // La creación de nuevas suscripciones está bloqueada en el controlador cuando existe una activa.
        
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
    const phoneNumber = config.whatsapp.phoneNumber; // Desde config/env
      const message = encodeURIComponent('Pagado');
      const whatsappLink = `https://wa.me/${phoneNumber}?text=${message}`;

      // Obtener fecha actual en timezone de Colombia (UTC-5)
      const now = new Date();
      const colombiaTime = new Date(now.getTime() - (5 * 60 * 60 * 1000));
      const formattedDate = colombiaTime.toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
      const formattedTime = colombiaTime.toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      // Responder con una página HTML estilo Rappi
      const successHtml = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>¡Pago Exitoso! - Botopia</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 16px;
                    overflow: hidden;
                }
                
                .container {
                    background: white;
                    border-radius: 20px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                    max-width: 400px;
                    width: 100%;
                    text-align: center;
                    overflow: hidden;
                    animation: slideUp 0.6s ease-out;
                    max-height: 90vh;
                }
                
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                .success-header {
                    padding: 30px 20px 20px;
                    animation: fadeIn 0.8s ease-out 0.2s both;
                }
                
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                .success-icon {
                    width: 80px;
                    height: 80px;
                    background: linear-gradient(135deg, #00C851 0%, #007E33 100%);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 20px;
                    animation: bounceIn 0.8s ease-out 0.4s both;
                    box-shadow: 0 10px 25px rgba(0, 200, 81, 0.3);
                }
                
                @keyframes bounceIn {
                    0% {
                        opacity: 0;
                        transform: scale(0.3);
                    }
                    50% {
                        opacity: 1;
                        transform: scale(1.05);
                    }
                    70% {
                        transform: scale(0.9);
                    }
                    100% {
                        opacity: 1;
                        transform: scale(1);
                    }
                }
                
                .success-icon svg {
                    width: 40px;
                    height: 40px;
                    fill: white;
                }
                
                .success-title {
                    font-size: 28px;
                    font-weight: 700;
                    color: #2c3e50;
                    margin-bottom: 8px;
                    animation: fadeIn 0.8s ease-out 0.6s both;
                }
                
                .success-subtitle {
                    font-size: 16px;
                    color: #7f8c8d;
                    margin-bottom: 20px;
                    animation: fadeIn 0.8s ease-out 0.8s both;
                }
                
                .transaction-summary {
                    background: #f8f9fa;
                    margin: 0 20px 20px;
                    border-radius: 16px;
                    padding: 20px;
                    animation: slideInRight 0.8s ease-out 1s both;
                }
                
                @keyframes slideInRight {
                    from {
                        opacity: 0;
                        transform: translateX(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }
                
                .summary-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                    font-size: 14px;
                }
                
                .summary-row:last-child {
                    margin-bottom: 0;
                    padding-top: 12px;
                    border-top: 1px solid #e9ecef;
                    font-weight: 600;
                    font-size: 16px;
                }
                
                .summary-label {
                    color: #6c757d;
                }
                
                .summary-value {
                    color: #495057;
                    font-weight: 500;
                }
                
                .status-badge {
                    background: linear-gradient(135deg, #00C851 0%, #007E33 100%);
                    color: white;
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                    text-transform: uppercase;
                }
                
                .next-step {
                    background: #e8f5e8;
                    margin: 0 20px;
                    border-radius: 12px;
                    padding: 16px;
                    border-left: 4px solid #00C851;
                    animation: slideInLeft 0.8s ease-out 1.2s both;
                }
                
                @keyframes slideInLeft {
                    from {
                        opacity: 0;
                        transform: translateX(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }
                
                .next-step-text {
                    color: #2d5a2d;
                    font-size: 14px;
                    font-weight: 500;
                    margin-bottom: 16px;
                }
                
                .action-button {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    padding: 16px 32px;
                    border-radius: 50px;
                    font-size: 16px;
                    font-weight: 600;
                    text-decoration: none;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    margin: 20px;
                    transition: all 0.3s ease;
                    box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
                    animation: pulse 2s infinite;
                    cursor: pointer;
                }
                
                @keyframes pulse {
                    0% {
                        box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
                    }
                    50% {
                        box-shadow: 0 12px 30px rgba(102, 126, 234, 0.5);
                        transform: translateY(-2px);
                    }
                    100% {
                        box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
                    }
                }
                
                .action-button:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 15px 35px rgba(102, 126, 234, 0.4);
                }
                
                .footer-note {
                    padding: 16px 20px;
                    color: #9ca3af;
                    font-size: 12px;
                    background: #f8f9fa;
                }
                
                @media (max-width: 480px) {
                    .container {
                        margin: 8px;
                        border-radius: 16px;
                        max-height: 95vh;
                    }
                    
                    .success-title {
                        font-size: 24px;
                    }
                    
                    .success-icon {
                        width: 70px;
                        height: 70px;
                    }
                    
                    .success-icon svg {
                        width: 35px;
                        height: 35px;
                    }
                    
                    .transaction-summary,
                    .next-step {
                        margin: 0 16px 16px;
                        padding: 16px;
                    }
                    
                    .action-button {
                        margin: 16px;
                        padding: 14px 28px;
                        font-size: 15px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="success-header">
                    <div class="success-icon">
                        <svg viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                        </svg>
                    </div>
                    <h1 class="success-title">¡Pago Exitoso!</h1>
                    <p class="success-subtitle">Tu suscripción está activa</p>
                </div>
                
                <div class="transaction-summary">
                    <div class="summary-row">
                        <span class="summary-label">Estado</span>
                        <span class="status-badge">Completado</span>
                    </div>
                    <div class="summary-row">
                        <span class="summary-label">Fecha</span>
                        <span class="summary-value">${formattedDate}</span>
                    </div>
                    <div class="summary-row">
                        <span class="summary-label">Hora</span>
                        <span class="summary-value">${formattedTime}</span>
                    </div>
                    ${paymentId ? `
                    <div class="summary-row">
                        <span class="summary-label">Transacción</span>
                        <span class="summary-value">#${paymentId.slice(-6).toUpperCase()}</span>
                    </div>
                    ` : ''}
                </div>
                
                <div class="next-step">
                    <div class="next-step-text">
                        ✅ Tu transacción ha sido procesada exitosamente.<br>
                        Continúa en el chat para activar tu servicio.
                    </div>
                </div>
                
                <a href="${whatsappLink}" class="action-button" target="_blank">
                    <span>→</span>
                    <span>CONTINUAR EN EL BOT</span>
                </a>
                
                <div class="footer-note">
                    Redirigiendo a WhatsApp automáticamente...
                </div>
            </div>
            
            <script>
                // Redirección automática después de 1 segundo
                setTimeout(function() {
                    window.location.href = '${whatsappLink}';
                }, 1000);
                
                // También permitir clic manual en el botón
                document.addEventListener('DOMContentLoaded', function() {
                    const button = document.querySelector('.action-button');
                    if (button) {
                        button.addEventListener('click', function(e) {
                            e.preventDefault();
                            window.location.href = '${whatsappLink}';
                        });
                    }
                });
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