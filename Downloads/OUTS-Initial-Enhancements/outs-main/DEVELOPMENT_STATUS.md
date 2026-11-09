# OUTS development status

## Project

OUTS is a Next.js 15 / React 19 student marketplace backed by Supabase Auth, Postgres, Storage, RLS, and Realtime. The connected Supabase project was inspected directly; it uses `profiles.college`, `applications`, `conversations.provider_id/performer_id`, and an existing `learning_services` table. The frontend and additive migrations now target that schema rather than the older checked-in baseline assumptions.

## Implemented

- Email signup/login/reset, protected routes, persisted student/teacher mode, profile editing, private avatar upload, password change, and global sign-out.
- Task browsing, creation, applications, accept/reject, lifecycle transitions, owner cancellation, moderation, reports, and moderation history.
- Peer teaching services, browse/search/price filter, session requests, accept/reject/schedule/complete/cancel, and request-linked private chat.
- Participant-scoped conversations and messages, realtime inserts, notification links, preferences, and unread/read state.
- Admin overview, user directory, task/report moderation, audit history, ad review, and payment totals. Account suspension is intentionally absent because there is no auth-wide enforcement flag/gate.
- Advertisement drafts, private creative storage, impressions/clicks, admin approval, Razorpay server-side orders, checkout signature and payment API verification, webhook signature checks, event deduplication, payment ledger, and payment notifications.
- An interface boundary for future video providers in `lib/learning/video-provider.ts`; there is no configured video implementation or live room feature.

## Database and external dependencies

Additive migrations in `supabase/migrations` cover advertisements, task application/moderation/reporting, teaching requests, notification preferences, payment records, realtime, and authorization guards. These were applied to the connected project through `session_chat_and_payment_guards`. Do not replay migrations blindly or run the older baseline marketplace migration against the existing schema.

Razorpay routes require server-only `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`; these were not present in the local environment at implementation time. Configure the merchant account and register `/api/payments/razorpay-webhook` before checkout can work. Task payments, escrow, commissions, settlement, and payouts are not implemented. Email delivery beyond Supabase Auth is not configured. Live video requires a provider, credentials, and room persistence. Account deletion remains disabled until retention and relationship rules are established.

## Validation and limits

TypeScript, lint, and production build are run for the final local changes. Supabase migrations were applied and schema/RLS state inspected. Authenticated end-to-end flows and live Razorpay checkout were not exercised because no test account or payment credentials were available. Supabase advisors have also reported existing password leak protection and query/index recommendations; review current dashboard advisories before production launch.

## Environment

Core app: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Advertisement payments additionally require the server-only credentials listed above. Never place secret keys in `NEXT_PUBLIC_*` variables or commit `.env.local`.
