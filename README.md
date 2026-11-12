# OUTS — Student-powered marketplace

OUTS is a Next.js 15 / React 19 campus marketplace using Supabase Auth, Postgres, Storage, and Realtime. Students can post legitimate help requests, apply to tasks, offer peer tutoring, and ask teachers for learning help.

## Run locally

1. Install Node.js 20.9+.
2. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the Supabase project. Never put a Supabase secret key in browser code.
3. Run `npm ci`, `npm run dev`, then open `http://localhost:3000`.
4. Keep Supabase migrations in step with the connected project. The additive work is tracked in `supabase/migrations/`; inspect Supabase migration history before applying any file. Do not run the older baseline marketplace migration against the existing `learning_services` schema.

## Routes

- `/` landing page
- `/auth` signup, login, and forgot password
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

## OUTS RentFlow AI and PayPal Sandbox

OUTS Rent reuses the existing Supabase campus verification and rental tables. Its assistant searches published listings from the signed-in user's campus and returns database-backed recommendations and price estimates. Optional `OPENAI_API_KEY` supplies natural language explanations; database search still works without it.

PayPal checkout is available only for owner-approved bookings and only when configured for Sandbox. The server calculates the amount from the listing price and requested dates, verifies PayPal capture status and exact amount, and then records the payment. Sandbox transactions are demonstrations only. OUTS does not provide escrow, seller payouts, or refunds.

Review `OUTS_RENT.md`, `docs/ARCHITECTURE.md`, `docs/AI_ASSISTANT.md`, `docs/PAYPAL_INTEGRATION.md`, and `docs/TESTING.md`. Inspect the connected project's migration history before applying `supabase/migrations/202611160001_rent_paypal_payments.sql`. No database migration has been applied from this workspace.

Additional server environment variables:

- `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` — PayPal Sandbox app credentials; secret is server-only.
- `PAYPAL_BASE_URL` — Sandbox API endpoint (`https://api-m.sandbox.paypal.com`).
- `PAYPAL_INR_PER_USD` — manually reviewed INR/USD demo quote; PayPal checkout uses USD because INR is not in PayPal's current REST currency list.
- `OPENAI_API_KEY` — optional, server-only assistant explanation key.

## Payment and learning limitations

- Advertisement Razorpay checkout is server verified and remains disabled until payment credentials and merchant webhooks are configured.
- Task form shows the 1% buyer fee estimate and saves private, unpublished drafts. Task checkout/publishing remains disabled until a compliant Razorpay Route linked-account and provider-settlement flow is configured and tested.
- Standard Razorpay Checkout is not escrow. OUTS does not claim that funds are held, split, or paid to providers. Provider fees, transfers, settlement, payouts, and task-payment disputes are not active.
- The live learning feature supports teacher service listings and separate student learning requests with teacher offers and private chat. Live video is unavailable; `lib/learning/video-provider.ts` defines an integration boundary only.
- Account deletion requires current-password verification and is available only to accounts with no marketplace, conversation, moderation, or financial history. Accounts with retained records require support review.
- Admin account suspension and user reports are unavailable because there is no auth-wide suspension enforcement or user-report schema.

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

OUTS is for tutoring, mentoring, proofreading, formatting, concept explanations, and legitimate collaboration. It must not facilitate cheating, plagiarism, impersonation, or work submitted as another student's own.
