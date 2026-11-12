import { NextResponse } from 'next/server';
import { getBillableRentalDays, getRentalEstimatePaise } from '@/lib/rent/pricing';
import { createClient } from '@/lib/supabase/server';

type Listing = {
  id: string;
  title: string;
  subcategory: string;
  description: string;
  daily_price_paise: number;
  min_duration_hours: number;
  max_duration_hours: number;
  available_from: string;
  available_until: string;
  rent_categories?: { name: string } | null;
};

const hits = new Map<string, { count: number; start: number }>();
const itemTerms = [
  'laptop', 'calculator', 'camera', 'tripod', 'tablet', 'monitor', 'bicycle',
  'football', 'badminton', 'headphone', 'microphone', 'projector', 'book',
];
const searchAliases = [
  { words: ['study', 'school'], items: ['laptop', 'calculator', 'book', 'tablet', 'monitor'] },
  { words: ['photography', 'photo'], items: ['camera', 'tripod'] },
  { words: ['sports', 'sport'], items: ['bicycle', 'football', 'badminton'] },
];
const ignoredSearchWords = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'what', 'which', 'where', 'when',
  'need', 'want', 'find', 'show', 'rent', 'rental', 'rentals', 'item', 'items',
  'available', 'cheapest', 'cheap', 'lowest', 'cost', 'price', 'under', 'below',
  'maximum', 'max', 'budget', 'within', 'daily', 'day', 'days', 'week', 'weeks',
  'hour', 'hours', 'per', 'please', 'can', 'you', 'have', 'some', 'any', 'one',
  'this', 'that', 'these', 'those', 'my', 'me', 'a', 'an', 'to', 'in', 'on',
]);

function parseBudgetPaise(query: string): number | null | 'invalid' {
  const match = query.match(/(?:under|below|max(?:imum)?|budget(?:\s+of)?|within(?:\s+budget(?:\s+of)?)?)\s*[:=]?\s*(?:₹|rs\.?\s*)?([\d,]+(?:\.\d{1,2})?)(?![\d,]|\.\d)/i);
  if (!match) return /\b(?:budget|spend|price limit)\b/i.test(query) ||
    /(?:under|below|max(?:imum)?|within)\s*(?:₹|rs\.?\s*)/i.test(query) ||
    /(?:under|below|max(?:imum)?|within)\s*[:=]?\s*(?:₹|rs\.?\s*)?[\d,]+/i.test(query)
    ? 'invalid'
    : null;
  const amountEnd = (match.index ?? 0) + match[0].length;
  if (/^\s*(?:day|days|hour|hours|week|weeks)\b/i.test(query.slice(amountEnd))) return null;

  const rawAmount = match[1];
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(rawAmount)) return 'invalid';
  const rupees = Number(rawAmount.replaceAll(',', ''));
  const paise = Math.round(rupees * 100);
  return Number.isSafeInteger(paise) && paise > 0 ? paise : 'invalid';
}

function dateWindowCanFit(from: string, until: string, durationHours: number): boolean {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${until}T00:00:00Z`);
  const wholeCalendarDaysNeeded = Math.floor(durationHours / 24);
  return Number.isFinite(start) && Number.isFinite(end) &&
    end >= start && end - start >= wholeCalendarDaysNeeded * 24 * 60 * 60 * 1000;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to use the rental assistant.' }, { status: 401 });

  const now = Date.now();
  const bucket = hits.get(user.id);
  if (bucket && now - bucket.start < 60_000 && bucket.count >= 20) {
    return NextResponse.json({ error: 'Please wait a minute before asking again.' }, { status: 429 });
  }
  hits.set(user.id, !bucket || now - bucket.start >= 60_000
    ? { count: 1, start: now }
    : { ...bucket, count: bucket.count + 1 });

  let body: { message?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Enter a rental question.' }, { status: 400 });
  }
  if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 500) {
    return NextResponse.json({ error: 'Questions must be between 1 and 500 characters.' }, { status: 400 });
  }

  const query = body.message.trim();
  const budgetPaise = parseBudgetPaise(query);
  if (budgetPaise === 'invalid') {
    return NextResponse.json({ error: 'Add a valid positive rental budget in rupees, for example “under ₹1500”.' }, { status: 400 });
  }

  const durationMatch = query.match(/(?<![\d.])(\d+(?:\.\d{1,2})?)\s*(day|days|week|weeks|hour|hours)\b/i);
  if (!durationMatch && /\b(?:day|days|week|weeks|hour|hours)\b/i.test(query)) {
    return NextResponse.json({ error: 'Include a numeric rental duration, such as “3 days” or “5 hours”.' }, { status: 400 });
  }
  const durationValue = durationMatch ? Number(durationMatch[1]) : 1;
  const durationUnit = durationMatch?.[2] ?? 'day';
  const durationHours = durationValue * (/week/i.test(durationUnit) ? 7 * 24 : /hour/i.test(durationUnit) ? 1 : 24);
  const days = getBillableRentalDays(durationHours * 60 * 60 * 1000);
  if (!days || days > 366) {
    return NextResponse.json({ error: 'Rental duration must be between 1 hour and 366 days.' }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('college').eq('id', user.id).maybeSingle();
  if (profileError) {
    return NextResponse.json({ error: 'Your campus profile could not be checked.' }, { status: 503 });
  }
  if (!profile?.college) {
    return NextResponse.json({ error: 'Your verified college profile is required to search rentals.' }, { status: 403 });
  }

  const { data, error } = await supabase.from('rent_listings')
    .select('id,title,subcategory,description,daily_price_paise,min_duration_hours,max_duration_hours,available_from,available_until,rent_categories(name)')
    .eq('status', 'published')
    .eq('availability_status', 'available')
    .ilike('college', profile.college)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ error: 'Rental search is unavailable. Check the OUTS Rent migration and pilot setup.' }, { status: 503 });
  }

  const listings = (data ?? []) as unknown as Listing[];
  const normalizedQuery = query.toLowerCase();
  const knownTerms = itemTerms.filter(term => normalizedQuery.includes(term));
  const alias = searchAliases.find(group => group.words.some(word => normalizedQuery.includes(word)));
  const inferredTerms = normalizedQuery
    .replace(/(\d+(?:\.\d{1,2})?)\s*(?:days?|weeks?|hours?)\b/g, ' ')
    .replace(/(?:under|below|max(?:imum)?|budget(?:\s+of)?|within(?:\s+budget(?:\s+of)?)?)\s*[:=]?\s*(?:₹|rs\.?\s*)?[\d,]+(?:\.\d{1,2})?/g, ' ')
    .replace(/[₹\d,]+/g, ' ')
    .match(/\p{L}{3,}/gu)
    ?.filter(term => !ignoredSearchWords.has(term)) ?? [];
  const terms = knownTerms.length ? knownTerms : alias?.items ?? inferredTerms;
  const dailyBudget = /\b(?:per\s*day|daily)\b|\/\s*day\b/i.test(query);
  const durationHoursRounded = Math.ceil(durationHours);
  const recommendations = listings.flatMap(item => {
    const listingText = `${item.title} ${item.subcategory} ${item.description} ${item.rent_categories?.name ?? ''}`.toLowerCase();
    const matchesTerms = terms.length === 0 || terms.some(term => listingText.includes(term));
    const durationFits = durationHoursRounded >= Number(item.min_duration_hours) &&
      durationHoursRounded <= Number(item.max_duration_hours);
    const dateWindowFits = dateWindowCanFit(item.available_from, item.available_until, durationHours);
    const dailyPricePaise = Number(item.daily_price_paise);
    const estimatePaise = getRentalEstimatePaise(dailyPricePaise, days);
    const withinBudget = budgetPaise === null || (dailyBudget
      ? dailyPricePaise <= budgetPaise
      : estimatePaise !== null && estimatePaise <= budgetPaise);

    if (!matchesTerms || !durationFits || !dateWindowFits || !withinBudget || estimatePaise === null) return [];
    return [{
      ...item,
      daily_price_paise: dailyPricePaise,
      estimate_paise: estimatePaise,
      duration_days: days,
      reason: `Listed as available ${item.available_from} to ${item.available_until}. Confirm the exact dates with the owner.`,
    }];
  })
    .sort((a, b) => a.estimate_paise - b.estimate_paise || a.title.localeCompare(b.title))
    .slice(0, 6);

  let orderedRecommendations = recommendations;
  let rankingMode: 'database' | 'constrained-ai' = 'database';
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey && recommendations.length > 1) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0,
          max_tokens: 300,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: 'Return JSON only with a listing_ids array ordered by relevance to the request. Select IDs only from the provided candidates. Do not invent IDs or return prose, prices, availability, reviews, or other claims.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                request: query,
                candidates: recommendations.map(item => ({
                  id: item.id,
                  title: item.title,
                  category: item.rent_categories?.name ?? item.subcategory,
                })),
              }),
            },
          ],
        }),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`OpenAI returned HTTP ${response.status}.`);
      const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = result.choices?.[0]?.message?.content;
      if (!content) throw new Error('OpenAI returned no candidate ordering.');
      const parsed = JSON.parse(content) as { listing_ids?: unknown };
      const candidateIds = new Set(recommendations.map(item => item.id));
      if (!Array.isArray(parsed.listing_ids) ||
        parsed.listing_ids.some(id => typeof id !== 'string' || !candidateIds.has(id))) {
        throw new Error('OpenAI returned a listing ID outside the candidate set.');
      }
      const rankedIds = [...new Set(parsed.listing_ids.filter((id): id is string => typeof id === 'string'))];
      const rankedSet = new Set(rankedIds);
      const candidatesById = new Map(recommendations.map(item => [item.id, item]));
      orderedRecommendations = [
        ...rankedIds.flatMap(id => {
          const item = candidatesById.get(id);
          return item ? [item] : [];
        }),
        ...recommendations.filter(item => !rankedSet.has(item.id)),
      ];
      rankingMode = 'constrained-ai';
    } catch (error) {
      console.warn('Rent assistant used database ranking after constrained AI ranking failed:', error instanceof Error ? error.message : 'unknown error');
    }
  }

  const answer = orderedRecommendations.length
    ? `Found ${orderedRecommendations.length} published listing${orderedRecommendations.length === 1 ? '' : 's'} marked available that match your request. Estimates use the database daily rate for ${days} billable day${days === 1 ? '' : 's'}; deposits are excluded. Confirm exact dates with the owner.`
    : 'No published, currently available listing matched those item, duration, and budget details. Try another search or post a rental request.';
  return NextResponse.json({ answer, recommendations: orderedRecommendations, duration_days: days, rankingMode }, { headers: { 'cache-control': 'no-store' } });
}
