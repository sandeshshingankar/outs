import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function authorize() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('role').eq('id', user.id).maybeSingle();
  if (profileError) return { response: NextResponse.json({ error: 'Admin access could not be verified.' }, { status: 503 }) };
  if (profile?.role !== 'admin') return { response: NextResponse.json({ error: 'Admin access required.' }, { status: 403 }) };
  return { supabase };
}

export async function GET() {
  const auth = await authorize();
  if ('response' in auth) return auth.response;
  const [listings, reports, events] = await Promise.all([
    auth.supabase.from('reuse_listings')
      .select('id,title,category,listing_type,college,status,moderation_reason,created_at')
      .order('created_at', { ascending: false }).limit(100),
    auth.supabase.from('reuse_reports')
      .select('id,listing_id,reporter_id,reason,details,status,resolution,created_at,reuse_listings(title)')
      .order('created_at', { ascending: false }).limit(100),
    auth.supabase.from('reuse_moderation_events')
      .select('id,listing_id,admin_id,action,reason,created_at')
      .order('created_at', { ascending: false }).limit(100),
  ]);
  const failed = [listings, reports, events].find(result => result.error);
  if (failed?.error) return NextResponse.json({ error: `Reuse admin data is unavailable: ${failed.error.message}` }, { status: 503 });
  return NextResponse.json({ listings: listings.data ?? [], reports: reports.data ?? [], events: events.data ?? [] });
}

export async function PATCH(request: Request) {
  const auth = await authorize();
  if ('response' in auth) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  const input = body as { type?: unknown; id?: unknown; action?: unknown; reason?: unknown };
  if (typeof input.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.id) ||
    (input.reason !== undefined && typeof input.reason !== 'string')) {
    return NextResponse.json({ error: 'Invalid moderation action.' }, { status: 400 });
  }
  const reason = typeof input.reason === 'string' ? input.reason.slice(0, 500) : null;
  const result = input.type === 'listing' && ['approve', 'reject', 'suspend', 'restore'].includes(String(input.action))
    ? await auth.supabase.rpc('admin_review_reuse_listing', {
      p_listing_id: input.id, p_action: input.action, p_reason: reason,
    })
    : input.type === 'report' && ['reviewed', 'resolved', 'dismissed'].includes(String(input.action))
      ? await auth.supabase.rpc('admin_review_reuse_report', {
        p_report_id: input.id, p_status: input.action, p_resolution: reason,
      })
      : null;
  if (!result) return NextResponse.json({ error: 'Invalid moderation action.' }, { status: 400 });
  if (result.error) return NextResponse.json({ error: `Moderation action failed: ${result.error.message}` }, { status: 409 });
  return NextResponse.json({ ok: true });
}
