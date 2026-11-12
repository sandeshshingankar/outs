# Testing and demo checklist

The repository scripts are `npm run lint` and `npm run build`. There is no dedicated test script or automated end-to-end suite in `package.json`.

## Required environment

Configure Supabase URL and publishable key. Review the existing project's migration history before considering any SQL. The exact added migration names are `202611150001_outs_rent.sql`, `202611160001_rent_paypal_payments.sql`, and `202611170001_outs_reuse_marketplace.sql`; Rent schema precedes PayPal records, and Reuse relies on the existing verified-profile, conversation, notification, and Storage foundations. Review and test additive migrations in a non-production project only. Do not apply production migrations without approval. Use two verified test accounts and an admin test account. Configure PayPal Sandbox credentials only for the separate RentFlow flow. `OPENAI_API_KEY` only exercises the constrained ID-ranking path in RentFlow Assistant; the global assistant does not call an external model.

## Manual flow

1. Sign in as the owner, create a listing, and have an admin approve it.
2. Sign in as the renter and ask the assistant for that item with a budget and duration. Confirm the linked listing, daily rate, date window, and rounded-up estimate match database values. Try malformed budget/duration input and a query with no matching listing.
3. Request dates on the listing and approve the request as the owner.
4. Open My Rent as renter, pay with a PayPal Sandbox buyer account, and confirm the completed payment and booking state. Confirm the UI states that Sandbox is not real money and deposits/payouts are unsupported.
5. Try cancelling checkout, resubmitting capture, using another user's booking ID, and changing the browser-submitted amount. Confirm none can create an unverified paid booking and a repeated capture reconciles to the one saved payment/capture.
6. Verify the same-campus RLS restrictions, mobile layout, and the existing auth, task, learning, partner, advertisement, and Razorpay flows.
7. As a verified student, create each Reuse listing type, upload supported and unsupported images, and confirm invalid type/size files are rejected. Verify listings remain out of discovery until an admin approves them.
8. Submit a request from a second same-campus user, verify an automatic participant conversation and deduplicated notification, accept/reject/cancel requests, test rental-date conflicts and quantity reservation, then mark the accepted handover complete.
9. Save/remove a favorite, submit a listing report, review/resolve/dismiss it as admin, archive an owner listing, and confirm a different-campus or unverified account cannot read the inventory or signed image.
10. Use the global assistant on public/authenticated pages. Confirm it routes anonymous users to sign-in, returns only published same-campus rows, prices match database records, and empty results do not invent alternatives.

Authenticated Supabase, PayPal Sandbox, RentFlow's optional AI ranking, and mobile end-to-end journeys require credentials and accounts not included in this repository. Lint/build checks do not prove authenticated integrations or database migration behavior work; complete the manual flow against a non-production Supabase project before any pilot.
