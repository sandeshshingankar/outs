import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  return NextResponse.json(
    { error: 'Permanent account deletion is unavailable until the complete schema and payment/dispute retention requirements are verified. No data was changed.' },
    { status: 503 },
  );
}
