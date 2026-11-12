# OUTS Rent assistant

The assistant is available at `/rent/assistant`. It requires a signed-in user with a college on their profile and searches published listings visible to that campus. The backend never accepts listing IDs or prices from the model: it queries Supabase, applies item/budget/duration filters, calculates estimates from daily prices, and returns only actual listing rows.

`OPENAI_API_KEY` is optional and server-only. When present, OpenAI generates a concise explanation from the actual matching results. When missing or unavailable, deterministic database search still responds with actual listings or a clear empty result. The assistant does not check booking conflicts or reserve an item; users must confirm dates and terms on the listing page.

Questions are limited to 500 characters, and the route applies a best-effort per-process limit of 20 requests per user per minute. Production deployments should use a shared rate limiter if stronger cross-instance limits are needed.
