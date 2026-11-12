# OUTS — Student-powered marketplace

OUTS is a Next.js 15 / React 19 campus marketplace using Supabase Auth, Postgres, Storage, and Realtime. Students can post legitimate help requests, apply to tasks, offer peer tutoring, and ask teachers for learning help.

## Run locally

1. Install Node.js 20.9+.
2. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the Supabase project. Never put a Supabase secret key in browser code.
3. Run `npm ci`, `npm run dev`, then open `http://localhost:3000`.
4. Keep Supabase migrations in step with the connected project. The additive work is tracked in `supabase/migrations/`; inspect Supabase migration history before applying any file. Do not run the older baseline marketplace migration against the existing `learning_services` schema.

## Routes

- `/` landing page
- `/auth` signup by default, `/auth?mode=login` for login, and forgot password
- `/auth/reset-password` secure reset-link password update
- `/account` profile, avatar, password, sessions, and account deletion
- `/dashboard` workspace and student/teacher mode
- `/partner` OUTS Partner marketplace landing page and activity requests
- `/partner/new` create a paid activity request
- `/tasks` marketplace, `/tasks/new` task draft, `/tasks/[id]` task details
- `/learn` teacher services and `/learn/requests` student learning requests/teacher offers
- `/messages` participant conversations
- `/notifications` notification inbox and preferences
- `/admin` server-authorized control panel
- `/advertiser` campaign dashboard and `/advertiser/ads/new` advertisement draft
- `/rent` rental discovery, `/rent/assistant` grounded AI search, `/rent/my` bookings and checkout
- `/reuse` verified-campus listings for sell, free, exchange, and request-based rent; `/reuse/new`, `/reuse/[id]`, and `/reuse/my`
- A floating OUTS assistant on every route; it answers navigation questions and retrieves only published Rent and Reuse database listings

## OUTS RentFlow AI and PayPal Sandbox

OUTS Rent reuses the existing Supabase campus verification and rental tables. Rent Assistant uses deterministic, database-grounded matching; an optional LLM can only rerank IDs from the already-filtered database candidates. It cannot provide listing text, prices, availability, or reviews. Recommendations and displayed prices come from listing rows and use the same rounded-up 24-hour billing rule as booking requests.

Booking requests require owner approval. Eligible approved bookings can use PayPal Sandbox checkout for rent only when configured. The server calculates the amount from the listing price and requested dates, verifies the returned order and completed capture amount/currency, and then records the payment. Sandbox is not real-money payment. Deposits and seller payouts are not supported.

Review `OUTS_RENT.md`, `docs/ARCHITECTURE.md`, `docs/AI_ASSISTANT.md`, `docs/PAYPAL_INTEGRATION.md`, and `docs/TESTING.md`. The PayPal table migration is exactly `supabase/migrations/202611160001_rent_paypal_payments.sql`; it depends on the Rent schema from `supabase/migrations/202611150001_outs_rent.sql`. The additive payment integrity migration is `supabase/migrations/202611180001_payment_order_integrity.sql`; it depends on the Rent PayPal table and the existing advertisement payment tables. The Reuse rental-date policy migration is `supabase/migrations/202611180002_reuse_booking_dates.sql`; it depends on `supabase/migrations/202611170001_outs_reuse_marketplace.sql`. Inspect the target project's migration history and apply dependencies in order to a non-production project first. Do not apply a production migration without approval. No database migration has been applied from this workspace.

## OUTS Reuse and the site-wide assistant

OUTS Reuse adds campus-scoped peer listings for selling, giving away, exchanging, or renting items by request. Verified students can browse approved listings, submit requests, message request participants, save favorites, and report a listing. Owners accept/reject requests and record a completed handover; listing and report moderation is available to admins. New Reuse requests do not collect money, reserve a payment, or pay out sellers. This is intentionally a request workflow—not fake checkout success.

The global assistant appears on every page. Its retrieval is deterministic: it searches published, same-campus Reuse and Rent records and shows only database-backed names, categories, links, and prices. Guidance and navigation answers are fixed product copy; the global assistant does not send prompts or personal data to an external model. RentFlow's separate assistant can optionally use `OPENAI_API_KEY` to rerank already-filtered candidate IDs only.

The additive Reuse migration is exactly `supabase/migrations/202611170001_outs_reuse_marketplace.sql`. It expects the existing verified-profile, conversation, notification, and Storage foundations plus the Rent schema for cross-marketplace search. Review it and the target project's migration history before applying it to a non-production project. It has not been applied by this workspace; production application requires explicit approval.

Additional server environment variables:

- `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` — PayPal Sandbox app credentials; secret is server-only.
- `PAYPAL_BASE_URL` — Sandbox API endpoint (`https://api-m.sandbox.paypal.com`).
- `PAYPAL_INR_PER_USD` — manually reviewed INR/USD demo quote; PayPal checkout uses USD because INR is not in PayPal's current REST currency list.
- `OPENAI_API_KEY` — optional server-only candidate-ID reranking for RentFlow Assistant only; the site-wide assistant makes no external model calls.

## Payment and learning limitations

- Advertisement Razorpay checkout is server verified and remains disabled until payment credentials and merchant webhooks are configured.
- Task form shows the 1% buyer fee estimate and saves private, unpublished drafts. Task checkout/publishing remains disabled until a compliant Razorpay Route linked-account and provider-settlement flow is configured and tested.
- Standard Razorpay Checkout is not escrow. OUTS does not claim that funds are held, split, or paid to providers. Provider fees, transfers, settlement, payouts, and task-payment disputes are not active.
- The live learning feature supports teacher service listings and separate student learning requests with teacher offers and private chat. Live video is unavailable; `lib/learning/video-provider.ts` defines an integration boundary only.
- Account deletion requires current-password verification and is available only to accounts with no marketplace, conversation, moderation, or financial history. Accounts with retained records require support review.
- Auth-wide account suspension and general user-account reports are unavailable. Task and Reuse listing reports have separate moderation queues; Reuse moderation does not suspend accounts.

## Environment and Supabase settings

Core app:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Advertisement payments and eligible-account deletion also require these server-only values:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

Never use `NEXT_PUBLIC_` on secrets or commit `.env.local`. Register `/api/payments/razorpay-webhook` in the Razorpay merchant dashboard. In Supabase Auth URL Configuration, allow `http://localhost:3000/auth/reset-password?flow=recovery` and the matching production URL. Leaked-password protection and password-strength rules are configured in Supabase Auth.

## Vercel deployment settings

The requested deployment configuration is:

- GitHub repository: `sandeshshingankar/outs`
- Production branch: `main`
- Root Directory: `Downloads/OUTS-Initial-Enhancements/outs-main` (verify this path exists relative to the repository root)
- Framework: Next.js
- Install command: `npm ci`
- Build command: `npm run build`

Configure the environment variables above in the Vercel project. No live deployment URL was supplied, so `404 DEPLOYMENT_NOT_FOUND` has not been tested. Check that a production deployment exists under the correct Vercel project/team and that the intended domain is assigned to it.

## RentFlow AI — judging brief

### Problem and value proposition

Students often need equipment for a short period while classmates have useful items sitting idle. Informal arrangements make it hard to discover nearby campus inventory, compare clear rental terms, and coordinate a request with an owner. OUTS Rent provides verified-campus discovery, listing moderation, dates and terms on each listing, and owner-approved booking requests in one student-to-student flow.

Its differentiator is campus-scoped trust and a transparent path from real database listings to requests: the assistant never fabricates inventory or prices, and any payment demonstration is clearly separated from real-money settlement. The current assistant uses deterministic retrieval and optional constrained AI reranking, not generated recommendations or answer prose.

### Innovation and potential impact

The product combines campus verification, moderated peer inventory, explicit owner approval, and a transparent rental estimate in one flow. The assistant favors deterministic, auditable recommendations over unverified natural-language claims. PayPal Sandbox is a provider-backed demonstration boundary—not a claim of settlement, escrow, or payouts.

The impact hypothesis is lower short-term access cost for renters and better utilization of idle student-owned equipment. A campus pilot should measure time from search to approved booking, successful handovers, repeat use, owner utilization, renter affordability, and incident/dispute rates. No impact outcomes are claimed before a pilot collects evidence.

### Product architecture

- **Next.js / React:** responsive rent discovery, item detail, assistant, listing/request forms, and My Rent dashboard.
- **Supabase Auth / Postgres / RLS:** verified-student and enabled-campus gates, published listings, availability, booking RPCs, and owner approval.
- **Rent Assistant API:** authenticated campus listing query, item/duration/budget filters, optional allowlisted ID reranking, and record-backed estimates using rounded-up 24-hour billing.
- **PayPal Sandbox API:** server-calculated USD order amount from the saved booking and listing; server-verified order/capture; no browser-supplied price is trusted.
- **Explicit boundaries:** Sandbox is not real-money payment; deposits, escrow, refunds, and seller payouts are not supported.

### Working demo flow

1. Prepare a non-production Supabase project, apply the reviewed Rent migrations in order, enable one pilot campus, and create two verified test users (owner and renter).
2. Owner submits a listing; an admin approves it.
3. Renter searches/filters or asks Rent Assistant for an item and duration; compare the daily rate and estimate with the listing record.
4. Renter submits a date-bound booking request; owner approves it in My Rent.
5. If PayPal Sandbox credentials, a reviewed USD conversion quote, and Sandbox buyer are available, renter completes a Sandbox rent-only checkout. Verify the payment and booking state; show the not-real-money notice.

### Screenshot checklist

- [ ] Rent discovery on desktop, showing filters, real listing images, availability window, and rate.
- [ ] Responsive/mobile discovery and listing detail.
- [ ] Listing detail with rental terms, billing estimate, owner-approval note, and Sandbox limitations.
- [ ] Rent Assistant prompt and database-backed result cards (daily rate, billable duration, total estimate, date window).
- [ ] My Rent request before owner approval and owner approval controls.
- [ ] PayPal Sandbox buyer approval and the verified payment confirmation state, with Sandbox notice visible.
- [ ] Empty-search result and unconfigured-Sandbox state.
- [ ] Do not expose credentials, personal contact details, or real payment data in screenshots.

### Under-three-minute demo script (about 2:40)

- **0:00–0:20 — Problem:** “Students need equipment briefly; other students have idle inventory. Informal discovery and unclear terms make that exchange hard to trust.”
- **0:20–0:45 — Value:** “OUTS Rent is campus-scoped and gated by student verification. Listings are moderated, and booking requests wait for owner approval.”
- **0:45–1:15 — Discover:** Search for a laptop, apply a daily budget, open a listing, and show its real photo, terms, available date window, daily rate, and rounded-up estimate.
- **1:15–1:40 — Grounded assistant:** Ask for a laptop and rental duration. Point out that the result links to a real listing and both daily and total prices come from its database rate; exact date conflicts are checked when the request is submitted.
- **1:40–2:05 — Approval:** Submit a booking request as renter, switch to owner, approve it, then return to the renter's My Rent dashboard.
- **2:05–2:30 — Checkout:** If the authenticated Sandbox setup is ready, approve the PayPal test order and show the verified booking. State clearly: “This is test money, not a real payment. Deposits and seller payouts are not supported.” If not configured, show the explicit gated state instead—never simulate success.
- **2:30–2:40 — Close:** “Verified campus listings, grounded estimates, and owner-controlled requests; production payments are intentionally out of scope.”

## Full-platform judging brief

### Problem and unique value

Campus students need short-term access to useful items while peers have idle equipment, books, or supplies. Existing informal exchanges are fragmented and hard to trust. OUTS combines verified-campus discovery, moderation, sell/free/exchange/rent listing types, participant messaging, notifications, and an owner-approved request lifecycle with the wider OUTS tasks and peer-learning workspace.

The distinguishing product choice is a grounded campus assistant: it can route users around OUTS and retrieve only published campus inventory already present in Supabase. It does not invent an item, price, review, or availability claim. Payments are separate, explicit boundaries: eligible RentFlow bookings can use PayPal Sandbox for rent only; Reuse is request-based and does not process payments, deposits, or payouts.

### Architecture and safeguards

- **Next.js / React:** protected Reuse routes, discovery/detail/create/activity screens, admin moderation, and a global floating assistant.
- **Supabase Auth / Postgres / RLS:** verified-student and same-college access, owner-scoped listing edits, request visibility limited to participants, and server-controlled state transitions.
- **Supabase Storage:** private Reuse images, constrained MIME types and size, user/listing-prefixed paths, metadata-backed read access, and signed URLs.
- **Existing platform services:** Reuse requests open participant-scoped conversations and deduplicated notifications; RentFlow continues its separate owner approval and verified PayPal Sandbox boundary.
- **No fake settlement:** Reuse acceptance tracks owner decisions and handover completion but does not collect or release funds.

### Working demo flow (about 2:50)

1. **0:00–0:25 — Problem/UVP:** idle campus items meet short-term student needs in one verified, moderated community.
2. **0:25–0:55 — Discover:** browse Reuse, filter for an item, and inspect its actual campus listing and terms.
3. **0:55–1:25 — Trust:** show the verified owner listing an item and an admin approving it; highlight that images are private until authorized and listings are moderated.
4. **1:25–1:55 — Request:** submit a sell/free/exchange/rent request, show the owner decision in My Reuse, then open the participant conversation and notification.
5. **1:55–2:20 — Assistant:** ask for a real item and a budget; follow a result link and point out that its price is read from the database, not generated.
6. **2:20–2:45 — RentFlow boundary:** show an approved RentFlow booking and, only if configured, a provider-backed Sandbox checkout. State that Sandbox is not real money and deposits/payouts are unsupported. Reuse has no payment flow.
7. **2:45–2:55 — Close:** campus trust, cross-feature discovery, and explicit payment boundaries are the product foundation.

### Screenshot checklist

- [ ] Reuse discovery on desktop and mobile, with sell/free/exchange/rent filters.
- [ ] Listing detail with actual item terms, availability, and request-based payment notice.
- [ ] New listing form with supported photo types/size and pending-review state.
- [ ] My Reuse showing an incoming request, owner decision, outgoing request, and saved listing.
- [ ] Existing participant conversation opened from a Reuse request and its notification.
- [ ] Admin Reuse listing and report moderation/history.
- [ ] Global assistant on both a public and authenticated page, with a record-backed result and a no-match state.
- [ ] RentFlow approved booking and PayPal Sandbox notice only if the authenticated Sandbox flow is configured.
- [ ] Never include credentials, private contact details, real payment data, or unapproved inventory in screenshots.

## License and third-party assets

The repository's existing [LICENSE](./LICENSE) is MIT and its current copyright notice is left unchanged. This audit does not infer ownership of third-party packages, fonts, logos, or images; confirm their separate licenses/permissions before redistribution or public presentation.

OUTS is for tutoring, mentoring, proofreading, formatting, concept explanations, and legitimate collaboration. It must not facilitate cheating, plagiarism, impersonation, or work submitted as another student's own.
