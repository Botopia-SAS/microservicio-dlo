import { Router } from 'express';
import subscriptionController from '../controllers/subscriptionController';

const router = Router();

// Create subscription with user and plan IDs
router.post('/create', subscriptionController.createSubscriptionWithUser);

// Get all subscription plans
router.get('/plans', subscriptionController.getAllPlans);

// Create subscription plan
router.post('/plans', subscriptionController.createSimplePlan);

// Get subscription plan by ID
router.get('/plans/:id', subscriptionController.getPlan);

// Webhook endpoint
router.post('/webhook', subscriptionController.handleWebhook);

export default router;