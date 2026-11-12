# OUTS platform architecture

OUTS is a Next.js 15 application using React 19 and Supabase Auth, Postgres, Storage, and Realtime. Existing tasks, peer learning, Partner, RentFlow, and Razorpay advertising remain in place. Reuse adds a separate campus-scoped listing and request model; it does not repurpose the legacy task/listing tables.

## OUTS Reuse

- `/reuse`, `/reuse/new`, `/reuse/[id]`, and `/reuse/my` support sell, free, exchange, and request-based rent listings.
- `reuse_listings` is visible to verified users in the same college when published; owners and admins have the additional views needed to manage and moderate records. Owner edits are column-scoped and listing status transitions use server-side RPCs.
- `reuse_requests` is visible only to the requester, listing owner, and admins. A server-side transition function locks the listing, validates owner decisions and rental-date conflicts, reserves non-rental quantities, and records completion without claiming payment.
- `reuse_favorites`, `reuse_reports`, and `reuse_moderation_events` use participant/owner/admin-scoped RLS. Admin RPCs authorize role and status transitions before recording moderation.
- Images use the private `outs-reuse-images` bucket, a 5 MB limit, JPEG/PNG/WebP restrictions, verified-user uploads, a user/listing-prefixed path, metadata-backed reads, and short-lived signed URLs.
- A new request creates or reuses the existing participant-scoped `conversations` context and emits a deduplicated notification. No separate unscoped messaging channel is introduced.

## Global assistant

- `OutsAssistant` is mounted in the root layout, so the widget is available across routes and keeps only per-tab chat history in `sessionStorage`.
- `/api/assistant` offers fixed product guidance and searches published records from the signed-in student's same-campus Reuse and Rent inventories. It renders database names, categories, links, and prices only; it does not call an external model or generate factual listing claims.
- RentFlow's `/api/rent/assistant` remains a separate duration-aware assistant; its optional model use is constrained to candidate-ID ranking.

## Rental discovery and checkout

- `/rent` and `/rent/[id]` use Supabase's authenticated client and the current same-campus RLS rules.
- `/rent/assistant` sends a question to `/api/rent/assistant`. The server retrieves published listings marked available for the signed-in user's college, applies deterministic item/duration/budget filters, and returns database-backed links and estimates. An optional LLM can only rerank IDs from that candidate set; it does not generate displayed factual text.
- Booking requests continue through `create_rent_booking` and owner decisions through `rent_booking_action`.
- Booking requests require owner approval. Eligible approved bookings can be paid through PayPal Sandbox from `/rent/my`. PayPal's current REST currency list excludes INR, so the demo converts the database rental amount into USD cents using a manually reviewed `PAYPAL_INR_PER_USD` setting. Order creation and capture run on the server and use the Supabase session for ownership. Sandbox is not real-money payment; deposits and seller payouts are not supported.
- `rent_paypal_payments` records payment references. RLS only permits the renter to read their own record; server credentials perform inserts and verified state updates.

## Trust boundaries

Browser callbacks never mark a booking paid. The order route recomputes the amount from the saved dates and database listing price, verifies the PayPal-created order response, and records the order before changing booking state. The capture route checks ownership, booking state, price, currency, order ID, capture status, and order/capture amounts before updating the payment record and booking. PayPal secrets are server-only. PayPal is restricted to Sandbox by the readiness check.

## Existing limitations

OUTS Rent is a verified-college pilot. The college pilot must be enabled by an admin and users must have the existing trusted verification flags. The app does not implement seller payouts, escrow, refunds, or live-money settlement. Booking handover, returns, and disputes have reserved schema and partial workflow support; this project does not claim full operational coverage.

## Migration

Review `supabase/migrations/202611150001_outs_rent.sql` and `supabase/migrations/202611160001_rent_paypal_payments.sql`, then inspect the connected project's migration history before applying either. Apply the Rent schema before the PayPal payment table and test on a non-production project. No migration has been applied from this workspace; production application requires explicit approval.

The exact Reuse migration is `supabase/migrations/202611170001_outs_reuse_marketplace.sql`. It depends on the existing profile verification columns, participant-conversation and notification tables, and Supabase Storage schema; cross-marketplace assistant search also expects the Rent tables from `202611150001_outs_rent.sql`. Inspect the target migration history and review all SQL before applying it to a non-production project. The migration is not applied by this workspace, and production application requires explicit approval.
