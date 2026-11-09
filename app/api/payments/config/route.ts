import { NextResponse } from 'next/server';
import { getRazorpayCredentials } from '@/lib/payments/razorpay';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const advertisementPaymentsReady=Boolean(getRazorpayCredentials()&&createAdminClient());
  return NextResponse.json({
    advertisementPaymentsReady,
    taskPaymentsReady:false,
    taskMessage:'Task checkout is disabled until an approved Razorpay Route linked-account and provider settlement workflow is implemented and tested. Standard Checkout is not escrow.',
  },{headers:{'cache-control':'no-store'}});
}
