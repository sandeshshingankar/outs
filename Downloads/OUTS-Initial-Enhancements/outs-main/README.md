# OUTS — Student-powered marketplace

A Next.js 15 + Supabase foundation for a student marketplace. Students can create accounts, post ethical work requests, browse open tasks, apply to tasks, and publish peer-learning sessions. A student can be both a task provider and a performer.

## Run locally

1. Install Node.js 20.9+.
2. Copy `.env.example` to `.env.local`.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` using your Supabase project's **Project URL** and **Publishable key**. Never use the `sb_secret_...` key in browser code.
4. Do not blindly rerun migrations already applied to Supabase. Apply only unapplied additive migrations for profile/avatar fields, conversation context, and advertisements. The supplied live `learning_services` table uses `provider_id` and `status`; the earlier marketplace migration describes an obsolete table shape and must not be rerun against the live database.
5. In Supabase Authentication → URL Configuration, set Site URL to `http://localhost:3000` and add `http://localhost:3000/**` to Redirect URLs. Email provider should be enabled.
6. Run `npm ci` when installing dependencies, then `npm run dev`, and open `http://localhost:3000`.

## Routes

- `/` landing page
- `/auth` signup and login
- `/account` profile, password, session, and account-deletion controls
- `/dashboard` student workspace
- `/tasks` browse open tasks
- `/tasks/new` post a task
- `/tasks/[id]` task detail and application
- `/learn` peer-learning service listings and publishing
- `/messages` task/teaching conversations
- `/notifications` notifications (requires matching `user_id`/read-state schema and RLS)
- `/admin` server-authorized overview for trusted admin accounts
- `/advertiser` campaign dashboard and `/advertiser/ads/new` to save advertisement drafts

## Current scope and honest limitations

- Supabase Auth, task posting/browsing, applications, learning services, conversations, and messages use database queries and RLS.
- The new conversation migration adds service context and participant-safe creation; apply it before using teacher chat. Realtime also requires `messages` to be in the Supabase Realtime publication.
- The attachment bucket is private and configured in SQL; upload/download UI is a follow-up milestone.
- Wallet balances, escrow, refunds, platform commissions, and payouts are **not live**. Razorpay Checkout is not escrow. Do not accept payments until the correct Razorpay product/settlement arrangement, KYC, webhook verification, server-side order creation, and ledger/reconciliation are implemented and tested.
- Admin access is not self-service. Only a trusted operator should promote an account to `admin` in Supabase SQL Editor.
- Advertisement campaigns require the additive advertisement and payment migrations. Razorpay order creation, Checkout, server verification, signed webhook handling, duplicate event protection, and payment ledger updates are implemented. Set server-only `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` before enabling Checkout. Register `/api/payments/razorpay-webhook` with Razorpay. Until configured and tested with the merchant account, payments remain unavailable. Checkout is not escrow and does not release task funds.
- The live project uses `applications` for listings; the additive marketplace migration extends that same table for `tasks`, adds session requests and reports, and extends the existing conversations table. Do not rerun old migrations against the live project.
- Profile pictures use the private `outs-avatars` bucket. Apply `202611100001_account_management.sql` before using profile-picture uploads if it has not already been applied. Apply `202611110001_profile_details.sql` and `202611120001_conversation_context.sql` only if unapplied.
- Permanent account deletion is deliberately blocked in both UI and API until the complete database schema and payment/dispute retention requirements are verified. No service-role key or environment flag enables deletion; no user or transaction data is removed.
- Password reset links require `/auth/reset-password` to be included in the Supabase Auth redirect URL allowlist. Password changes require the current password; "Log out of all sessions" uses Supabase global sign-out.
- OUTS should be used for tutoring, mentoring, proofreading, formatting, study resources, and legitimate collaboration. Do not facilitate plagiarism, exam cheating, impersonation, or submission of work as another student's own.

## Security notes

The publishable key is intended for browser use with RLS. Never put Supabase secret/service-role keys or Razorpay secrets in `NEXT_PUBLIC_*` variables or commit `.env.local`. Core student features use the publishable key; the advertisement order, verification, and webhook routes require server-only `SUPABASE_SERVICE_ROLE_KEY` and Razorpay credentials. Configure those values only in server environments. Checkout is unavailable until a merchant account and webhook are configured and verified.
