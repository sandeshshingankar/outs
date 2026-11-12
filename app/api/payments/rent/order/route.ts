import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inrPerUsd, paypalApi, paypalReady, paypalToken } from '@/lib/payments/paypal';
import { getBillableRentalDays, getRentalEstimatePaise } from '@/lib/rent/pricing';

type ExistingPayment = {
  id: string;
  paypal_order_id: string | null;
  amount_minor: number;
  amount_inr_paise: number | null;
  inr_per_usd: number | null;
  payment_status: string;
};

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
  const days = getBillableRentalDays(duration);
  if (!days) return NextResponse.json({ error: 'Invalid rental duration.' }, { status: 400 });
  const amountPaise = getRentalEstimatePaise(Number(listing.daily_price_paise), days);
  if (amountPaise === null || amountPaise > 10_000_000) return NextResponse.json({ error: 'Checkout amount is outside the supported range.' }, { status: 400 });
  if (amountPaise !== Number(booking.rental_paise)) return NextResponse.json({ error: 'The saved booking price differs from the current listing. Create a new booking request.' }, { status: 409 });
  const configuredRate = inrPerUsd();
  if (!configuredRate) return NextResponse.json({ error: 'A reviewed INR-to-USD Sandbox quote is required.' }, { status: 503 });
  const rate = Math.round(configuredRate * 1e10) / 1e10;
  const amountMinor = Math.round(amountPaise / rate);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 1) return NextResponse.json({ error: 'The converted checkout amount is too small.' }, { status: 400 });
  let replaceLegacyOrder = false;
  async function ensurePaymentPending(
    client: NonNullable<typeof admin>,
    bookingId: string,
    bookingStatus: string,
  ) {
    if (bookingStatus !== 'owner_approved') return null;
    const { data: updated, error: updateError } = await client.from('rent_bookings')
      .update({ payment_status: 'pending', status: 'payment_pending' })
      .eq('id', bookingId).eq('status', 'owner_approved').select('id').maybeSingle();
    if (updateError) return NextResponse.json({ error: 'Checkout exists, but the booking state could not be updated. Retry shortly.' }, { status: 503 });
    if (!updated) {
      const { data: current, error: currentError } = await client.from('rent_bookings')
        .select('status').eq('id', bookingId).maybeSingle();
      if (currentError || current?.status !== 'payment_pending') {
        return NextResponse.json({ error: 'The booking is no longer eligible for checkout.' }, { status: 409 });
      }
    }
    return null;
  }
  try {
    const { data: existing, error: existingError } = await admin.from('rent_paypal_payments')
      .select('id,paypal_order_id,amount_minor,amount_inr_paise,inr_per_usd,payment_status')
      .eq('booking_id', booking.id).maybeSingle();
    if (existingError) return NextResponse.json({ error: 'Could not check the existing checkout record.' }, { status: 503 });
    const existingPayment = existing as ExistingPayment | null;
    if (existingPayment && existingPayment.payment_status !== 'pending') {
      return NextResponse.json({ error: 'This booking already has a non-pending payment record. Contact support before retrying.' }, { status: 409 });
    }
    if (existingPayment?.payment_status === 'pending' && existingPayment.paypal_order_id) {
      if (existingPayment.amount_inr_paise === null || existingPayment.inr_per_usd === null) {
        if (Number(existingPayment.amount_minor) === amountMinor) {
          const { data: updatedSnapshot, error: snapshotError } = await admin.from('rent_paypal_payments')
            .update({ amount_inr_paise: amountPaise, inr_per_usd: rate })
            .eq('id', existingPayment.id).eq('payment_status', 'pending')
            .is('amount_inr_paise', null).is('inr_per_usd', null).select('id').maybeSingle();
          if (snapshotError) return NextResponse.json({ error: 'Could not save the checkout conversion quote.' }, { status: 503 });
          if (updatedSnapshot) {
            const bookingUpdateError = await ensurePaymentPending(admin, booking.id, booking.status);
            if (bookingUpdateError) return bookingUpdateError;
            return NextResponse.json({
              orderId: existingPayment.paypal_order_id,
              amountInrPaise: amountPaise,
              inrPerUsd: rate,
              amountMinor,
            });
          }
          return NextResponse.json({ error: 'Checkout is being updated. Retry in a moment.' }, { status: 409 });
        }
        replaceLegacyOrder = true;
      } else {
        const storedAmountPaise = Number(existingPayment.amount_inr_paise);
        const storedRate = Number(existingPayment.inr_per_usd);
        const storedAmountMinor = Number(existingPayment.amount_minor);
        if (storedAmountPaise !== amountPaise || !Number.isFinite(storedRate) ||
          storedRate < 1 || storedRate > 1000 ||
          Math.round(storedAmountPaise / storedRate) !== storedAmountMinor) {
          return NextResponse.json({ error: 'The saved checkout quote does not match this booking. Contact support before retrying.' }, { status: 409 });
        }
        const bookingUpdateError = await ensurePaymentPending(admin, booking.id, booking.status);
        if (bookingUpdateError) return bookingUpdateError;
        return NextResponse.json({
          orderId: existingPayment.paypal_order_id,
          amountInrPaise: storedAmountPaise,
          inrPerUsd: storedRate,
          amountMinor: storedAmountMinor,
        });
      }
    }
    const token = await paypalToken();
    const response = await fetch(`${paypalApi()}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': replaceLegacyOrder ? `${booking.id}-${crypto.randomUUID()}` : booking.id,
      },
      body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ reference_id: booking.id, custom_id: booking.id, amount: { currency_code: 'USD', value: (amountMinor / 100).toFixed(2) }, description: `OUTS Rent booking ${booking.id}` }] }),
      cache: 'no-store',
    });
    const order = await response.json() as {
      id?: string;
      status?: string;
      purchase_units?: Array<{ reference_id?: string; custom_id?: string; amount?: { currency_code?: string; value?: string } }>;
    };
    const unit = order.purchase_units?.[0];
    if (!response.ok || !order.id || order.status !== 'CREATED' || order.purchase_units?.length !== 1 || !unit ||
      unit.reference_id !== booking.id || unit.custom_id !== booking.id ||
      unit.amount?.currency_code !== 'USD' || Math.round(Number(unit.amount.value) * 100) !== amountMinor) {
      return NextResponse.json({ error: 'PayPal did not return the expected order and amount.' }, { status: 502 });
    }
    const paymentValues = {
      booking_id: booking.id,
      user_id: user.id,
      paypal_order_id: order.id,
      amount_minor: amountMinor,
      amount_inr_paise: amountPaise,
      inr_per_usd: rate,
      currency: 'USD',
      payment_status: 'pending',
    };
    const paymentWrite = existingPayment
      ? await admin.from('rent_paypal_payments').update(paymentValues)
        .eq('id', existingPayment.id).eq('payment_status', 'pending').select('id').maybeSingle()
      : await admin.from('rent_paypal_payments').insert(paymentValues).select('id').single();
    const error = paymentWrite.error;
    if (error || !paymentWrite.data) {
      console.error('PayPal order record failed:', error?.message ?? 'payment row was concurrently changed');
      return NextResponse.json({ error: 'Could not save checkout. Contact support before retrying.' }, { status: 503 });
    }
    if (booking.status === 'owner_approved') {
      const { data: updated, error: updateError } = await admin.from('rent_bookings')
        .update({ payment_status: 'pending', status: 'payment_pending' })
        .eq('id', booking.id).eq('status', 'owner_approved').select('id').maybeSingle();
      if (updateError) return NextResponse.json({ error: 'Checkout was saved, but booking state could not be updated. Retry to resume checkout.' }, { status: 503 });
      if (!updated) {
        const { data: current, error: currentError } = await admin.from('rent_bookings').select('status').eq('id', booking.id).maybeSingle();
        if (currentError || current?.status !== 'payment_pending') return NextResponse.json({ error: 'Checkout was saved, but the booking is no longer eligible.' }, { status: 409 });
      }
    }
    return NextResponse.json({ orderId: order.id, amountInrPaise: amountPaise, inrPerUsd: rate, amountMinor });
  } catch (error) {
    console.error('Rent PayPal order failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'PayPal checkout is temporarily unavailable.' }, { status: 502 });
  }
}
