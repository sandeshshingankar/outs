import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type DeleteInput = { password?: unknown; confirmation?: unknown };

async function listOwnedFiles(admin: NonNullable<ReturnType<typeof createAdminClient>>,bucket:string,prefix:string,depth=0):Promise<{paths:string[];error:boolean}> {
  if(depth>4)return {paths:[],error:true};
  const {data,error}=await admin.storage.from(bucket).list(prefix,{limit:1000});
  if(error)return {paths:[],error:true};
  const paths:string[]=[];
  for(const item of data??[]){
    if(item.name==='.emptyFolderPlaceholder')continue;
    const path=`${prefix}/${item.name}`;
    if(item.id===null){const nested=await listOwnedFiles(admin,bucket,path,depth+1);if(nested.error)return nested;paths.push(...nested.paths);}
    else paths.push(path);
  }
  return {paths,error:false};
}

export async function DELETE(request: Request) {
  let supabase;
  try { supabase = await createClient(); } catch {
    return NextResponse.json({ error: 'Supabase authentication is not configured.' }, { status: 503 });
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const admin = createAdminClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!admin || !url || !key) return NextResponse.json({ error: 'Account deletion is not configured on the server.' }, { status: 503 });

  let input: DeleteInput;
  try { input = await request.json() as DeleteInput; } catch { return NextResponse.json({ error: 'Invalid confirmation.' }, { status: 400 }); }
  if (input.confirmation !== 'DELETE' || typeof input.password !== 'string' || !input.password) {
    return NextResponse.json({ error: 'Enter your password and type DELETE to confirm.' }, { status: 400 });
  }
  if (!user.email) return NextResponse.json({ error: 'This account cannot be re-authenticated with a password. Contact support.' }, { status: 409 });

  const verifier = createSupabaseClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: verified, error: verifyError } = await verifier.auth.signInWithPassword({ email: user.email, password: input.password });
  if (verifyError || verified.user?.id !== user.id) return NextResponse.json({ error: 'Password verification failed.' }, { status: 401 });

  const userId = user.id;
  const checks = await Promise.all([
    admin.from('profiles').select('id,role,avatar_path').eq('id', userId).maybeSingle(),
    admin.from('tasks').select('id', { head: true, count: 'exact' }).eq('provider_id', userId),
    admin.from('applications').select('id', { head: true, count: 'exact' }).eq('applicant_id', userId),
    admin.from('listings').select('id', { head: true, count: 'exact' }).eq('owner_id', userId),
    admin.from('conversations').select('id', { head: true, count: 'exact' }).or(`provider_id.eq.${userId},performer_id.eq.${userId}`),
    admin.from('messages').select('id', { head: true, count: 'exact' }).eq('sender_id', userId),
    admin.from('learning_services').select('id', { head: true, count: 'exact' }).eq('provider_id', userId),
    admin.from('teaching_session_requests').select('id', { head: true, count: 'exact' }).or(`provider_id.eq.${userId},student_id.eq.${userId}`),
    admin.from('learning_requests').select('id', { head: true, count: 'exact' }).eq('student_id', userId),
    admin.from('learning_offers').select('id', { head: true, count: 'exact' }).eq('teacher_id', userId),
    admin.from('advertisements').select('id', { head: true, count: 'exact' }).eq('advertiser_id', userId),
    admin.from('payment_transactions').select('id', { head: true, count: 'exact' }).eq('user_id', userId),
    admin.from('task_reports').select('id', { head: true, count: 'exact' }).or(`reporter_id.eq.${userId},resolved_by.eq.${userId}`),
    admin.from('task_moderation_events').select('id', { head: true, count: 'exact' }).eq('admin_id', userId),
  ]);
  const profile = checks[0];
  if (checks.some((result) => result.error) || !profile.data) {
    console.error('Account deletion relationship check failed.');
    return NextResponse.json({ error: 'We could not verify all account relationships. No data was changed.' }, { status: 503 });
  }
  if (profile.data.role === 'admin') return NextResponse.json({ error: 'Admin accounts cannot be deleted through self-service.' }, { status: 409 });
  const relatedCount = checks.slice(1).reduce((sum, result) => sum + (result.count ?? 0), 0);
  if (relatedCount > 0) {
    return NextResponse.json({
      error: 'This account has marketplace, conversation, moderation, or financial history that must be retained or reviewed. No data was changed; contact OUTS support for a retention review.',
    }, { status: 409 });
  }

  const ownedFiles=await Promise.all(['outs-avatars','outs-ad-creatives','outs-task-attachments'].map(bucket=>listOwnedFiles(admin,bucket,userId)));
  if(ownedFiles.some(result=>result.error))return NextResponse.json({ error: 'Private account files could not be checked. No data was changed.' }, { status: 503 });
  const removalResults=await Promise.all(ownedFiles.map((result,index)=>result.paths.length?admin.storage.from(['outs-avatars','outs-ad-creatives','outs-task-attachments'][index]).remove(result.paths):Promise.resolve({error:null})));
  if (removalResults.some(result=>result.error)) return NextResponse.json({ error: 'Some private files may already have been removed, but Supabase could not complete file cleanup. Your account still exists; contact support before retrying.' }, { status: 503 });
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error('Supabase Auth account deletion failed:', deleteError.message);
    return NextResponse.json({ error: 'Supabase could not complete account deletion. The profile picture may already have been removed; your sign-in account remains. Contact support before retrying.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
