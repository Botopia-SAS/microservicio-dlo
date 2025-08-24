import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

// Esquemas de validación
const paymentSchema = Joi.object({
  amount: Joi.number().positive().required(),
  currency: Joi.string().length(3).optional().default('USD'),
  country: Joi.string().length(2).optional().default('US'),
  payer: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    document: Joi.string().optional(),
    phone: Joi.string().optional(),
  }).required(),
  orderId: Joi.string().min(1).max(50).optional(),
  description: Joi.string().max(200).optional(),
  successUrl: Joi.string().uri().optional(),
  errorUrl: Joi.string().uri().optional(),
  cancelUrl: Joi.string().uri().optional(),
});

const paymentIdSchema = Joi.object({
  paymentId: Joi.string().required(),
});

const countrySchema = Joi.object({
  country: Joi.string().length(2).required(),
});

/**
 * Middleware para validar datos de creación de pago
 */
export const validatePaymentData = (req: Request, res: Response, next: NextFunction): void => {
  const { error } = paymentSchema.validate(req.body);
  
  if (error) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: error.details[0].message,
    });
    return;
  }
  
  next();
};

/**
 * Middleware para validar ID de pago
 */
export const validatePaymentId = (req: Request, res: Response, next: NextFunction): void => {
  const { error } = paymentIdSchema.validate(req.params);
  
  if (error) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: error.details[0].message,
    });
    return;
  }
  
  next();
};

/**
 * Middleware para validar parámetro de país
 */
export const validateCountry = (req: Request, res: Response, next: NextFunction): void => {
  const { error } = countrySchema.validate(req.query);
  
  if (error) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: error.details[0].message,
    });
    return;
  }
  
  next();
};
