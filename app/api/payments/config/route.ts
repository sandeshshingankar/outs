import { NextResponse } from 'next/server';
import { getRazorpayCredentials } from '@/lib/payments/razorpay';
import { createAdminClient } from '@/lib/supabase/admin';
import { inrPerUsd, paypalReady } from '@/lib/payments/paypal';

export async function GET() {
  const advertisementPaymentsReady=Boolean(getRazorpayCredentials()&&createAdminClient());
  const rentPaypalReady=paypalReady()&&Boolean(createAdminClient());
  return NextResponse.json({
    advertisementPaymentsReady,
    rentPaypalReady,
    paypalClientId: rentPaypalReady ? process.env.PAYPAL_CLIENT_ID : null,
    paypalCurrency: 'USD',
    paypalInrPerUsd: rentPaypalReady ? inrPerUsd() : null,
    taskPaymentsReady:false,
    taskMessage:'Task checkout is disabled until an approved Razorpay Route linked-account and provider settlement workflow is implemented and tested. Standard Checkout is not escrow.',
  },{headers:{'cache-control':'no-store'}});
}
