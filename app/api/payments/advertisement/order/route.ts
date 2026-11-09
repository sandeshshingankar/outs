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
  const admin = createAdminClient();
  if (!credentials || !admin) return NextResponse.json({ error: 'Razorpay payments are not configured on the server.' }, { status: 503 });
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
  const { data: recent } = await supabase.from('payment_transactions').select('id')
    .eq('user_id', user.id).eq('advertisement_id', campaign.id)
    .gte('created_at', new Date(Date.now() - 30000).toISOString()).limit(1);
  if (recent?.length) return NextResponse.json({ error: 'A payment order was created recently. Complete it or wait 30 seconds before retrying.' }, { status: 429 });

  const amountPaise = Math.round(Number(campaign.total_price) * 100);
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) return NextResponse.json({ error: 'Campaign amount is invalid.' }, { status: 400 });
  let orderResponse: Response;
  try {
    orderResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST', headers: { Authorization: razorpayAuthorization(credentials), 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt: `outs-${campaign.id.slice(0,8)}-${crypto.randomUUID().slice(0,8)}`, notes: { advertisement_id: campaign.id, advertiser_id: user.id } }),
      cache: 'no-store',
    });
  } catch { return NextResponse.json({ error: 'Razorpay order service is unreachable.' }, { status: 502 }); }
  const order = await orderResponse.json() as RazorpayOrder;
  if (!orderResponse.ok || !order.id || order.amount !== amountPaise || order.currency !== 'INR') {
    console.error('Razorpay order creation failed with HTTP status', orderResponse.status);
    return NextResponse.json({ error: 'Could not create a verified Razorpay order.' }, { status: 502 });
  }
  const { data: transaction, error: transactionError } = await admin.from('payment_transactions').insert({
    user_id: user.id, advertisement_id: campaign.id, razorpay_order_id: order.id,
    amount_paise: amountPaise, currency: 'INR', status: 'pending',
  }).select('id').single();
  if (transactionError || !transaction) {
    console.error('Could not persist Razorpay order reference:', transactionError?.message);
    return NextResponse.json({ error: 'The payment order was created but could not be recorded. Contact support before retrying.' }, { status: 503 });
  }
  return NextResponse.json({ keyId: credentials.keyId, orderId: order.id, transactionId: transaction.id, amount: amountPaise, currency: 'INR', name: 'OUTS advertisements', description: campaign.id });
}
