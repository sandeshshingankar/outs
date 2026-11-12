import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inrPerUsd, paypalApi, paypalReady, paypalToken } from '@/lib/payments/paypal';

type PayPalOrder = { id?: string; status?: string; purchase_units?: Array<{ custom_id?: string; amount?: { currency_code?: string; value?: string }; payments?: { captures?: Array<{ id?: string; status?: string; amount?: { currency_code?: string; value?: string } }> } }> };
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!paypalReady()) return NextResponse.json({ error: 'PayPal Sandbox is not configured.' }, { status: 503 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Payment storage is unavailable.' }, { status: 503 });
  let body: { orderId?: unknown };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  if (typeof body.orderId !== 'string' || body.orderId.length > 128) return NextResponse.json({ error: 'Invalid PayPal order.' }, { status: 400 });
  const { data: payment } = await admin.from('rent_paypal_payments').select('id,booking_id,user_id,paypal_order_id,paypal_capture_id,amount_minor,currency,payment_status').eq('paypal_order_id', body.orderId).eq('user_id', user.id).maybeSingle();
  if (!payment) return NextResponse.json({ error: 'Checkout could not be verified.' }, { status: 404 });
  const { data: booking } = await supabase.from('rent_bookings').select('id,renter_id,listing_id,starts_at,ends_at,rental_paise,status').eq('id', payment.booking_id).eq('renter_id', user.id).maybeSingle();
  if (payment.payment_status === 'completed' && payment.paypal_capture_id && booking?.status === 'confirmed') return NextResponse.json({ ok: true, status: 'completed' });
  if (!booking || booking.status !== 'payment_pending') return NextResponse.json({ error: 'Booking is no longer eligible for capture.' }, { status: 409 });
  const { data: listing } = await supabase.from('rent_listings').select('daily_price_paise').eq('id', booking.listing_id).maybeSingle();
  const days = Math.ceil((new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime()) / 86_400_000);
  const rate = inrPerUsd();
  const expectedPaise = Number(listing?.daily_price_paise) * days;
  const expectedMinor = rate ? Math.round(expectedPaise / rate) : 0;
  if (!listing || expectedPaise !== Number(booking.rental_paise) || expectedMinor !== Number(payment.amount_minor) || payment.currency !== 'USD') return NextResponse.json({ error: 'Booking price changed; capture was blocked.' }, { status: 409 });
  try {
    const token = await paypalToken();
    const response = await fetch(`${paypalApi()}/v2/checkout/orders/${encodeURIComponent(body.orderId)}/capture`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `capture-${payment.id}` }, body: '{}', cache: 'no-store' });
    let order = await response.json() as PayPalOrder;
    if (!response.ok && response.status !== 422) return NextResponse.json({ error: 'PayPal could not capture this order.' }, { status: 502 });
    if (response.status === 422) {
      const verifyResponse = await fetch(`${paypalApi()}/v2/checkout/orders/${encodeURIComponent(body.orderId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      order = await verifyResponse.json() as PayPalOrder;
    }
    const unit = order.purchase_units?.[0]; const capture = unit?.payments?.captures?.[0];
    const value = Number(capture?.amount?.value);
    if (order.id !== body.orderId || order.status !== 'COMPLETED' || unit?.custom_id !== booking.id || capture?.status !== 'COMPLETED' || capture.amount?.currency_code !== 'USD' || Math.round(value * 100) !== Number(payment.amount_minor) || !capture.id) return NextResponse.json({ error: 'PayPal has not confirmed the expected completed capture.' }, { status: 409 });
    if (payment.payment_status !== 'completed') {
      const { data: saved, error: paymentError } = await admin.from('rent_paypal_payments').update({ paypal_capture_id: capture.id, payment_status: 'completed', updated_at: new Date().toISOString() }).eq('id', payment.id).eq('payment_status', 'pending').select('id').maybeSingle();
      if (paymentError || !saved) { console.error('PayPal capture record failed:', paymentError?.message ?? 'payment was concurrently changed'); return NextResponse.json({ error: 'Payment was verified but could not be recorded. Contact support.' }, { status: 503 }); }
    }
    const { data: finalized, error: bookingError } = await admin.from('rent_bookings').update({ payment_status: 'paid', status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', booking.id).eq('status', 'payment_pending').select('id').maybeSingle();
    if (bookingError || !finalized) {
      const { data: current } = await admin.from('rent_bookings').select('status,payment_status').eq('id', booking.id).maybeSingle();
      if (current?.status !== 'confirmed' || current.payment_status !== 'paid') { console.error('Rent booking finalization failed:', bookingError?.message ?? 'booking state changed'); return NextResponse.json({ error: 'Payment verified but booking finalization failed. Contact support.' }, { status: 503 }); }
    }
    return NextResponse.json({ ok: true, status: 'completed' });
  } catch (error) {
    console.error('Rent PayPal capture failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not verify the PayPal capture.' }, { status: 502 });
  }
}
