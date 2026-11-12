# OUTS Rent assistant

The assistant is available at `/rent/assistant`. It requires a signed-in user with a college on their profile and searches published listings marked available in that campus. Supabase supplies every result; the route filters by item terms, requested duration, and optional budget, then computes each estimate from the listing's database daily rate.

The separate floating OUTS assistant is mounted in the root layout on every route. Its `/api/assistant` endpoint provides fixed navigation/product guidance and searches published Rent and Reuse records within the verified user's campus. It is deterministic and does not call an external model. Displayed names, categories, links, and prices come from database records; empty results do not generate substitute listings.

The route applies the same rental charge rule as `create_rent_booking`: round duration up to whole hours, then charge for each started 24-hour day. A missing duration defaults to one billable day. Budgets are interpreted as total rental budgets unless the question says `per day` or `daily`. Malformed or out-of-range budgets and durations return a 400 response rather than silently dropping the constraint.

`OPENAI_API_KEY` is optional and server-only. When configured, the model may rerank the already-filtered candidate IDs using their database title/category and the request. The API accepts only IDs from that candidate set, then maps them back to the original database rows. The model never supplies recommendation text, names, prices, availability, or reviews; the API does not include prices, dates, or reviews in its ranking prompt. If the model errors or returns invalid IDs, the route logs the fallback and preserves deterministic database order.

Free-form generated text could introduce an invented item, price, review, or availability claim even when given a grounded prompt, so the answer text and recommendation cards remain deterministic. Listing names, daily rates, dates, and estimate inputs originate from database rows. The displayed total is the calculated daily price multiplied by the number of billable days. Deposits are excluded.

“Marked available” is not a reservation or guarantee for a particular date. The exact date window and booking conflicts are checked by the listing detail flow and `create_rent_booking`; booking requests still require owner approval. The assistant does not inspect reviews or claim a rating.

Questions are limited to 500 characters, and the route applies a best-effort per-process limit of 20 requests per user per minute. Production deployments should use a shared rate limiter if stronger cross-instance limits are needed. The optional authenticated AI-provider flow has not been integration-tested in this workspace.
