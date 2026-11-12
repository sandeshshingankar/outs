# OUTS RentFlow AI architecture

OUTS is an existing Next.js 15 application using React 19 and Supabase Auth, Postgres, Storage, and Realtime. The rent module is additive and reuses `profiles`, campus verification, `rent_listings`, `rent_bookings`, and existing RLS policies. Existing Razorpay routes remain limited to advertisements.

## Rental discovery and checkout

- `/rent` and `/rent/[id]` use Supabase's authenticated client and the current same-campus RLS rules.
- `/rent/assistant` sends a question to `/api/rent/assistant`. The server retrieves published listings for the signed-in user's college, ranks the actual rows, and returns database-backed links and estimates. An optional server-side OpenAI key improves the answer text; the returned listing cards always come from Supabase.
- Booking requests continue through `create_rent_booking` and owner decisions through `rent_booking_action`.
- Owner-approved bookings can be paid through PayPal Sandbox from `/rent/my`. PayPal's current REST currency list excludes INR, so the demo converts the database rental amount into USD cents using a manually reviewed `PAYPAL_INR_PER_USD` setting. Order creation and capture run on the server and use the Supabase session for ownership.
- `rent_paypal_payments` records payment references. RLS only permits the renter to read their own record; server credentials perform inserts and verified state updates.

## Trust boundaries

Browser callbacks never mark a booking paid. The capture route checks ownership, booking state, price, currency, PayPal order ID, capture status, and captured amount before updating the payment record and booking. PayPal and OpenAI secrets are server-only. PayPal is restricted to Sandbox by the readiness check.

## Existing limitations

OUTS Rent is a verified-college pilot. The college pilot must be enabled by an admin and users must have the existing trusted verification flags. The app does not implement seller payouts, escrow, refunds, or live-money settlement. Booking handover, returns, and disputes have reserved schema and partial workflow support; this project does not claim full operational coverage.

## Migration

Review `supabase/migrations/202611160001_rent_paypal_payments.sql` and the connected project's migration history before applying it. It has not been applied to the connected Supabase project from this workspace.
