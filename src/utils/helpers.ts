import crypto from 'crypto';
import { randomUUID } from 'crypto';

/**
 * Genera una firma HMAC SHA256 para DLocal
 */
export const generateDLocalSignature = (
  payload: string,
  timestamp: string,
  secretKey: string
): string => {
  const message = `${timestamp}.${payload}`;
  return crypto
    .createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');
};

/**
 * Verifica la firma de un webhook de DLocal
 */
export const verifyWebhookSignature = (
  payload: string,
  timestamp: string,
  signature: string,
  secretKey: string
): boolean => {
  const expectedSignature = generateDLocalSignature(payload, timestamp, secretKey);
  return signature === expectedSignature;
};

/**
 * Genera un ID único para las transacciones
 */
export const generateTransactionId = (): string => {
  return randomUUID();
};

/**
 * Formatea el monto para DLocal (en centavos)
 */
export const formatAmountForDLocal = (amount: number): number => {
  return Math.round(amount * 100);
};

/**
 * Formatea el monto desde DLocal (de centavos a unidades)
 */
export const formatAmountFromDLocal = (amount: number): number => {
  return amount / 100;
};

/**
 * Valida si un email es válido
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Valida si un monto es válido
 */
export const isValidAmount = (amount: number): boolean => {
  return amount > 0 && Number.isFinite(amount);
};

/**
 * Sanitiza una cadena de texto
 */
export const sanitizeString = (str: string): string => {
  return str.trim().replace(/[<>\"']/g, '');
};

/**
 * Genera timestamp para DLocal
 */
export const generateTimestamp = (): string => {
  return Math.floor(Date.now() / 1000).toString();
};
