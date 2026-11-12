# PayPal Sandbox integration

Booking requests require owner approval. Eligible approved bookings may use PayPal checkout in Sandbox for rent only. The Sandbox integration is a hackathon demonstration, not a real-money transfer; deposits, escrow, refunds, and seller payouts are not supported.

## Configuration

Set the following server environment variables:

- `PAYPAL_CLIENT_ID` — Sandbox app client ID; safe for the browser SDK.
- `PAYPAL_CLIENT_SECRET` — Sandbox app secret; server only.
- `PAYPAL_BASE_URL` — `https://api-m.sandbox.paypal.com`.
- `PAYPAL_INR_PER_USD` — required, manually reviewed INR-per-USD Sandbox quote. No automatic FX source is configured.
- `SUPABASE_SERVICE_ROLE_KEY` — required for server-side payment records and verified booking finalization.

Never prefix the secret with `NEXT_PUBLIC_`. The `/api/payments/config` route exposes only the client ID when Sandbox configuration and server payment storage are ready.

## Flow

1. The renter sends a booking request; the owner approves it.
2. The renter starts PayPal checkout in My Rent.
3. `/api/payments/rent/order` checks the signed-in renter, approved booking, published listing, and dates. It recomputes the rental amount from the database daily rate and saved dates, then converts that amount to USD cents using the configured quote.
4. PayPal Sandbox creates a CAPTURE order. OUTS verifies the returned order ID, status, booking reference, currency, and exact amount before saving the unique order and payment record.
5. After buyer approval, `/api/payments/rent/capture` captures (or retrieves an already completed capture) and verifies the order reference, completed capture, USD currency, and exact order and capture amounts. Repeated capture requests are idempotently reconciled with the saved capture and booking state.
6. Only after provider verification does the server set payment to completed and booking to confirmed. Browser callbacks cannot mark a booking paid.

Repeated capture requests return success only when OUTS already has a verified completed capture. PayPal's request ID is used for capture idempotency. Failed or cancelled browser checkouts display an error/status and do not mark the booking paid.

## Setup

The exact payment migration is `supabase/migrations/202611160001_rent_paypal_payments.sql`; it depends on the Rent tables and booking workflow from `supabase/migrations/202611150001_outs_rent.sql`. Inspect the target project's migration history, apply the Rent schema first, and test the payment migration in a non-production project. Do not apply a production migration without approval. The payment table enforces one record per booking and unique PayPal order and capture IDs, and restricts reads to the recorded renter. No migration has been applied from this workspace.

Configure PayPal Sandbox credentials and a current INR/USD demo quote, run the app, approve a booking with two verified test users, and complete checkout using PayPal's Sandbox buyer account. Do not use production PayPal credentials with this integration. Authenticated PayPal/Supabase integration tests are not available in this repository; a code build is not proof of provider success.

PayPal's current REST currency list does not include INR, so this demo uses USD with the operator-supplied conversion quote; verify the merchant and buyer accounts can use USD before presenting the flow. Refresh the quote before a demo. The quote is not an automatic live exchange rate. The captured amount excludes the deposit and renter fee. [PayPal currency codes](https://developer.paypal.com/api/codes/currency/)
