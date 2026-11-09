import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRazorpayCredentials, secureStringEqual, webhookSignature } from '@/lib/payments/razorpay';

type PaymentEntity = { id?: string; order_id?: string; amount?: number; currency?: string };
type RefundEntity = { id?: string; payment_id?: string };
type WebhookPayload = {
  event?: string;
  payload?: { payment?: { entity?: PaymentEntity }; refund?: { entity?: RefundEntity } };
};

export async function POST(request: Request) {
  const credentials = getRazorpayCredentials(); const admin = createAdminClient();
  if (!credentials || !admin) return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 503 });
  const rawBody = await request.text();
  const providedSignature = request.headers.get('x-razorpay-signature') ?? '';
  const eventId = request.headers.get('x-razorpay-event-id') ?? '';
  if (!eventId || !secureStringEqual(webhookSignature(rawBody, credentials.webhookSecret), providedSignature)) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 });
  }
  let event: WebhookPayload;
  try { event = JSON.parse(rawBody) as WebhookPayload; } catch { return NextResponse.json({ error: 'Invalid webhook body.' }, { status: 400 }); }
  if (!event.event) return NextResponse.json({ error: 'Webhook event is missing.' }, { status: 400 });

  const { error: insertError } = await admin.from('razorpay_webhook_events').insert({ event_id: eventId, event_type: event.event });
  if (insertError?.code === '23505') {
    const { data: prior } = await admin.from('razorpay_webhook_events').select('processed_at').eq('event_id', eventId).maybeSingle();
    if (prior?.processed_at) return NextResponse.json({ ok: true, duplicate: true });
  } else if (insertError) return NextResponse.json({ error: 'Webhook receipt could not be stored.' }, { status: 503 });

  try {
    const paymentEntity = event.payload?.payment?.entity;
    const refundEntity = event.payload?.refund?.entity;
    let state: 'paid' | 'failed' | 'refunded' | null = null;
    let paymentId: string | null = null;
    let refundId: string | null = null;
    let orderId: string | null = null;
    if (event.event === 'payment.captured') {
      if (!paymentEntity?.id || !paymentEntity.order_id || !paymentEntity.amount || paymentEntity.currency !== 'INR') throw new Error('Payment payload is incomplete.');
      orderId = paymentEntity.order_id; paymentId = paymentEntity.id; state = 'paid';
    } else if (event.event === 'payment.failed') {
      if (!paymentEntity?.order_id) throw new Error('Failed payment order is missing.');
      orderId = paymentEntity.order_id; paymentId = paymentEntity.id ?? null; state = 'failed';
    } else if (event.event === 'refund.processed') {
      if (!refundEntity?.payment_id) throw new Error('Refund payment reference is missing.');
      paymentId = refundEntity.payment_id; refundId = refundEntity.id ?? null; state = 'refunded';
    }
    if (state) {
      let lookup = admin.from('payment_transactions').select('id,task_id,amount_paise,razorpay_order_id,razorpay_payment_id,status');
      lookup = orderId ? lookup.eq('razorpay_order_id', orderId) : lookup.eq('razorpay_payment_id', paymentId!);
      const { data: transaction, error: lookupError } = await lookup.maybeSingle();
      if (lookupError || !transaction) throw new Error('Payment ledger reference was not found.');
      if (state === 'paid' && (transaction.amount_paise !== paymentEntity?.amount || transaction.razorpay_order_id !== orderId)) throw new Error('Payment amount or order does not match the ledger.');
      if (state === 'refunded' && transaction.razorpay_payment_id !== paymentId) throw new Error('Refund does not match a captured payment.');
      const { error: updateError } = transaction.task_id
        ? await admin.rpc('finalize_verified_task_payment', { p_transaction_id:transaction.id,p_state:state,p_payment_id:paymentId,p_refund_id:refundId })
        : await admin.rpc('set_verified_ad_payment_state', { p_transaction_id:transaction.id,p_state:state,p_payment_id:paymentId,p_refund_id:refundId });
      if (updateError) throw new Error(updateError.message);
    }
    await admin.from('razorpay_webhook_events').update({ processed_at: new Date().toISOString(), processing_error: null }).eq('event_id', eventId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook processing failed.';
    await admin.from('razorpay_webhook_events').update({ processing_error: message }).eq('event_id', eventId);
    console.error('Razorpay webhook processing failed:', message);
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 });
  }
}
