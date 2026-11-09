import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid event.' }, { status: 400 }); }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid event.' }, { status: 400 });
  const input = body as { id?: unknown; type?: unknown };
  if (typeof input.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.id)
    || !['impression','click'].includes(String(input.type))) {
    return NextResponse.json({ error: 'Invalid event.' }, { status: 400 });
  }
  const { data, error } = await supabase.rpc('record_advertisement_event', {
    p_advertisement_id: input.id, p_event_type: input.type,
  });
  if (error) return NextResponse.json({ error: 'Event tracking is unavailable.' }, { status: 503 });
  return NextResponse.json({ recorded: data === true });
}
