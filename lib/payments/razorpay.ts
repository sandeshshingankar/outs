import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

export type RazorpayCredentials = { keyId: string; keySecret: string; webhookSecret: string };

export function getRazorpayCredentials(): RazorpayCredentials | null {
  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret, RAZORPAY_WEBHOOK_SECRET: webhookSecret } = process.env;
  return keyId && keySecret && webhookSecret ? { keyId, keySecret, webhookSecret } : null;
}

export function secureStringEqual(expected: string, provided: string) {
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(provided, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function checkoutSignature(orderId: string, paymentId: string, secret: string) {
  return createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

export function webhookSignature(rawBody: string, secret: string) {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function razorpayAuthorization(credentials: RazorpayCredentials) {
  return `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString('base64')}`;
}
