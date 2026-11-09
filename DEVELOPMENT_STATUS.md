# OUTS development status

## What is implemented

- Supabase email signup/login, forgot-password email requests, recovery-link password reset, protected routes, persisted student/teacher mode, profile and private avatar editing, password changes, and global sign-out.
- Safe self-service account deletion for password-authenticated accounts with no marketplace, conversation, moderation, or financial history. Accounts with retained records and admin accounts are blocked for support/retention review.
- Task search, draft creation, private attachments, applications, owner decisions, lifecycle transitions, reports, moderation, and audit history. New tasks are stored as unpublished drafts because marketplace settlement is not configured.
- Teacher services and the two-way `Learn Requests` area: students post learning goals, teachers browse and send priced/scheduled offers, students accept or decline offers, and offer participants can start private chats.
- Participant-scoped messages and realtime updates, user notification preferences, deduplicated marketplace notifications, and notifications for learning requests/offers.
- Admin dashboard: users, task states and applications, task/report moderation, student learning requests, teaching services and bookings, advertisement review/metrics/creative previews, payment records, and append-only audit events.
- Advertiser drafts, private creative storage, sponsored placements for approved/paid/scheduled ads, event tracking, and server-verified Razorpay advertisement checkout/webhooks.
- Video-provider interface only. No video vendor or live-room integration is configured.

## Payment and settlement boundary

Advertisement checkout is disabled until server credentials and the Razorpay merchant/webhook setup are present. The UI checks server readiness and disables payment actions when missing.

Task drafts show the 1% buyer fee estimate and total. They cannot be published or paid through this app yet: an approved Razorpay Route linked-account and provider settlement workflow is required before OUTS can collect a task budget responsibly. Standard Razorpay Checkout is not escrow. The intended 1% provider fee, transfers, payouts, and dispute/refund settlement are not active. Admin commission is not reported as collected unless recorded in the ledger.

## Account deletion boundary

The API verifies the current password, checks all known user-owned/participant records using the server-side service key, removes private avatar/ad/task files and the Auth user only when no marketplace or audit history exists, and returns success only after Supabase Auth confirms deletion. Admins and accounts with financial, task, application, teaching, conversation, report, or moderation history need a retention review. OAuth-only accounts cannot use this password re-authentication flow.

## Database state

The connected Supabase migration history confirms applied changes through `task_history_safe_delete`, including `two_way_learning_and_task_payments`, `task_draft_security_learning_visibility_audit`, `admin_learning_and_audit_visibility`, `refund_references_and_task_payment_finalizer`, `admin_financial_summary`, `fk_query_indexes`, and `learning_offer_transition_guards`. See `supabase/migrations/`. The older baseline marketplace migration does not match the live schema; do not replay it against this project. New tables reuse the existing profiles, tasks, conversations, and notification architecture where appropriate. Student learning requests and teacher offers are separate concepts and have their own tables.

## Required configuration

Core app: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Server-only ad payments and eligible-account deletion: `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Register `/api/payments/razorpay-webhook` in Razorpay. Never add secrets to `NEXT_PUBLIC_*` variables or commit `.env.local`.

Supabase Auth must allow the exact local and production reset redirect URLs, including `/auth/reset-password?flow=recovery`. Password strength and leaked-password protection are configured in the Supabase dashboard.

## Deployment notes

The brief specifies repository `sandeshshingankar/outs`, production branch `main`, Vercel Root Directory `Downloads/OUTS-Initial-Enhancements/outs-main`, framework Next.js, install command `npm ci`, and build command `npm run build`. Verify that Root Directory is relative to the GitHub repository root and that this path exists in that repository. No deployment URL was provided, so the reported `404 DEPLOYMENT_NOT_FOUND` could not be tested or diagnosed against a live deployment. Confirm the project/team, successful production deployment, and assigned domain alias in Vercel.

## Validation limits

`npm ci` completed (316 packages, zero audit vulnerabilities), `npm run lint` passed without warnings, `npx tsc --noEmit` passed, and `npm run build` passed without warnings. Production-mode smoke checks returned 200 for `/`, `/auth`, and `/auth/reset-password`; the protected `/learn/requests` route redirected unauthenticated access, `/api/payments/config` correctly reported both payment flows unavailable, and unauthenticated account deletion returned 401. These checks do not validate authenticated flows.

No authenticated test account, email inbox, Razorpay credentials, Route-linked account, or live deployment URL was supplied, so the reset-email, deletion-with-data, task payment, advertiser checkout, admin-role, and end-to-end marketplace journeys were not run. Supabase security advisors still report leaked-password protection disabled. Two tables have RLS enabled with no direct policies by design (`advertisement_events` and `razorpay_webhook_events`); access is server/function mediated. Performance advisors still report 17 auth-policy init-plan warnings, 12 multiple-permissive-policy warnings, and 28 currently unused indexes; foreign-key index warnings were cleared by the additive index migration. Review these dashboard advisories before launch.
