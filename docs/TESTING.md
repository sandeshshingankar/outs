# Testing and demo checklist

The repository scripts are `npm run lint` and `npm run build`. There is no dedicated test script or automated end-to-end suite in `package.json`.

## Required environment

Configure Supabase URL and publishable key. Apply reviewed Supabase migrations to a non-production project, enable a college pilot, and use two verified test accounts with separate renter and owner roles. Configure PayPal Sandbox credentials, a manually reviewed `PAYPAL_INR_PER_USD` quote, and an optional `OPENAI_API_KEY`. Confirm both Sandbox accounts support USD.

## Manual flow

1. Sign in as the owner, create a listing, and have an admin approve it.
2. Sign in as the renter and ask the assistant for that item with a budget and duration. Confirm the linked listing and estimate match the database rate.
3. Request dates on the listing and approve the request as the owner.
4. Open My Rent as renter, pay with a PayPal Sandbox buyer account, and confirm the completed payment and booking state.
5. Try cancelling checkout, resubmitting capture, using another user's booking ID, and changing the browser-submitted amount. Confirm none can create an unverified paid booking.
6. Verify the same-campus RLS restrictions, mobile layout, and the existing auth, task, learning, partner, advertisement, and Razorpay flows.

Authenticated Supabase, PayPal Sandbox, AI provider, and mobile end-to-end journeys require credentials and accounts not included in this repository. They must be completed before a live pilot.
