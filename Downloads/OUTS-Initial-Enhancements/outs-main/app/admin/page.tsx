'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

type Advertisement = { id: string; title: string; brand_name: string; category: string; starts_at: string; duration_days: number; total_price: number; status: string; payment_status: string; rejection_reason: string | null; impressions: number; clicks: number; };
type AdminUser = { id: string; full_name: string; college: string | null; course: string | null; active_mode: string; role: string; is_verified: boolean; created_at: string };
type AdminTask = { id: string; title: string; category: string; status: string; provider_id: string; moderation_status: string; moderation_reason: string | null; created_at: string };
type AdminReport = { id: string; task_id: string; reporter_id: string; reason: string; details: string; status: string; resolution: string | null; created_at: string };
type ModerationEvent = { id: string; task_id: string; admin_id: string; action: string; reason: string | null; created_at: string };
type Overview = { students: number; studentModes: number; teacherModes: number; tasks: number; applications: number; services: number; activeServices: number; advertisements: Advertisement[]; advertisementCount: number; advertisementSetupError: string | null; users: AdminUser[]; tasksList: AdminTask[]; reports: AdminReport[]; moderationEvents: ModerationEvent[]; verifiedPaymentVolumePaise: number; commission: null; dataWarnings: string[] };

export default function Admin() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [message, setMessage] = useState('Checking admin access…');
  const [busyId, setBusyId] = useState('');
  const [userQuery, setUserQuery] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch('/api/admin', { cache: 'no-store' });
        if (response.status === 401) {
          router.replace('/auth?next=%2Fadmin');
          return;
        }
        const result = await response.json() as Overview | { error: string };
        if (!active) return;
        if (!response.ok) {
          setMessage('error' in result ? result.error : 'Admin access could not be verified.');
          return;
        }
        setOverview(result as Overview);
        setMessage('Admin overview');
      } catch (requestError) {
        if (active) setMessage(requestError instanceof Error ? requestError.message : 'Admin overview could not be loaded.');
      }
    }
    void load();
    return () => { active = false; };
  }, [router]);

  async function review(ad: Advertisement, action: 'approve' | 'reject' | 'pause' | 'expire') {
    const reason = action === 'reject' ? window.prompt('Reason for rejection (shown to advertiser):') : null;
    if (action === 'reject' && (reason === null || reason.trim().length < 3)) return;
    setBusyId(ad.id);
    try {
      const response = await fetch('/api/admin', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: ad.id, action, reason }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) setMessage(result.error ?? 'Advertisement action failed.');
      else {
        setOverview((current) => current ? { ...current, advertisements: current.advertisements.map((item) => item.id !== ad.id ? item : {
          ...item, status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : action === 'pause' ? 'paused' : 'expired', rejection_reason: action === 'reject' ? reason : null,
        }) } : current);
        setMessage(`Advertisement ${action}d.`);
      }
    } catch { setMessage('Advertisement action could not be completed.'); }
    setBusyId('');
  }

  async function adminAction(id: string, action: string, reason: string | null = null) {
    setBusyId(id);
    try {
      const response = await fetch('/api/admin', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, action, reason }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) setMessage(result.error ?? 'Admin action failed.');
      else {
        setMessage('Admin action completed.');
        if (action.endsWith('_task')) {
          const moderation_status = action === 'hide_task' ? 'hidden' : action === 'remove_task' ? 'removed' : 'visible';
          setOverview((current) => current ? { ...current, tasksList: current.tasksList.map((task) => task.id === id ? { ...task, moderation_status } : task) } : current);
        } else if (action.endsWith('_report')) {
          const status = action === 'resolve_report' ? 'resolved' : action === 'review_report' ? 'reviewing' : 'dismissed';
          setOverview((current) => current ? { ...current, reports: current.reports.map((report) => report.id === id ? { ...report, status, resolution: reason } : report) } : current);
        }
      }
    } catch { setMessage('Admin action could not be completed.'); }
    setBusyId('');
  }

  function askReason(label: string) {
    const reason = window.prompt(label);
    return reason && reason.trim().length >= 3 ? reason.trim() : null;
  }

  const visibleUsers = (overview?.users ?? []).filter((user) => `${user.full_name} ${user.college ?? ''} ${user.course ?? ''} ${user.active_mode} ${user.role}`.toLowerCase().includes(userQuery.trim().toLowerCase()));

  return <main className="form-page">
    <Link href="/dashboard" className="back-link"><ArrowLeft size={16} /> Dashboard</Link>
    <section className="form-card">
      <div className="auth-icon"><ShieldCheck /></div>
      <p className="eyebrow">OUTS CONTROL ROOM</p>
      <h1>Admin dashboard</h1>
      <p className="muted" role="status">{message}</p>
      {overview && <div className="stat-grid">
        <div className="stat-card"><small>Profiles</small><b>{overview.students}</b></div>
        <div className="stat-card"><small>Student modes</small><b>{overview.studentModes}</b></div>
        <div className="stat-card"><small>Teacher modes</small><b>{overview.teacherModes}</b></div>
        <div className="stat-card"><small>Tasks</small><b>{overview.tasks}</b></div>
        <div className="stat-card"><small>Applications</small><b>{overview.applications}</b></div>
        <div className="stat-card"><small>Teaching services</small><b>{overview.services}</b></div>
        <div className="stat-card"><small>Active teaching services</small><b>{overview.activeServices}</b></div>
        <div className="stat-card"><small>Campaigns</small><b>{overview.advertisementCount}</b></div>
        <div className="stat-card"><small>Verified ad payments</small><b>₹{(overview.verifiedPaymentVolumePaise / 100).toLocaleString('en-IN')}</b></div>
        <div className="stat-card"><small>Platform commission</small><b>Not configured</b></div>
      </div>}
      {overview?.dataWarnings.map((warning) => <p className="notice account-error" key={warning}>{warning}</p>)}
      {overview && <section className="admin-ad-section"><div className="panel-heading"><div><p className="eyebrow">ACCOUNT DIRECTORY</p><h2>Users</h2></div></div><label className="search-box wide"><input value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="Search name, college, course or mode" /></label><div className="admin-data-list">{visibleUsers.map((account) => <article className="admin-ad-row" key={account.id}><div><h3>{account.full_name || 'OUTS member'}</h3><p>{account.college || 'College not provided'}{account.course ? ` · ${account.course}` : ''}</p><small>{account.active_mode} mode · {account.role}{account.is_verified ? ' · verified' : ''} · Joined {new Date(account.created_at).toLocaleDateString()}</small></div></article>)}{!visibleUsers.length && <p className="empty-state">No matching users found in the latest 100 accounts.</p>}</div><p className="muted">Account suspension is unavailable until enforcement is added to all database access paths.</p></section>}
      {overview && <section className="admin-ad-section"><div className="panel-heading"><div><p className="eyebrow">TASK MODERATION</p><h2>Tasks</h2></div></div>{overview.tasksList.map((task) => <article className="admin-ad-row" key={task.id}><div><span className={`status status-${task.moderation_status}`}>{task.moderation_status}</span><h3>{task.title}</h3><p>{task.category} · {task.status}</p><small>{task.moderation_reason || `Provider ${task.provider_id}`}</small>{overview.moderationEvents.filter((event) => event.task_id === task.id).slice(0,3).map((event) => <small className="moderation-history" key={event.id}>{event.action} · {event.reason || 'No reason'} · {new Date(event.created_at).toLocaleString()}</small>)}</div><div className="task-actions">{task.moderation_status === 'visible' && <button disabled={busyId === task.id} onClick={() => { const reason = askReason('Reason for hiding this task:'); if (reason) void adminAction(task.id,'hide_task',reason); }}>Hide</button>}{task.moderation_status !== 'visible' && <button disabled={busyId === task.id} onClick={() => void adminAction(task.id,'restore_task')}>Restore</button>}{task.moderation_status !== 'removed' && <button disabled={busyId === task.id} onClick={() => { const reason = askReason('Reason for removing this task from the marketplace:'); if (reason) void adminAction(task.id,'remove_task',reason); }}>Remove</button>}</div></article>)}</section>}
      {overview && <section className="admin-ad-section"><div className="panel-heading"><div><p className="eyebrow">REPORT QUEUE</p><h2>Task reports</h2></div></div>{overview.reports.map((report) => <article className="admin-ad-row" key={report.id}><div><span className={`status status-${report.status}`}>{report.status}</span><h3>{report.reason.replace('_',' ')}</h3><p>{report.details}</p><small><Link href={`/tasks/${report.task_id}`}>View reported task</Link> · {new Date(report.created_at).toLocaleString()}</small>{report.resolution && <p>Resolution: {report.resolution}</p>}</div><div className="task-actions">{report.status === 'open' && <button disabled={busyId === report.id} onClick={() => { const reason = askReason('Review note:'); if (reason) void adminAction(report.id,'review_report',reason); }}>Review</button>}{['open','reviewing'].includes(report.status) && <><button disabled={busyId === report.id} onClick={() => { const reason = askReason('Resolution note:'); if (reason) void adminAction(report.id,'resolve_report',reason); }}>Resolve</button><button disabled={busyId === report.id} onClick={() => { const reason = askReason('Reason for dismissing report:'); if (reason) void adminAction(report.id,'dismiss_report',reason); }}>Dismiss</button></>}</div></article>)}{!overview.reports.length && <p className="empty-state">No open reports.</p>}</section>}
      {overview && <section className="admin-ad-section">
        <div className="panel-heading"><div><p className="eyebrow">CAMPAIGN REVIEW</p><h2>Advertisements</h2></div><Link className="text-link" href="/advertiser">Advertiser dashboard</Link></div>
        {overview.advertisementSetupError && <p className="notice" role="status">{overview.advertisementSetupError}</p>}
        {overview.advertisements.length ? overview.advertisements.map((ad) => <article className="admin-ad-row" key={ad.id}>
          <div><span className={`status status-${ad.status}`}>{ad.status}</span><h3>{ad.title}</h3><p>{ad.brand_name} · {ad.category} · ₹{Number(ad.total_price).toLocaleString('en-IN')} · Payment: {ad.payment_status}</p><small>{ad.impressions} impressions · {ad.clicks} clicks{ad.rejection_reason ? ` · Reason: ${ad.rejection_reason}` : ''}</small></div>
          <div className="task-actions">{ad.status === 'pending' && <><button disabled={busyId === ad.id || ad.payment_status !== 'paid'} onClick={() => void review(ad,'approve')} title={ad.payment_status !== 'paid' ? 'Verified payment is required' : undefined}>Approve</button><button disabled={busyId === ad.id} onClick={() => void review(ad,'reject')}>Reject</button></>}{ad.status === 'approved' && <button disabled={busyId === ad.id} onClick={() => void review(ad,'pause')}>Pause</button>}{['approved','paused'].includes(ad.status) && <button disabled={busyId === ad.id} onClick={() => void review(ad,'expire')}>Expire</button>}</div>
        </article>) : !overview.advertisementSetupError && <p className="empty-state">No campaigns have been submitted.</p>}
      </section>}
    </section>
  </main>;
}
