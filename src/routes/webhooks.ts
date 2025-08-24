import { Router } from 'express';
import webhookController from '../controllers/webhookController';

const router = Router();

// Webhook de DLocal para actualizar status de payments
router.post('/dlocal', webhookController.handleDLocalWebhook);

// URL de éxito después del pago
router.get('/success', webhookController.handleSuccess);
router.post('/success', webhookController.handleSuccess);

// URL de error después del pago
router.get('/error', webhookController.handleError);
router.post('/error', webhookController.handleError);

export default router;