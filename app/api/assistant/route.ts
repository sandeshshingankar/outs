import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Result = {
  id: string;
  title: string;
  category: string;
  type: string;
  college: string;
  price_paise: number;
  price_label: string;
  href: string;
  description: string;
};

const requestCounts = new Map<string, { start: number; count: number }>();
const ignoredWords = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'what', 'which', 'where', 'when',
  'need', 'want', 'find', 'show', 'have', 'get', 'looking', 'search', 'browse',
  'available', 'cheapest', 'cheap', 'lowest', 'cost', 'price', 'under', 'below',
  'maximum', 'max', 'budget', 'within', 'daily', 'day', 'days', 'week', 'weeks',
  'hour', 'hours', 'per', 'please', 'can', 'you', 'some', 'any', 'one', 'this',
  'that', 'these', 'those', 'my', 'me', 'a', 'an', 'to', 'in', 'on', 'at',
  'sell', 'selling', 'rent', 'rental', 'rentals', 'borrow', 'buy', 'item', 'items',
]);

function parseBudget(query: string): number | null | 'invalid' {
  const match = query.match(/(?:under|below|max(?:imum)?|budget(?:\s+of)?|within(?:\s+budget(?:\s+of)?)?)\s*[:=]?\s*(?:₹|rs\.?\s*)?([\d,]+(?:\.\d{1,2})?)(?![\d,]|\.\d)/i);
  if (!match) return /\b(?:budget|spend|price limit)\b/i.test(query) ? 'invalid' : null;
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(match[1])) return 'invalid';
  const paise = Math.round(Number(match[1].replaceAll(',', '')) * 100);
  return Number.isSafeInteger(paise) && paise >= 0 ? paise : 'invalid';
}

function buildTerms(query: string) {
  return (query.toLowerCase()
    .replace(/(?:under|below|max(?:imum)?|budget(?:\s+of)?|within(?:\s+budget(?:\s+of)?)?)\s*[:=]?\s*(?:₹|rs\.?\s*)?[\d,]+(?:\.\d{1,2})?/g, ' ')
    .replace(/\d+(?:\.\d+)?\s*(?:days?|weeks?|hours?)\b/g, ' ')
    .match(/\p{L}{3,}/gu) ?? [])
    .filter((term, index, terms) => !ignoredWords.has(term) && terms.indexOf(term) === index);
}

function makeAnswer(results: Result[], query: string, context: string) {
  const q = query.toLowerCase();
  if (/\b(sell|give away|exchange|reuse|re-use)\b/.test(q)) {
    return `You can create a sell, free, exchange, or request-based rent listing in Reuse. Requests require owner approval; OUTS does not process Reuse payments, deposits, or seller payouts.`;
  }
  if (/\b(message|messages|contact|chat|seller|owner)\b/.test(q)) {
    return 'Submit a request on a published Reuse listing to open a participant conversation with its owner. Keep coordination in OUTS and arrange any handover in a safe, public campus location.';
  }
  if (/\b(admin|moderation|moderator)\b/.test(q)) {
    return 'Authorized administrators can open the Admin area to review tasks, Rent, Reuse listings, and listing reports.';
  }
  if (/\b(task|tasks|tutor|tutoring|learn|learning|teacher|partner)\b/.test(q)) {
    return 'OUTS includes student tasks, peer learning, and OUTS Partner alongside campus Reuse and Rent. Open the workspace to browse those areas.';
  }
  if (/\b(review|moderation|approve|approval)\b/.test(q)) {
    return 'New Reuse listings are submitted for admin review and appear in campus discovery only after approval. Requests still require the item owner to accept.';
  }
  if (/\b(pay|payment|deposit|payout|money)\b/.test(q)) {
    return /\b(reuse|sell|exchange|give away)\b/.test(q)
      ? 'OUTS Reuse is request-based and does not process payments, deposits, or seller payouts. The owner must accept a request; it is not a protected checkout.'
      : 'Eligible approved RentFlow bookings can use PayPal Sandbox for rent only. Sandbox is not real-money payment; deposits and seller payouts are not supported.';
  }
  if (/\b(notification|notifications|updates)\b/.test(q)) return 'Your in-app activity updates and notification preferences are in Notifications.';
  if (/\b(profile|account|password|settings)\b/.test(q)) return 'You can manage your profile, security, and account settings in Account.';
  if (/\b(dashboard|workspace|home)\b/.test(q)) return 'Your workspace brings together tasks, peer learning, messages, notifications, Rent, and Reuse.';
  if (/\b(rent|rental|borrow|hire)\b/.test(q)) {
    return results.some(result => result.type === 'rent')
      ? 'These are published campus rental records. Check the listing details for date availability; booking requests require owner approval. Eligible approved RentFlow bookings can use PayPal Sandbox, which is not real-money payment.'
      : 'RentFlow helps students request items listed in their campus. Booking requests require owner approval; eligible approved bookings can use PayPal Sandbox, which is not real-money payment. Deposits and seller payouts are not supported.';
  }
  if (results.length) return `I found ${results.length} published campus listing${results.length === 1 ? '' : 's'} from OUTS records. Review the listing details and contact the owner through the request flow.`;
  if (context.startsWith('/rent')) return 'I could not find a matching published listing. Try the Rent Assistant for duration-aware estimates, or post a rental request.';
  if (context.startsWith('/reuse')) return 'I could not find a matching published item in your campus listings. Try another term or submit a listing request.';
  return 'I could not find a matching published listing. Try another item name, or open Reuse or Rent to browse the current campus inventory.';
}

function getSuggestions(query: string): Array<{ label: string; href: string }> {
  const q = query.toLowerCase();
  if (/\b(notification|notifications|updates)\b/.test(q)) return [{ label: 'Notifications', href: '/notifications' }];
  if (/\b(profile|account|password|settings)\b/.test(q)) return [{ label: 'Account settings', href: '/account' }];
  if (/\b(dashboard|workspace|home|task|tasks|learn|learning|teacher|partner)\b/.test(q)) return [{ label: 'Workspace', href: '/dashboard' }];
  if (/\b(admin|moderation|moderator)\b/.test(q)) return [{ label: 'Admin area', href: '/admin' }];
  if (/\b(message|messages|contact|chat|seller|owner)\b/.test(q)) return [{ label: 'Messages', href: '/messages' }, { label: 'Browse Reuse', href: '/reuse' }];
  return [{ label: 'Browse Reuse', href: '/reuse' }, { label: 'Explore Rent', href: '/rent' }, { label: 'Open workspace', href: '/dashboard' }];
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Enter a question for the OUTS assistant.' }, { status: 400 }); }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Enter a question for the OUTS assistant.' }, { status: 400 });
  const input = body as { message?: unknown; context?: unknown };
  if (typeof input.message !== 'string' || !input.message.trim() || input.message.length > 500) {
    return NextResponse.json({ error: 'Questions must be between 1 and 500 characters.' }, { status: 400 });
  }
  const context = typeof input.context === 'string' && /^\/[a-z0-9/_-]{0,80}$/i.test(input.context) ? input.context : '/';
  const query = input.message.trim();
  const budgetPaise = parseBudget(query);
  if (budgetPaise === 'invalid') {
    return NextResponse.json({ error: 'Add a valid budget in rupees, for example “under ₹1500”.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) return NextResponse.json({ error: 'Your sign-in could not be checked.' }, { status: 503 });
  const { data: { user }, error: authError } = sessionData.session
    ? await supabase.auth.getUser()
    : { data: { user: null }, error: null };
  if (authError) return NextResponse.json({ error: 'Your sign-in could not be verified.' }, { status: 503 });
  const key = user?.id ?? 'public';
  const now = Date.now();
  const count = requestCounts.get(key);
  if (count && now - count.start < 60_000 && count.count >= 30) {
    return NextResponse.json({ error: 'Please wait a minute before asking again.' }, { status: 429 });
  }
  requestCounts.set(key, !count || now - count.start >= 60_000 ? { start: now, count: 1 } : { ...count, count: count.count + 1 });

  if (!user) {
    return NextResponse.json({
      answer: 'I can help you navigate OUTS. Sign in with a verified campus profile to search real listings. Reuse supports sell, free, exchange, and request-based rent; RentFlow requests require owner approval.',
      results: [],
      suggestions: [{ label: 'Sign in', href: '/auth' }, { label: 'OUTS Reuse', href: '/auth?next=%2Freuse' }, { label: 'OUTS Rent', href: '/auth?next=%2Frent' }],
    }, { headers: { 'cache-control': 'no-store' } });
  }

  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('college,is_verified,student_verification_status').eq('id', user.id).maybeSingle();
  if (profileError) return NextResponse.json({ error: 'Your campus profile could not be checked.' }, { status: 503 });
  if (!profile?.college || profile.is_verified !== true || profile.student_verification_status !== 'verified') {
    return NextResponse.json({
      answer: 'Update your profile and complete campus verification to search real campus listings. You can still browse OUTS tasks and peer learning from the workspace.',
      results: [],
      suggestions: [{ label: 'Profile settings', href: '/account' }, { label: 'Workspace', href: '/dashboard' }],
    }, { headers: { 'cache-control': 'no-store' } });
  }

  const [reuseResult, rentResult] = await Promise.all([
    supabase.from('reuse_listings')
      .select('id,title,description,category,listing_type,price_paise,college')
      .eq('status', 'published').eq('college', profile.college).gt('available_quantity', 0)
      .order('created_at', { ascending: false }).limit(100),
    supabase.from('rent_listings')
      .select('id,title,description,subcategory,daily_price_paise,college,availability_status')
      .eq('status', 'published').eq('availability_status', 'available').ilike('college', profile.college)
      .order('created_at', { ascending: false }).limit(100),
  ]);
  if (reuseResult.error || rentResult.error) {
    return NextResponse.json({ error: 'Campus inventory is unavailable. Check that the Reuse and Rent migrations are applied and your campus is configured.' }, { status: 503 });
  }

  const candidates: Result[] = [
    ...(reuseResult.data ?? []).map(item => {
      const kind = item.listing_type as 'sell' | 'free' | 'exchange' | 'rent';
      const amount = Number(item.price_paise);
      const label = kind === 'free' ? 'Free' : kind === 'exchange' ? 'Exchange' : `₹${(amount / 100).toLocaleString('en-IN')}${kind === 'rent' ? ' / day' : ''}`;
      return {
        id: `reuse:${item.id}`, title: item.title, category: item.category, type: kind,
        college: item.college, price_paise: amount, price_label: label,
        href: `/reuse/${item.id}`, description: item.description,
      };
    }),
    ...(rentResult.data ?? []).map(item => ({
      id: `rent:${item.id}`, title: item.title, category: item.subcategory, type: 'rent',
      college: item.college, price_paise: Number(item.daily_price_paise),
      price_label: `₹${(Number(item.daily_price_paise) / 100).toLocaleString('en-IN')} / day`,
      href: `/rent/${item.id}`, description: item.description,
    })),
  ];
  const terms = buildTerms(query);
  const matches = candidates.filter(item => {
    const text = `${item.title} ${item.description} ${item.category} ${item.type}`.toLowerCase();
    return (!terms.length || terms.some(term => text.includes(term)))
      && (budgetPaise === null || item.price_paise <= budgetPaise);
  }).sort((a, b) => {
    const score = (item: Result) => terms.reduce((sum, term) => sum + (`${item.title} ${item.category}`.toLowerCase().includes(term) ? 2 : 1), 0);
    return score(b) - score(a) || a.price_paise - b.price_paise || a.title.localeCompare(b.title);
  }).slice(0, 6);

  return NextResponse.json({
    answer: makeAnswer(matches, query, context),
    results: matches,
    suggestions: getSuggestions(query),
  }, { headers: { 'cache-control': 'no-store' } });
}
