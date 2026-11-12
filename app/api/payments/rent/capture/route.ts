import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { paypalApi, paypalCredentialsReady, paypalToken } from '@/lib/payments/paypal';
import { getBillableRentalDays, getRentalEstimatePaise } from '@/lib/rent/pricing';

type PayPalOrder = {
  id?: string;
  status?: string;
  purchase_units?: Array<{
    reference_id?: string;
    custom_id?: string;
    amount?: { currency_code?: string; value?: string };
    payments?: { captures?: Array<{ id?: string; status?: string; amount?: { currency_code?: string; value?: string } }> };
  }>;
};
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!paypalCredentialsReady()) return NextResponse.json({ error: 'PayPal Sandbox is not configured.' }, { status: 503 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Payment storage is unavailable.' }, { status: 503 });
  let body: { orderId?: unknown };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  if (typeof body.orderId !== 'string' || body.orderId.length > 128) return NextResponse.json({ error: 'Invalid PayPal order.' }, { status: 400 });
  const { data: payment, error: paymentLookupError } = await admin.from('rent_paypal_payments')
    .select('id,booking_id,user_id,paypal_order_id,paypal_capture_id,amount_minor,amount_inr_paise,inr_per_usd,currency,payment_status')
    .eq('paypal_order_id', body.orderId).eq('user_id', user.id).maybeSingle();
  if (paymentLookupError) return NextResponse.json({ error: 'Could not verify the checkout record.' }, { status: 503 });
  if (!payment) return NextResponse.json({ error: 'Checkout could not be verified.' }, { status: 404 });
  if (!['pending', 'completed'].includes(payment.payment_status)) return NextResponse.json({ error: 'This checkout is not eligible for capture.' }, { status: 409 });
  const { data: booking } = await supabase.from('rent_bookings')
    .select('id,renter_id,owner_id,listing_id,starts_at,ends_at,rental_paise,status')
    .eq('id', payment.booking_id).eq('renter_id', user.id).maybeSingle();
  if (payment.payment_status === 'completed' && payment.paypal_capture_id && booking?.status === 'confirmed') return NextResponse.json({ ok: true, status: 'completed' });
  if (!booking || booking.status !== 'payment_pending') return NextResponse.json({ error: 'Booking is no longer eligible for capture.' }, { status: 409 });
  const { data: listing } = await supabase.from('rent_listings').select('daily_price_paise,status,owner_id').eq('id', booking.listing_id).maybeSingle();
  const days = getBillableRentalDays(new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime());
  const expectedPaise = listing && days ? getRentalEstimatePaise(Number(listing.daily_price_paise), days) : null;
  const savedPaise = Number(payment.amount_inr_paise);
  const savedRate = Number(payment.inr_per_usd);
  const expectedMinor = Number.isFinite(savedRate) && savedRate > 0 && expectedPaise !== null
    ? Math.round(expectedPaise / savedRate)
    : 0;
  if (!listing || listing.status !== 'published' || listing.owner_id !== booking.owner_id ||
    expectedPaise === null || expectedPaise !== Number(booking.rental_paise) ||
    expectedPaise !== savedPaise || !Number.isFinite(savedRate) || savedRate < 1 || savedRate > 1000 ||
    expectedMinor !== Number(payment.amount_minor) || payment.currency !== 'USD') {
    return NextResponse.json({ error: 'Booking price changed or listing is unavailable; capture was blocked.' }, { status: 409 });
  }
  try {
    const token = await paypalToken();
    const response = await fetch(`${paypalApi()}/v2/checkout/orders/${encodeURIComponent(body.orderId)}/capture`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': payment.id }, body: '{}', cache: 'no-store' });
    let order = await response.json() as PayPalOrder;
    if (!response.ok && response.status !== 422) return NextResponse.json({ error: 'PayPal could not capture this order.' }, { status: 502 });
    if (response.status === 422) {
      const verifyResponse = await fetch(`${paypalApi()}/v2/checkout/orders/${encodeURIComponent(body.orderId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!verifyResponse.ok) return NextResponse.json({ error: 'PayPal could not verify the existing order.' }, { status: 502 });
      order = await verifyResponse.json() as PayPalOrder;
    }
    const unit = order.purchase_units?.[0];
    const captures = unit?.payments?.captures ?? [];
    const capture = captures[0];
    const value = Number(capture?.amount?.value);
    const orderValue = Number(unit?.amount?.value);
    if (!unit || order.id !== body.orderId || order.status !== 'COMPLETED' || order.purchase_units?.length !== 1 ||
      unit.reference_id !== booking.id || unit.custom_id !== booking.id ||
      unit.amount?.currency_code !== 'USD' || Math.round(orderValue * 100) !== Number(payment.amount_minor) ||
      captures.length !== 1 || capture?.status !== 'COMPLETED' || capture.amount?.currency_code !== 'USD' ||
      Math.round(value * 100) !== Number(payment.amount_minor) || !capture.id) {
      return NextResponse.json({ error: 'PayPal has not confirmed the expected completed capture.' }, { status: 409 });
    }
    if (payment.payment_status === 'completed' && payment.paypal_capture_id !== capture.id) {
      return NextResponse.json({ error: 'The verified capture does not match the saved payment record.' }, { status: 409 });
    }
    if (payment.payment_status !== 'completed') {
      const { data: saved, error: paymentError } = await admin.from('rent_paypal_payments').update({ paypal_capture_id: capture.id, payment_status: 'completed', updated_at: new Date().toISOString() }).eq('id', payment.id).eq('payment_status', 'pending').select('id').maybeSingle();
      if (paymentError || !saved) {
        const { data: current, error: currentError } = await admin.from('rent_paypal_payments')
          .select('paypal_capture_id,payment_status').eq('id', payment.id).maybeSingle();
        if (currentError || current?.payment_status !== 'completed' || current.paypal_capture_id !== capture.id) {
          console.error('PayPal capture record failed:', paymentError?.message ?? 'payment was concurrently changed');
          return NextResponse.json({ error: 'Payment was verified but could not be recorded. Contact support.' }, { status: 503 });
        }
      }
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
