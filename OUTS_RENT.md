# OUTS Rent

OUTS Rent is an additive, verified-student rental marketplace. Apply
`supabase/migrations/202611150001_outs_rent.sql` after the existing migrations.
No migration has been applied to the connected Supabase project from this
workspace.

## Enable the college pilot

1. Apply the migration in Supabase.
2. Confirm the existing trusted verification process sets both
   `profiles.is_verified = true` and
   `profiles.student_verification_status = 'verified'`.
3. In `/admin`, open the OUTS Rent panel and enable the intended college.
   The pilot is disabled by default because the repository does not identify
   which campus has approval.
4. Test with verified and unverified accounts before enabling a real pilot.

Rent database access checks verification and enabled college membership in
Postgres. Listing and request access is limited to the same enabled college.
Private evidence files use the `outs-rent-private` bucket; listing images use
`outs-rent-images` and are public product images.

## Routes

- `/rent` — search published listings and filter by category, condition, and
  maximum daily price.
- `/rent/[id]` — listing details, estimate, availability request, and report.
- `/rent/list` — submit an item for admin approval.
- `/rent/requests` — browse requests, submit offers, and accept an offer.
- `/rent/requests/new` — publish a rental request.
- `/rent/my` — view listings, requests, and booking requests.
- `/api/admin/rent` — admin-only summary, pilot configuration, and listing
  moderation.

## Financial and workflow gates

Rental and deposit ledger rows remain disabled. Booking requests require owner
approval. Eligible approved bookings have an optional PayPal Sandbox-only
rental checkout, gated by `supabase/migrations/202611160001_rent_paypal_payments.sql`,
server credentials, and a manually reviewed INR/USD demo quote. PayPal's REST
currency list does not include INR, so the Sandbox order is USD; the deposit
and renter fee are not collected. Sandbox is not a real-money payment. OUTS
does not provide escrow, refunds, or seller payouts. The existing
advertisement Razorpay integration is not called. Commission settings remain
estimates only.

Bookings can be requested, approved/rejected, or cancelled. Later handover,
return, completion, dispute, evidence, and review schema/policies are reserved
for the gated workflow, but do not have complete student-facing screens yet.
Do not treat an approved booking as paid or confirmed.

## Manual verification checklist

- Apply migration and verify all RLS policies/functions compile in Supabase.
- Apply `202611150001_outs_rent.sql` before the dependent PayPal migration.
  Inspect project migration history and test on a non-production project;
  production application requires approval.
- Enable one college and verify both existing profile verification flags are
  required.
- Create a listing; confirm it is pending until an admin approves it.
- Verify users from other colleges cannot browse or book the listing.
- Upload six images or an oversized/non-image file and confirm rejection.
- Create competing bookings for overlapping periods and confirm only one
  request can reserve the listing.
- Create multiple offers for one request and accept concurrently; confirm one
  accepted offer and one booking at most.
- Confirm clients cannot change booking, payment, deposit, commission, ledger,
  or moderation state directly.
- Confirm payment succeeds only after PayPal Sandbox capture verification and
  evidence remains private.
- Test existing Tasks, Learn, Partner, auth, ads, and payment flows for
  regression.
