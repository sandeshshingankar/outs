import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inrPerUsd, paypalApi, paypalReady, paypalToken } from '@/lib/payments/paypal';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!paypalReady()) return NextResponse.json({ error: 'PayPal Sandbox is not configured.' }, { status: 503 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Payment storage is unavailable.' }, { status: 503 });
  let body: { bookingId?: unknown };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  if (typeof body.bookingId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.bookingId)) return NextResponse.json({ error: 'Invalid booking.' }, { status: 400 });
  const { data: booking } = await supabase.from('rent_bookings').select('id,renter_id,owner_id,listing_id,starts_at,ends_at,rental_paise,status,payment_status').eq('id', body.bookingId).eq('renter_id', user.id).maybeSingle();
  if (!booking || !['owner_approved','payment_pending'].includes(booking.status) || !['disabled','pending','failed'].includes(booking.payment_status)) return NextResponse.json({ error: 'This booking is not eligible for checkout.' }, { status: 409 });
  const { data: listing } = await supabase.from('rent_listings').select('daily_price_paise,status,owner_id').eq('id', booking.listing_id).maybeSingle();
  if (!listing || listing.status !== 'published' || listing.owner_id !== booking.owner_id) return NextResponse.json({ error: 'Listing is unavailable.' }, { status: 409 });
  const duration = new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime();
  if (!Number.isFinite(duration) || duration <= 0) return NextResponse.json({ error: 'Invalid rental duration.' }, { status: 400 });
  const days = Math.ceil(duration / 86_400_000);
  const amountPaise = Number(listing.daily_price_paise) * days;
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 1 || amountPaise > 10_000_000) return NextResponse.json({ error: 'Checkout amount is outside the supported range.' }, { status: 400 });
  if (amountPaise !== Number(booking.rental_paise)) return NextResponse.json({ error: 'The saved booking price differs from the current listing. Create a new booking request.' }, { status: 409 });
  const rate = inrPerUsd();
  if (!rate) return NextResponse.json({ error: 'A reviewed INR-to-USD Sandbox quote is required.' }, { status: 503 });
  const amountMinor = Math.round(amountPaise / rate);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 1) return NextResponse.json({ error: 'The converted checkout amount is too small.' }, { status: 400 });
  try {
    const { data: existing } = await admin.from('rent_paypal_payments').select('paypal_order_id,amount_minor,payment_status').eq('booking_id', booking.id).maybeSingle();
    if (existing?.paypal_order_id && Number(existing.amount_minor) === amountMinor && existing.payment_status === 'pending') return NextResponse.json({ orderId: existing.paypal_order_id });
    if (existing?.paypal_order_id) return NextResponse.json({ error: 'A checkout already exists for this booking. Contact support if it failed.' }, { status: 409 });
    const token = await paypalToken();
    const response = await fetch(`${paypalApi()}/v2/checkout/orders`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `rent-${booking.id}` }, body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ reference_id: booking.id, custom_id: booking.id, amount: { currency_code: 'USD', value: (amountMinor / 100).toFixed(2) }, description: `OUTS Rent booking ${booking.id}` }] }), cache: 'no-store' });
    const order = await response.json() as { id?: string };
    if (!response.ok || !order.id) return NextResponse.json({ error: 'PayPal could not create the order.' }, { status: 502 });
    const { error } = await admin.from('rent_paypal_payments').insert({ booking_id: booking.id, user_id: user.id, paypal_order_id: order.id, amount_minor: amountMinor, currency: 'USD', payment_status: 'pending' });
    if (error) { console.error('PayPal order record failed:', error.message); return NextResponse.json({ error: 'Could not save checkout. Contact support before retrying.' }, { status: 503 }); }
    await admin.from('rent_bookings').update({ payment_status: 'pending', status: 'payment_pending' }).eq('id', booking.id).eq('status', 'owner_approved');
    return NextResponse.json({ orderId: order.id });
  } catch (error) {
    console.error('Rent PayPal order failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'PayPal checkout is temporarily unavailable.' }, { status: 502 });
  }
}
