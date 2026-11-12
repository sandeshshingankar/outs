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

Rental and deposit ledger rows are created with `disabled` status. Rent has no
checkout, webhook, escrow, refund, or payout route. The existing advertisement
payment integration is not called. The commission basis-point settings are
centralized in `rent_settings`; they are estimates only until a provider model
and legal settlement path are approved.

Bookings can be requested, approved/rejected, or cancelled. Later handover,
return, completion, dispute, evidence, and review schema/policies are reserved
for the gated workflow, but do not have complete student-facing screens yet.
Do not treat an approved booking as paid or confirmed.

## Manual verification checklist

- Apply migration and verify all RLS policies/functions compile in Supabase.
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
- Confirm payment controls remain disabled and evidence remains private.
- Test existing Tasks, Learn, Partner, auth, ads, and payment flows for
  regression.
