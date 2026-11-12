# PayPal Sandbox integration

The PayPal integration is for a hackathon demonstration in Sandbox. It is not a real money transfer and does not provide escrow, refunds, or seller payouts.

## Configuration

Set the following server environment variables:

- `PAYPAL_CLIENT_ID` — Sandbox app client ID; safe for the browser SDK.
- `PAYPAL_CLIENT_SECRET` — Sandbox app secret; server only.
- `PAYPAL_BASE_URL` — `https://api-m.sandbox.paypal.com`.
- `PAYPAL_INR_PER_USD` — required, manually reviewed INR-per-USD Sandbox quote. No automatic FX source is configured.
- `SUPABASE_SERVICE_ROLE_KEY` — required for server-side payment records and verified booking finalization.

Never prefix the secret with `NEXT_PUBLIC_`. The `/api/payments/config` route exposes only the client ID when Sandbox configuration and server payment storage are ready.

## Flow

1. The owner approves the renter's request.
2. The renter starts PayPal checkout in My Rent.
3. `/api/payments/rent/order` checks the signed-in renter, approved booking, published listing, and dates, calculates the INR amount from the database daily rate, and converts it to USD cents using the configured quote.
4. PayPal Sandbox creates a CAPTURE order. OUTS saves the order reference and amount.
5. After buyer approval, `/api/payments/rent/capture` captures and verifies the PayPal order, booking reference, completed capture, USD currency, and exact amount.
6. Only then does the server set the payment to completed and booking to confirmed.

Repeated capture requests return success only when OUTS already has a verified completed capture. PayPal's request ID is used for capture idempotency. Failed or cancelled browser checkouts display an error/status and do not mark the booking paid.

## Setup

Review and apply the additive migration `202611160001_rent_paypal_payments.sql` after checking Supabase migration history. Configure PayPal Sandbox credentials and a current INR/USD demo quote, run the app, approve a booking with two verified test users, and complete checkout using PayPal's Sandbox buyer account. Do not use production PayPal credentials with this integration.

PayPal's current REST currency list does not include INR, so this demo uses USD with the operator-supplied conversion quote; verify the merchant and buyer accounts can use USD before presenting the flow. Refresh the quote before a demo. The quote is not an automatic live exchange rate. The captured amount excludes the deposit and renter fee. [PayPal currency codes](https://developer.paypal.com/api/codes/currency/)
