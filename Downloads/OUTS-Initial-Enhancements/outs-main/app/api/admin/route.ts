import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const { data: profile, error: roleError } = await supabase.from('profiles')
    .select('role').eq('id', user.id).maybeSingle();
  if (roleError) {
    console.error('Admin role lookup failed:', roleError.message);
    return NextResponse.json({ error: 'Admin authorization could not be verified.' }, { status: 503 });
  }
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });

  const [profiles, studentsMode, teachersMode, tasks, applications, services, activeServices, adCount, userRows, taskRows, reports, payments, moderationEvents] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('active_mode','student'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('active_mode','teacher'),
    supabase.from('tasks').select('id', { count: 'exact', head: true }),
    supabase.from('applications').select('id', { count: 'exact', head: true }),
    supabase.from('learning_services').select('id', { count: 'exact', head: true }),
    supabase.from('learning_services').select('id', { count: 'exact', head: true }).eq('status','active'),
    supabase.from('advertisements').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id,full_name,college,course,active_mode,role,is_verified,created_at').order('created_at',{ascending:false}).limit(100),
    supabase.from('tasks').select('id,title,category,status,provider_id,moderation_status,moderation_reason,created_at').order('created_at',{ascending:false}).limit(100),
    supabase.from('task_reports').select('id,task_id,reporter_id,reason,details,status,resolution,created_at').order('created_at',{ascending:false}).limit(100),
    supabase.from('payment_transactions').select('amount_paise,status').eq('status','paid'),
    supabase.from('task_moderation_events').select('id,task_id,admin_id,action,reason,created_at').order('created_at',{ascending:false}).limit(100),
  ]);
  const failure = [profiles, tasks, applications, services].find((result) => result.error);
  if (failure?.error) {
    console.error('Admin overview query failed:', failure.error.message);
    return NextResponse.json({ error: 'Admin overview data could not be loaded under the current database policies.' }, { status: 503 });
  }
  const { data: advertisements, error: adError } = await supabase.from('advertisements')
    .select('id,title,brand_name,category,starts_at,duration_days,total_price,status,payment_status,rejection_reason,impressions,clicks,created_at,advertiser_id')
    .order('created_at', { ascending: false }).limit(100);
  return NextResponse.json({
    students: profiles.count ?? 0,
    studentModes: studentsMode.count ?? 0,
    teacherModes: teachersMode.count ?? 0,
    tasks: tasks.count ?? 0,
    applications: applications.count ?? 0,
    services: services.count ?? 0,
    advertisements: adError ? [] : advertisements ?? [],
    advertisementSetupError: adError ? 'Apply the advertisements migration to enable moderation.' : null,
    users: userRows.error ? [] : userRows.data ?? [],
    tasksList: taskRows.error ? [] : taskRows.data ?? [],
    reports: reports.error ? [] : reports.data ?? [],
    moderationEvents: moderationEvents.error ? [] : moderationEvents.data ?? [],
    activeServices: activeServices.count ?? 0,
    advertisementCount: adCount.count ?? 0,
    verifiedPaymentVolumePaise: (payments.data ?? []).reduce((sum, row) => sum + Number(row.amount_paise), 0),
    commission: null,
    dataWarnings: [userRows.error, taskRows.error, reports.error, payments.error, moderationEvents.error].filter(Boolean).map((error) => error?.message),
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { data: profile, error: roleError } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (roleError) return NextResponse.json({ error: 'Admin authorization could not be verified.' }, { status: 503 });
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  const input = body as { id?: unknown; action?: unknown; reason?: unknown };
  if (typeof input.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.id)
    || !['approve','reject','pause','expire','hide_task','restore_task','remove_task','resolve_report','review_report','dismiss_report'].includes(String(input.action))
    || (input.reason !== undefined && typeof input.reason !== 'string')) {
    return NextResponse.json({ error: 'Invalid advertisement action.' }, { status: 400 });
  }
  const reason = typeof input.reason === 'string' ? input.reason.trim() : null;
  if (['reject','hide_task','remove_task','resolve_report','review_report','dismiss_report'].includes(String(input.action)) && (!reason || reason.length < 3 || reason.length > 1000)) {
    return NextResponse.json({ error: 'Provide a reason between 3 and 1000 characters.' }, { status: 400 });
  }
  if (String(input.action).endsWith('_task')) {
    const action = input.action === 'hide_task' ? 'hide' : input.action === 'remove_task' ? 'remove' : 'restore';
    const { error: moderationError } = await supabase.rpc('admin_moderate_task', { p_task_id: input.id, p_action: action, p_reason: reason });
    if (moderationError) return NextResponse.json({ error: 'Task moderation could not be completed.' }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  if (['resolve_report','review_report','dismiss_report'].includes(String(input.action))) {
    const status = input.action === 'resolve_report' ? 'resolved' : input.action === 'review_report' ? 'reviewing' : 'dismissed';
    const { error: reportError } = await supabase.rpc('resolve_task_report', { p_report_id: input.id, p_status: status, p_resolution: reason });
    if (reportError) return NextResponse.json({ error: 'Task report could not be updated.' }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  const { error: reviewError } = await supabase.rpc('admin_review_advertisement', {
    p_advertisement_id: input.id, p_action: input.action, p_reason: reason,
  });
  if (reviewError) {
    console.error('Advertisement review failed:', reviewError.message);
    return NextResponse.json({ error: 'The advertisement could not be updated. It may be unpaid or no longer eligible.' }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
