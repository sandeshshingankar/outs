'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight, BriefcaseBusiness, ClipboardList, GraduationCap, LogOut,
  MessageCircle, Plus, Search, Settings, ShieldCheck, Repeat2, Bell, Megaphone,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { normalizeNotifications } from '@/lib/notifications';
import SponsoredAds from '@/components/sponsored-ads';

type Profile = { id: string; full_name: string | null; college: string | null; active_mode: 'student' | 'teacher' };
type Task = { id: string; title: string; category: string; budget: number; deadline_at: string | null; status: string; description: string };
type Application = { id: string; task_id: string; applicant_id: string; cover_message: string; status: string; created_at: string; taskTitle: string; applicantName: string };

export default function Dashboard() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mine, setMine] = useState<Task[]>([]);
  const [received, setReceived] = useState<Application[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !currentUser) {
      setError(authError?.message ?? 'Your session has expired. Please sign in again.');
      router.replace('/auth?next=%2Fdashboard');
      setLoading(false);
      return;
    }
    setUser(currentUser);
    const [profileResult, tasksResult, ownResult] = await Promise.all([
      supabase.from('profiles').select('id,full_name,college,active_mode').eq('id', currentUser.id).maybeSingle(),
      supabase.from('tasks').select('id,title,category,budget,deadline_at,status,description').eq('status', 'open').order('created_at', { ascending: false }).limit(8),
      supabase.from('tasks').select('id,title,category,budget,deadline_at,status,description').eq('provider_id', currentUser.id).order('created_at', { ascending: false }).limit(10),
    ]);
    if (profileResult.error) setError(`Could not load your profile: ${profileResult.error.message}`);
    else if (profileResult.data) setProfile(profileResult.data as Profile);
    if (tasksResult.error) setError(`Could not load open tasks: ${tasksResult.error.message}`);
    else setTasks((tasksResult.data ?? []) as Task[]);
    if (ownResult.error) setError(`Could not load your tasks: ${ownResult.error.message}`);
    else {
      const ownedTasks = (ownResult.data ?? []) as Task[];
      setMine(ownedTasks);
      if (ownedTasks.length) {
        const applicationsResult = await supabase.from('applications').select('id,task_id,applicant_id,message,status,created_at').in('task_id', ownedTasks.map((task) => task.id)).order('created_at', { ascending: false });
        if (applicationsResult.error) setError(`Could not load received applications: ${applicationsResult.error.message}`);
        else {
          const applications = applicationsResult.data ?? [];
          const taskTitles = new Map(ownedTasks.map((task) => [task.id, task.title]));
          const profilesResult = applications.length
            ? await supabase.from('profiles').select('id,full_name').in('id', [...new Set(applications.map((application) => application.applicant_id))])
            : { data: [], error: null };
          if (profilesResult.error) setError(`Could not load applicant profiles: ${profilesResult.error.message}`);
          const applicantNames = new Map((profilesResult.data ?? []).map((candidate) => [candidate.id, candidate.full_name || 'OUTS member']));
          setReceived(applications.map((application) => ({
            ...application,
            cover_message: application.message ?? '',
            taskTitle: taskTitles.get(application.task_id) ?? 'Task',
            applicantName: applicantNames.get(application.applicant_id) ?? 'OUTS member',
          })));
        }
      }
      const { data: notificationRows, error: notificationError } = await supabase.from('notifications')
        .select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(1000);
      if (notificationError) setError(`Could not load unread notifications: ${notificationError.message}`);
      else {
        try {
          setUnread(normalizeNotifications((notificationRows ?? []) as Record<string, unknown>[]).filter((notification) => !notification.isRead).length);
        } catch (schemaError) {
          setError(schemaError instanceof Error ? schemaError.message : 'The notifications schema is not supported.');
        }
      }
    }
    setLoading(false);
  }, [router, supabase]);

  useEffect(() => { void load(); }, [load]);

  async function logout() {
    const { error: logoutError } = await supabase.auth.signOut({ scope: 'global' });
    if (logoutError) { setError(`Could not log out: ${logoutError.message}`); return; }
    router.replace('/');
    router.refresh();
  }

  async function switchMode() {
    if (!user || !profile) return;
    const next = profile.active_mode === 'teacher' ? 'student' : 'teacher';
    const { data, error: updateError } = await supabase.from('profiles').update({ active_mode: next })
      .eq('id', user.id).select('active_mode').single();
    if (updateError) { setError(`Could not change mode: ${updateError.message}`); return; }
    setProfile({ ...profile, active_mode: data.active_mode });
    setNotice(`Switched to ${next} mode.`);
  }

  async function setTaskApplicationStatus(applicationId: string, status: 'accepted' | 'rejected') {
    setError('');
    const { error: statusError } = await supabase.from('applications').update({ status }).eq('id', applicationId);
    if (statusError) setError(`Could not update the application: ${statusError.message}`);
    else {
      setReceived((current) => current.map((item) => item.id === applicationId ? { ...item, status } : item));
      setNotice(`Application ${status}.`);
    }
  }

  async function updateTaskStatus(task: Task, status: 'cancelled') {
    if (!user || !window.confirm(`Cancel "${task.title}"?`)) return;
    setBusy(true);
    const { error: updateError } = await supabase.rpc('transition_task', { p_task_id: task.id, p_next_status: status });
    if (updateError) setError(`Could not cancel task: ${updateError.message}`);
    else {
      setMine((current) => current.map((item) => item.id === task.id ? { ...item, status } : item));
      setNotice('Task cancelled.');
    }
    setBusy(false);
  }

  async function deleteTask(task: Task) {
    if (!user || !['draft', 'open', 'cancelled'].includes(task.status)) return;
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    setBusy(true);
    const { count, error: deleteError } = await supabase.from('tasks').delete({ count: 'exact' })
      .eq('id', task.id).eq('provider_id', user.id);
    if (deleteError) setError(`Could not delete task: ${deleteError.message}`);
    else if (!count) setError('The database did not delete the task. It may be protected by policy.');
    else {
      setMine((current) => current.filter((item) => item.id !== task.id));
      setNotice('Task deleted.');
    }
    setBusy(false);
  }

  if (loading) return <main className="app-loading">Loading your OUTS workspace…</main>;
  const teacherMode = profile?.active_mode === 'teacher';

  return <main className="workspace">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-mark">O</span><span>OUTS<span className="brand-dot">.</span></span></Link>
      <p className="side-label">WORKSPACE</p>
      <Link className="side-active" href="/dashboard"><ClipboardList /> Overview</Link>
      <Link href="/tasks"><Search /> Browse tasks</Link>
      <Link href="/tasks/new"><Plus /> Post a task</Link>
      <Link href="/learn"><GraduationCap /> Peer learning</Link>
      <Link href="/messages"><MessageCircle /> Messages</Link>
      <Link href="/notifications"><Bell /> Notifications {unread > 0 && <span className="unread-badge">{unread}</span>}</Link>
      <Link href="/account"><Settings /> Account settings</Link>
      <Link href="/advertiser"><Megaphone /> Advertise</Link>
      <div className="sidebar-bottom">
        <div className="mini-profile"><span>{(profile?.full_name || user?.email || 'S').slice(0, 1).toUpperCase()}</span><div><b>{profile?.full_name || 'Student'}</b><small>{profile?.college || 'Complete your profile'}</small></div></div>
        <button className="logout-btn" onClick={logout}><LogOut size={16} /> Log out everywhere</button>
      </div>
    </aside>
    <section className="workspace-main">
      <header className="workspace-top">
        <div><p className="eyebrow">{teacherMode ? 'TEACHER WORKSPACE' : 'STUDENT WORKSPACE'}</p><h1>Good to see you, {(profile?.full_name || 'Student').split(' ')[0]}.</h1><p className="muted">Find opportunities, share your skills and grow together.</p>
          <div className="mode-switch"><span>Current mode: <b>{teacherMode ? 'Teacher' : 'Student'}</b></span><button type="button" onClick={switchMode}><Repeat2 size={15} /> Switch to {teacherMode ? 'Student' : 'Teacher'} mode</button></div>
        </div>
        <div className="workspace-actions"><Link href="/account" className="btn btn-light"><Settings size={16} /> Account</Link><Link href={teacherMode ? '/learn' : '/tasks/new'} className="btn btn-dark"><Plus size={17} /> {teacherMode ? 'Manage teaching' : 'Post a task'}</Link></div>
      </header>
      {error && <p className="notice account-error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      <div className="stat-grid">
        <div className="stat-card"><span className="stat-icon"><Search /></span><small>Open opportunities</small><b>{tasks.length}</b><span>Available to explore</span></div>
        <div className="stat-card"><span className="stat-icon mint"><BriefcaseBusiness /></span><small>Your posted tasks</small><b>{mine.length}</b><span>Created by you</span></div>
        <div className="stat-card"><span className="stat-icon peach"><Bell /></span><small>Unread notifications</small><b>{unread}</b><Link href="/notifications">View notifications</Link></div>
      </div>
      <SponsoredAds />
      <div className="dashboard-columns">
        <section className="panel"><div className="panel-heading"><div><p className="eyebrow">DISCOVER</p><h2>{teacherMode ? 'Open tasks from students' : 'Latest opportunities'}</h2></div><Link href="/tasks" className="text-link">Explore all <ArrowUpRight size={15} /></Link></div>
          {tasks.length ? tasks.map((task) => <article className="dashboard-task" key={task.id}><div><span className="task-category">{task.category}</span><h3>{task.title}</h3><p>{task.description.slice(0, 100)}{task.description.length > 100 ? '…' : ''}</p></div><div className="task-price"><b>₹{Number(task.budget).toLocaleString('en-IN')}</b><Link href={`/tasks/${task.id}`}>View <ArrowUpRight size={14} /></Link></div></article>) : <div className="empty-state">No live tasks are available yet. <Link href="/tasks/new">Post an opportunity</Link>.</div>}
        </section>
        <section className="panel"><div className="panel-heading"><div><p className="eyebrow">YOUR ACTIVITY</p><h2>Your recent posts</h2></div></div>
          {mine.length ? mine.map((task) => <div className="my-task task-management" key={task.id}><div><Link href={`/tasks/${task.id}`}><b>{task.title}</b></Link><small>{task.category} · {task.status.replace('_', ' ')}</small><div className="task-actions">{task.status === 'open' && <button type="button" disabled={busy} onClick={() => updateTaskStatus(task, 'cancelled')}>Cancel</button>}{['draft', 'open', 'cancelled'].includes(task.status) && <button type="button" disabled={busy} onClick={() => deleteTask(task)}>Delete</button>}</div></div></div>) : <div className="empty-state">You have not posted a task yet.</div>}
          <Link className="outline-wide" href="/tasks/new">Create a task <Plus size={15} /></Link>
          <div className="integrity-note"><ShieldCheck /><p><b>Learn with integrity</b><br />Use OUTS for guidance, tutoring and collaboration—not for submitting work dishonestly.</p></div>
        </section>
      </div>
      <section className="panel applications-panel"><div className="panel-heading"><div><p className="eyebrow">TASK MANAGEMENT</p><h2>Received applications</h2></div></div>
        {received.length ? received.map((application) => <article className="application-row" key={application.id}><div><b>{application.applicantName}</b><small>Applied to {application.taskTitle} · {application.status}</small><p>{application.cover_message}</p>{application.status === 'pending' && <div className="task-actions"><button type="button" onClick={() => void setTaskApplicationStatus(application.id,'accepted')}>Accept</button><button type="button" onClick={() => void setTaskApplicationStatus(application.id,'rejected')}>Reject</button></div>}</div><Link className="text-link" href={`/messages?with=${application.applicant_id}&task=${application.task_id}`}>Message applicant <ArrowUpRight size={14} /></Link></article>) : <p className="empty-state">No applications received yet.</p>}
      </section>
      <footer className="workspace-footer">© 2026 OUTS · Student-powered, community-driven</footer>
    </section>
  </main>;
}
