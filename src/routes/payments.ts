import { Router } from 'express';
import paymentController from '../controllers/paymentController';
import {
  validatePaymentData,
  validatePaymentId,
  validateCountry,
} from '../middleware/validation';

const router = Router();

/**
 * @route POST /api/payments/simple
 * @description Endpoint simple para crear un pago - solo requiere amount
 * @body { amount: number }
 */
router.post('/simple', paymentController.createSimplePayment.bind(paymentController));

/**
 * @route POST /api/payments
 * @description Crear un nuevo pago
 * @body PaymentRequestBody
 */
router.post('/', validatePaymentData, paymentController.createPayment.bind(paymentController));

/**
 * @route GET /api/payments/:paymentId
 * @description Obtener el estado de un pago
 * @param paymentId - ID del pago
 */
router.get('/:paymentId', validatePaymentId, paymentController.getPaymentStatus.bind(paymentController));

/**
 * @route POST /api/payments/:paymentId/cancel
 * @description Cancelar un pago
 * @param paymentId - ID del pago
 */
router.post('/:paymentId/cancel', validatePaymentId, paymentController.cancelPayment.bind(paymentController));

/**
 * @route POST /api/payments/webhook
 * @description Webhook para notificaciones de DLocal
 * @body DLocalWebhookPayload
 */
router.post('/webhook', paymentController.handleWebhook.bind(paymentController));

/**
 * @route GET /api/payments/methods
 * @description Obtener métodos de pago disponibles para un país
 * @query country - Código del país (ISO 3166-1 alpha-2)
 */
router.get('/methods', validateCountry, paymentController.getPaymentMethods.bind(paymentController));

export default router;
