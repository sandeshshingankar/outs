import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Listing = { id: string; title: string; subcategory: string; description: string; daily_price_paise: number; available_from: string; available_until: string; rent_categories?: { name: string } | null };
const hits = new Map<string, { count: number; start: number }>();
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to use the rental assistant.' }, { status: 401 });
  const now = Date.now(); const bucket = hits.get(user.id);
  if (bucket && now - bucket.start < 60_000 && bucket.count >= 20) return NextResponse.json({ error: 'Please wait a minute before asking again.' }, { status: 429 });
  hits.set(user.id, !bucket || now - bucket.start >= 60_000 ? { count: 1, start: now } : { ...bucket, count: bucket.count + 1 });
  let body: { message?: unknown };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: 'Enter a rental question.' }, { status: 400 }); }
  if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 500) return NextResponse.json({ error: 'Questions must be between 1 and 500 characters.' }, { status: 400 });
  const query = body.message.trim();
  const { data: profile } = await supabase.from('profiles').select('college').eq('id', user.id).maybeSingle();
  if (!profile?.college) return NextResponse.json({ error: 'Your verified college profile is required to search rentals.' }, { status: 403 });
  const { data, error } = await supabase.from('rent_listings').select('id,title,subcategory,description,daily_price_paise,available_from,available_until,rent_categories(name)').eq('status', 'published').ilike('college', profile.college).order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: 'Rental search is unavailable. Check the OUTS Rent migration and pilot setup.' }, { status: 503 });
  const listings = (data ?? []) as unknown as Listing[];
  const budgetMatch = query.match(/(?:under|below|max(?:imum)?|budget(?: of)?|within)\s*(?:₹|rs\.?\s*)?([\d,]+)/i);
  const budget = budgetMatch ? Number(budgetMatch[1].replaceAll(',', '')) * (/(?:total|for the whole|overall)/i.test(query) ? 100 : 100) : null;
  const durationMatch = query.match(/(\d+)\s*(day|days|week|weeks|hour|hours)/i);
  const days = durationMatch ? Number(durationMatch[1]) * (/week/i.test(durationMatch[2]) ? 7 : /hour/i.test(durationMatch[2]) ? 1 / 24 : 1) : 1;
  const categoryTerms = ['laptop','calculator','camera','tripod','tablet','monitor','bicycle','football','badminton','headphone','microphone','projector','book'];
  const term = categoryTerms.find(t => query.toLowerCase().includes(t));
  const matched = listings.filter(item => (!term || `${item.title} ${item.subcategory} ${item.description} ${item.rent_categories?.name}`.toLowerCase().includes(term)) && (!budget || item.daily_price_paise * days <= budget));
  matched.sort((a,b) => a.daily_price_paise - b.daily_price_paise);
  const recommendations = matched.slice(0, 6).map(item => ({ ...item, estimate_paise: Math.ceil(days) * item.daily_price_paise, duration_days: Math.ceil(days), reason: `${term ? `Matches ${term}` : 'Available in your campus'}${budget ? ' and fits your stated budget' : ''}; estimate uses the listed daily price.` }));
  let answer = recommendations.length ? `I found ${recommendations.length} matching listing${recommendations.length === 1 ? '' : 's'} in your campus. Estimates use each listing's daily rate for ${Math.ceil(days)} day${Math.ceil(days) === 1 ? '' : 's'}; the refundable deposit is separate.` : 'I could not find a published listing matching those details in your campus. Try another budget or item, or post a rental request.';
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey && recommendations.length) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0.2, max_tokens: 120, messages: [{ role: 'system', content: 'Answer as a concise campus rental assistant. Use only these actual matching listings and prices. Never claim booking availability beyond the provided dates, invent ratings, or promise payments. Listings: ' + JSON.stringify(recommendations.map(x => ({ title:x.title, category:x.rent_categories?.name, daily_price_paise:x.daily_price_paise, dates:[x.available_from,x.available_until], estimate_paise:x.estimate_paise }))) }, { role: 'user', content: query }] }), cache: 'no-store' });
      const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      if (response.ok && result.choices?.[0]?.message?.content) answer = result.choices[0].message.content.slice(0, 900);
    } catch { /* grounded database search remains available without the LLM */ }
  }
  return NextResponse.json({ answer, recommendations, aiEnabled: Boolean(apiKey) }, { headers: { 'cache-control': 'no-store' } });
}
