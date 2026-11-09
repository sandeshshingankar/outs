'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Send } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Task = {
  id: string;
  provider_id: string;
  title: string;
  category: string;
  budget: number | string;
  description: string;
  deadline_at: string | null;
  status: string;
  payment_required?: boolean;
  payment_status?: string;
  attachment_paths?: string[];
};
type ReceivedApplication = { id: string; applicant_id: string; cover_message: string; status: string; created_at: string };

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [task, setTask] = useState<Task | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [applied, setApplied] = useState(false);
  const [myApplicationStatus, setMyApplicationStatus] = useState('');
  const [applications, setApplications] = useState<ReceivedApplication[]>([]);
  const [busyAction, setBusyAction] = useState(false);
  const [reportReason, setReportReason] = useState('academic_integrity');
  const [reportDetails, setReportDetails] = useState('');
  const [attachmentLinks, setAttachmentLinks] = useState<{ name:string;url:string }[]>([]);

  useEffect(() => {
    let active = true;
    async function loadTask() {
      const [{ data: authData, error: authError }, { data: taskData, error: taskError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('tasks').select('*').eq('id', id).single(),
      ]);
      if (!active) return;
      setUser(authData.user);
      if (authError) setError(`Could not check your sign-in: ${authError.message}`);
      if (taskError) {
        setError(`Could not load task: ${taskError.message}`);
        setTask(null);
        return;
      }
      setTask(taskData as Task);
      const paths=(taskData.attachment_paths??[]) as string[];
      const signed=await Promise.all(paths.map(async path=>{const {data,error:signedError}=await supabase.storage.from('outs-task-attachments').createSignedUrl(path,1800);return signedError||!data?null:{name:path.split('/').at(-1)??'Attachment',url:data.signedUrl};}));
      setAttachmentLinks(signed.filter((item):item is {name:string;url:string}=>Boolean(item)));
      if (authData.user && taskData.provider_id === authData.user.id) {
        const { data: received, error: applicationError } = await supabase.from('applications')
          .select('id,applicant_id,message,status,created_at').eq('task_id', id).order('created_at', { ascending: false });
        if (applicationError) setError(`Could not load applications: ${applicationError.message}`);
        else setApplications((received ?? []).map((row) => ({ ...row, cover_message: row.message ?? '' })) as ReceivedApplication[]);
      } else if (authData.user) {
        const { data: existingApplication, error: applicationError } = await supabase.from('applications')
          .select('id,status').eq('task_id', id).eq('applicant_id', authData.user.id).maybeSingle();
        if (applicationError) setError(`Could not check your application: ${applicationError.message}`);
        else { setApplied(Boolean(existingApplication)); setMyApplicationStatus(existingApplication?.status ?? ''); }
      }
    }
    void loadTask();
    return () => { active = false; };
  }, [id, supabase]);

  async function apply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) { router.push('/auth'); return; }
    setBusy(true);
    setNotice('');
    setError('');
    const { error: applicationError } = await supabase.from('applications').insert({
      task_id: id, listing_id: null, applicant_id: user.id,
      proposed_price_inr: Math.max(50, Math.round(Number(task?.budget ?? 50))), message: message.trim(),
    });
    if (applicationError) setError(`Could not submit application: ${applicationError.message}`);
    else { setApplied(true); setNotice('Application submitted. The task owner can review it from their workspace.'); }
    setBusy(false);
  }

  async function cancelTask() {
    if (!user || !task || !window.confirm('Cancel this open task?')) return;
    setBusyAction(true);
    const { error: updateError } = await supabase.rpc('transition_task', { p_task_id: task.id, p_next_status: 'cancelled' });
    if (updateError) setError(`Could not cancel task: ${updateError.message}`);
    else { setTask({ ...task, status: 'cancelled' }); setNotice('Task cancelled.'); }
    setBusyAction(false);
  }

  async function deleteTask() {
    if (!user || !task || !['draft', 'open', 'cancelled'].includes(task.status)) return;
    if (!window.confirm('Delete this task? This cannot be undone.')) return;
    setBusyAction(true);
    const { count, error: deleteError } = await supabase.from('tasks').delete({ count: 'exact' })
      .eq('id', task.id).eq('provider_id', user.id);
    if (deleteError) setError(`Could not delete task: ${deleteError.message}`);
    else if (!count) setError('The database did not delete the task. It may be protected by policy.');
    else {
      if(task.attachment_paths?.length){const {error:filesError}=await supabase.storage.from('outs-task-attachments').remove(task.attachment_paths);if(filesError)setNotice('Task deleted. Some private attachment files could not be cleaned up; contact support.');}
      router.replace('/dashboard');
    }
    setBusyAction(false);
  }

  async function updateApplication(applicationId: string, status: 'accepted' | 'rejected') {
    setBusyAction(true); setError('');
    const { error: updateError } = await supabase.from('applications').update({ status }).eq('id', applicationId);
    if (updateError) setError(`Could not update application: ${updateError.message}`);
    else { setApplications((current) => current.map((item) => item.id === applicationId ? { ...item, status } : item)); setNotice(`Application ${status}.`); }
    setBusyAction(false);
  }

  async function transitionTask(nextStatus: string) {
    if (!task) return;
    setBusyAction(true); setError('');
    const { error: transitionError } = await supabase.rpc('transition_task', { p_task_id: task.id, p_next_status: nextStatus });
    if (transitionError) setError(`Could not update task: ${transitionError.message}`);
    else { setTask({ ...task, status: nextStatus }); setNotice(`Task marked ${nextStatus.replace('_',' ')}.`); }
    setBusyAction(false);
  }

  async function reportTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !task) return;
    setBusyAction(true); setError('');
    const { error: reportError } = await supabase.from('task_reports').insert({ task_id: task.id, reporter_id: user.id, reason: reportReason, details: reportDetails.trim() });
    if (reportError) setError(reportError.code === '23505' ? 'You have already reported this task.' : `Could not submit report: ${reportError.message}`);
    else { setReportDetails(''); setNotice('Report submitted for admin review.'); }
    setBusyAction(false);
  }

  if (!task) return <main className="app-loading">{error || notice || 'Loading task…'}</main>;

  return (
    <main className="form-page">
      <Link href="/tasks" className="back-link"><ArrowLeft size={16} /> Back to opportunities</Link>
      <article className="detail-card">
        <span className="task-category">{task.category}</span>
        <h1>{task.title}</h1>
        <div className="detail-budget">₹{Number(task.budget).toLocaleString('en-IN')} <small>proposed budget</small></div>
        <p className="detail-description">{task.description}</p>
        <p className="muted">Deadline: {task.deadline_at ? new Date(task.deadline_at).toLocaleString() : 'Flexible'}</p>
        {attachmentLinks.length>0&&<section className="task-attachments"><b>Attachments</b>{attachmentLinks.map(file=><a key={file.url} href={file.url} target="_blank" rel="noreferrer">{file.name}</a>)}</section>}
        {task.provider_id === user?.id ? <>
          <div className="notice">This is your task · Status: {task.status.replace('_', ' ')}{task.payment_required?` · Payment: ${task.payment_status??'pending'}`:''}</div>
          {task.payment_required&&task.status==='draft'&&<p className="notice">This task is unpublished and not visible in the marketplace. Task checkout is disabled until compliant Razorpay Route settlement is configured and tested.</p>}
          <div className="task-actions detail-actions">
            {task.status === 'open' && <button type="button" disabled={busyAction} onClick={cancelTask}>Cancel task</button>}
            {task.status === 'open' && applications.some((application) => application.status === 'accepted') && <button type="button" disabled={busyAction} onClick={() => void transitionTask('in_progress')}>Start task</button>}
            {task.status === 'submitted' && <><button type="button" disabled={busyAction} onClick={() => void transitionTask('completed')}>Mark completed</button><button type="button" disabled={busyAction} onClick={() => void transitionTask('revision_requested')}>Request revision</button></>}
            {['draft', 'open', 'cancelled'].includes(task.status) && <button type="button" disabled={busyAction} onClick={deleteTask}>Delete task</button>}
          </div>
          {applications.length > 0 && <section className="received-applications"><h2>Applications</h2>{applications.map((application) => <article className="application-row" key={application.id}><div><b>Applicant</b><small>{application.status} · {new Date(application.created_at).toLocaleString()}</small><p>{application.cover_message}</p>{application.status === 'pending' && <div className="task-actions"><button type="button" disabled={busyAction} onClick={() => void updateApplication(application.id,'accepted')}>Accept</button><button type="button" disabled={busyAction} onClick={() => void updateApplication(application.id,'rejected')}>Reject</button></div>}</div><Link href={`/messages?with=${application.applicant_id}&task=${task.id}`}>Message applicant</Link></article>)}</section>}
        </> : (
          <>
          {task.status === 'in_progress' && myApplicationStatus === 'accepted' && <button className="btn btn-dark" type="button" disabled={busyAction} onClick={() => void transitionTask('submitted')}>Submit task for review</button>}
          {task.status === 'revision_requested' && myApplicationStatus === 'accepted' && <button className="btn btn-dark" type="button" disabled={busyAction} onClick={() => void transitionTask('submitted')}>Resubmit task</button>}
          {task.status === 'open' && <form onSubmit={apply} className="task-form">
            <label>Message to the task owner
              <textarea required minLength={10} rows={4} value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Introduce yourself and explain how you can help…" />
            </label>
            <button className="btn btn-dark" disabled={busy || applied || task.status !== 'open'}><Send size={16} /> {busy ? 'Sending…' : applied ? 'Application submitted' : 'Apply to this task'}</button>
          </form>}
          {user && <form onSubmit={reportTask} className="task-form report-form"><h2>Report this task</h2><label>Reason<select value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option value="academic_integrity">Academic integrity concern</option><option value="harassment">Harassment</option><option value="scam">Scam or payment issue</option><option value="misleading">Misleading content</option><option value="other">Other</option></select></label><label>Details<textarea minLength={10} maxLength={2000} required value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} /></label><button className="btn btn-light" disabled={busyAction}>Submit report</button></form>}
          </>
        )}
        {error && <p className="notice account-error" role="alert">{error}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}
      </article>
    </main>
  );
}
