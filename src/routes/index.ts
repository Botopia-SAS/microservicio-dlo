import { Router } from 'express';
import paymentsRouter from './payments';
import subscriptionsRouter from './subscriptions';
import webhooksRouter from './webhooks';

const router = Router();

// Ruta de health check
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'DLocal Payment & Subscription Gateway API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Rutas de pagos (mantenidas para compatibilidad)
router.use('/payments', paymentsRouter);

// Rutas de suscripciones
router.use('/subscriptions', subscriptionsRouter);

// Rutas de webhooks
router.use('/webhooks', webhooksRouter);

export default router;
