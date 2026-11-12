import 'server-only';

const baseUrl = () => (process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com').replace(/\/$/, '');
export function inrPerUsd() { const value = Number(process.env.PAYPAL_INR_PER_USD); return Number.isFinite(value) && value >= 1 && value <= 1000 ? value : null; }
export function paypalReady() {
  try { const url = new URL(baseUrl()); return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET && url.protocol === 'https:' && url.hostname === 'api-m.sandbox.paypal.com' && inrPerUsd()); } catch { return false; }
}
export async function paypalToken() {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret || !paypalReady()) throw new Error('PayPal Sandbox is not configured.');
  const response = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials', cache: 'no-store',
  });
  const data = await response.json() as { access_token?: string };
  if (!response.ok || !data.access_token) throw new Error('Could not authenticate with PayPal Sandbox.');
  return data.access_token;
}
export const paypalApi = () => baseUrl();
