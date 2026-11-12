import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRazorpayCredentials, razorpayAuthorization } from '@/lib/payments/razorpay';

type RazorpayOrder = { id?: string; amount?: number; currency?: string; error?: { description?: string } };

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const credentials = getRazorpayCredentials();
  const adminClient = createAdminClient();
  if (!credentials || !adminClient) return NextResponse.json({ error: 'Razorpay payments are not configured on the server.' }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const campaignId = body && typeof body === 'object' ? (body as { campaignId?: unknown }).campaignId : null;
  if (typeof campaignId !== 'string' || !/^[0-9a-f-]{36}$/i.test(campaignId)) return NextResponse.json({ error: 'Invalid campaign.' }, { status: 400 });

  const { data: campaign, error: campaignError } = await supabase.from('advertisements')
    .select('id,status,payment_status,total_price').eq('id', campaignId).eq('advertiser_id', user.id).maybeSingle();
  if (campaignError || !campaign) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
  if (!['draft','rejected'].includes(campaign.status) || ['paid','refunded'].includes(campaign.payment_status)) {
    return NextResponse.json({ error: 'This campaign is not eligible for payment.' }, { status: 409 });
  }
  const amountPaise = Math.round(Number(campaign.total_price) * 100);
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) return NextResponse.json({ error: 'Campaign amount is invalid.' }, { status: 400 });
  async function getPendingTransaction(
    client: NonNullable<typeof adminClient>,
    userId: string,
    campaignId: string,
  ) {
    return client.from('payment_transactions').select('id,razorpay_order_id,amount_paise')
      .eq('user_id', userId).eq('advertisement_id', campaignId).eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
  }
  function existingOrderResponse(
    transaction: { id: string; razorpay_order_id: string | null; amount_paise: number },
    campaignId: string,
    keyId: string,
  ) {
    if (!transaction.razorpay_order_id) {
      return NextResponse.json({ error: 'A payment order is still being prepared. Retry shortly.' }, { status: 409 });
    }
    if (Number(transaction.amount_paise) !== amountPaise) {
      return NextResponse.json({ error: 'A pending payment exists for a different campaign amount. Contact support before retrying.' }, { status: 409 });
    }
    return NextResponse.json({
      keyId,
      orderId: transaction.razorpay_order_id,
      transactionId: transaction.id,
      amount: amountPaise,
      currency: 'INR',
      name: 'OUTS advertisements',
      description: campaignId,
    });
  }
  const { data: pending, error: pendingError } = await getPendingTransaction(adminClient, user.id, campaign.id);
  if (pendingError) return NextResponse.json({ error: 'Could not check the existing payment order.' }, { status: 503 });
  if (pending) return existingOrderResponse(pending, campaign.id, credentials.keyId);

  const lockToken = crypto.randomUUID();
  const { data: lockAcquired, error: lockError } = await adminClient.rpc('claim_advertisement_payment_order_lock', {
    p_advertisement_id: campaign.id,
    p_lock_token: lockToken,
  });
  if (lockError) {
    console.error('Could not claim advertisement payment order lock:', lockError.message);
    return NextResponse.json({ error: 'Could not safely start a payment order. Retry shortly.' }, { status: 503 });
  }
  if (!lockAcquired) {
    const { data: concurrent, error: concurrentError } = await getPendingTransaction(adminClient, user.id, campaign.id);
    if (concurrentError) return NextResponse.json({ error: 'Could not check the existing payment order.' }, { status: 503 });
    if (concurrent) return existingOrderResponse(concurrent, campaign.id, credentials.keyId);
    return NextResponse.json({ error: 'A payment order is already being prepared. Retry shortly.' }, { status: 409 });
  }

  try {
    const { data: latest, error: latestError } = await getPendingTransaction(adminClient, user.id, campaign.id);
    if (latestError) return NextResponse.json({ error: 'Could not check the existing payment order.' }, { status: 503 });
    if (latest) return existingOrderResponse(latest, campaign.id, credentials.keyId);

    const orderResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: razorpayAuthorization(credentials), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt: `outs-${campaign.id.slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}`,
        notes: { advertisement_id: campaign.id, advertiser_id: user.id },
      }),
      cache: 'no-store',
    });
    const order = await orderResponse.json() as RazorpayOrder;
    if (!orderResponse.ok || !order.id || order.amount !== amountPaise || order.currency !== 'INR') {
      console.error('Razorpay order creation failed with HTTP status', orderResponse.status);
      return NextResponse.json({ error: 'Could not create a verified Razorpay order.' }, { status: 502 });
    }
    const { data: transaction, error: transactionError } = await adminClient.from('payment_transactions').insert({
      user_id: user.id,
      advertisement_id: campaign.id,
      razorpay_order_id: order.id,
      amount_paise: amountPaise,
      currency: 'INR',
      status: 'pending',
    }).select('id').single();
    if (transactionError || !transaction) {
      console.error('Could not persist Razorpay order reference:', transactionError?.message);
      return NextResponse.json({ error: 'The payment order was created but could not be recorded. Contact support before retrying.' }, { status: 503 });
    }
    return NextResponse.json({
      keyId: credentials.keyId,
      orderId: order.id,
      transactionId: transaction.id,
      amount: amountPaise,
      currency: 'INR',
      name: 'OUTS advertisements',
      description: campaign.id,
    });
  } catch (orderError) {
    console.error('Razorpay order creation request failed:', orderError instanceof Error ? orderError.message : 'unknown error');
    return NextResponse.json({ error: 'Razorpay order service is unreachable.' }, { status: 502 });
  } finally {
    const { error: releaseError } = await adminClient.rpc('release_advertisement_payment_order_lock', {
      p_advertisement_id: campaign.id,
      p_lock_token: lockToken,
    });
    if (releaseError) console.error('Could not release advertisement payment order lock:', releaseError.message);
  }
}
