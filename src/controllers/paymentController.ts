import { Request, Response } from 'express';
import dLocalService from '../services/dLocalService';
import { DLocalPaymentRequest } from '../types';
import { generateTransactionId, isValidAmount } from '../utils/helpers';

export class PaymentController {
  /**
   * Endpoint simple para crear pagos - acepta amount, currency y country
   */
  async createSimplePayment(req: Request, res: Response): Promise<void> {
    try {
      const { amount, currency = 'USD', country = 'US' } = req.body;

      // Validación simple
      if (!amount || !isValidAmount(amount)) {
        res.status(400).json({
          success: false,
          error: 'Valid amount is required',
        });
        return;
      }

      // Validar moneda y país
      const validCurrencies = ['USD', 'COP', 'BRL', 'MXN', 'ARS'];
      const validCountries = ['US', 'CO', 'BR', 'MX', 'AR'];
      
      if (!validCurrencies.includes(currency.toUpperCase())) {
        res.status(400).json({
          success: false,
          error: 'Invalid currency. Supported: USD, COP, BRL, MXN, ARS',
        });
        return;
      }

      if (!validCountries.includes(country.toUpperCase())) {
        res.status(400).json({
          success: false,
          error: 'Invalid country. Supported: US, CO, BR, MX, AR',
        });
        return;
      }

      // Configurar el pago
      const orderId = generateTransactionId();
      const dLocalPaymentData: DLocalPaymentRequest = {
        amount: this.formatAmount(amount, currency),
        currency: currency.toUpperCase(),
        country: country.toUpperCase(),
        order_id: orderId,
        description: 'Test Payment',
        notification_url: `${req.protocol}://${req.get('host')}/api/payments/webhook`,
        success_url: 'http://localhost:3000/success',
        back_url: 'http://localhost:3000/cancel',
      };

      // Crear el pago en DLocal
      const result = await dLocalService.createPayment(dLocalPaymentData);

      if (result.success && result.data) {
        res.status(201).json({
          success: true,
          paymentLink: result.data.redirect_url,
          paymentId: result.data.id,
          orderId: result.data.order_id,
          amount: result.data.amount,
          currency: result.data.currency,
          country: result.data.country,
          status: result.data.status,
        });
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in createSimplePayment:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to create payment',
      });
    }
  }

  /**
   * Formatea el monto según la moneda
   */
  private formatAmount(amount: number, currency: string): number {
    const upperCurrency = currency.toUpperCase();
    
    // Para COP (peso colombiano), usar el monto directo ya que DLocal espera centavos
    if (upperCurrency === 'COP') {
      return Math.min(amount * 100, 100000); // Máximo 1000 COP para sandbox
    }
    
    // Para USD y otras monedas, usar centavos
    return Math.min(amount * 100, 1000); // Máximo $10 USD para sandbox
  }

  /**
   * Obtiene el estado de un pago
   */
  async getPaymentStatus(req: Request, res: Response): Promise<void> {
    try {
      const { paymentId } = req.params;

      if (!paymentId) {
        res.status(400).json({
          success: false,
          error: 'Payment ID is required',
        });
        return;
      }

      const result = await dLocalService.getPaymentStatus(paymentId);
      res.status(result.success ? 200 : 404).json(result);
    } catch (error) {
      console.error('Error in getPaymentStatus:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * Crea un pago completo (para compatibilidad con rutas existentes)
   */
  async createPayment(req: Request, res: Response): Promise<void> {
    // Redirigir al método simple
    await this.createSimplePayment(req, res);
  }

  /**
   * Cancela un pago
   */
  async cancelPayment(req: Request, res: Response): Promise<void> {
    try {
      const { paymentId } = req.params;

      if (!paymentId) {
        res.status(400).json({
          success: false,
          error: 'Payment ID is required',
        });
        return;
      }

      // Por ahora, solo retornar un mensaje ya que cancelar requiere implementación específica
      res.status(200).json({
        success: true,
        message: 'Cancel payment functionality not implemented yet',
        paymentId,
      });
    } catch (error) {
      console.error('Error in cancelPayment:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * Obtiene métodos de pago disponibles
   */
  async getPaymentMethods(req: Request, res: Response): Promise<void> {
    try {
      const { country } = req.query;

      if (!country || typeof country !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Country parameter is required',
        });
        return;
      }

      // Métodos de pago simulados por país
      const paymentMethods = {
        CO: ['CARD', 'PSE', 'EFECTY', 'BANK_TRANSFER'],
        US: ['CARD', 'ACH', 'WIRE_TRANSFER'],
        BR: ['CARD', 'PIX', 'BOLETO', 'BANK_TRANSFER'],
        MX: ['CARD', 'SPEI', 'OXXO', 'BANK_TRANSFER'],
        AR: ['CARD', 'RAPIPAGO', 'PAGOFACIL', 'BANK_TRANSFER'],
      };

      const methods = paymentMethods[country.toUpperCase() as keyof typeof paymentMethods] || ['CARD'];

      res.status(200).json({
        success: true,
        data: {
          country: country.toUpperCase(),
          methods,
        },
      });
    } catch (error) {
      console.error('Error in getPaymentMethods:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * Maneja los webhooks de DLocal
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      console.log('Webhook received:', req.body);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error in handleWebhook:', error);
      res.status(500).json({ success: false });
    }
  }
}

export default new PaymentController();
