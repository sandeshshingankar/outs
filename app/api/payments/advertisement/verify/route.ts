import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkoutSignature, getRazorpayCredentials, razorpayAuthorization, secureStringEqual } from '@/lib/payments/razorpay';

type VerifyBody = { transactionId?: unknown; orderId?: unknown; paymentId?: unknown; signature?: unknown };
type RazorpayPayment = { id?: string; order_id?: string; amount?: number; currency?: string; status?: string };

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const credentials = getRazorpayCredentials(); const admin = createAdminClient();
  if (!credentials || !admin) return NextResponse.json({ error: 'Razorpay payments are not configured on the server.' }, { status: 503 });
  let input: VerifyBody;
  try { input = await request.json() as VerifyBody; } catch { return NextResponse.json({ error: 'Invalid payment response.' }, { status: 400 }); }
  if (typeof input.transactionId !== 'string' || typeof input.orderId !== 'string' || typeof input.paymentId !== 'string' || typeof input.signature !== 'string') {
    return NextResponse.json({ error: 'Incomplete payment response.' }, { status: 400 });
  }
  const { data: transaction } = await supabase.from('payment_transactions')
    .select('id,user_id,advertisement_id,razorpay_order_id,amount_paise,status')
    .eq('id', input.transactionId).eq('user_id', user.id).maybeSingle();
  if (!transaction || transaction.razorpay_order_id !== input.orderId) return NextResponse.json({ error: 'Payment order could not be verified.' }, { status: 404 });
  const expected = checkoutSignature(input.orderId, input.paymentId, credentials.keySecret);
  if (!secureStringEqual(expected, input.signature)) return NextResponse.json({ error: 'Payment signature is invalid.' }, { status: 400 });

  let paymentResponse: Response;
  try {
    paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(input.paymentId)}`, {
      headers: { Authorization: razorpayAuthorization(credentials) }, cache: 'no-store',
    });
  } catch { return NextResponse.json({ error: 'Could not verify payment with Razorpay.' }, { status: 502 }); }
  const payment = await paymentResponse.json() as RazorpayPayment;
  if (!paymentResponse.ok || payment.id !== input.paymentId || payment.order_id !== input.orderId
    || payment.amount !== Number(transaction.amount_paise) || payment.currency !== 'INR' || payment.status !== 'captured') {
    return NextResponse.json({ error: 'Razorpay has not confirmed a captured payment for this order.' }, { status: 409 });
  }
  const { error: finalizeError } = await admin.rpc('set_verified_ad_payment_state', {
    p_transaction_id: transaction.id, p_state: 'paid', p_payment_id: payment.id,
  });
  if (finalizeError) {
    console.error('Could not finalize verified ad payment:', finalizeError.message);
    return NextResponse.json({ error: 'Payment was verified but campaign records could not be updated. Contact support.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true, status: 'paid' });
}
