'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import AdminRentPanel from '@/components/admin-rent-panel';

type Advertisement = { id: string; title: string; brand_name: string; category: string; starts_at: string; duration_days: number; total_price: number; status: string; payment_status: string; rejection_reason: string | null; impressions: number; clicks: number; advertiser_id?:string; image_url?:string|null };
type AdminUser = { id: string; full_name: string; college: string | null; course: string | null; active_mode: string; role: string; is_verified: boolean; created_at: string };
type AdminTask = { id: string; title: string; description:string; category: string; budget:number|string; deadline_at:string|null; status: string; payment_status:string; provider_id: string; moderation_status: string; moderation_reason: string | null; created_at: string };
type AdminReport = { id: string; task_id: string; reporter_id: string; reason: string; details: string; status: string; resolution: string | null; created_at: string };
type ModerationEvent = { id: string; task_id: string; admin_id: string; action: string; reason: string | null; created_at: string };
type AdminPayment={id:string;user_id:string;task_id:string|null;advertisement_id:string|null;razorpay_order_id:string|null;razorpay_payment_id:string|null;razorpay_refund_id:string|null;amount_paise:number;buyer_fee_paise:number|null;status:string;currency:string;created_at:string};
type AdminLearningRequest={id:string;title:string;topic:string;category:string;student_id:string;level:string;session_type:string;budget_per_hour:number;status:string;created_at:string};
type AdminTeachingRequest={id:string;service_id:string;student_id:string;provider_id:string;status:string;proposed_price:number;agreed_price:number|null;scheduled_at:string|null;created_at:string};
type AdminLearningService={id:string;title:string;skill:string;provider_id:string;price:number;status:string;session_type:string;created_at:string};
type AdminAudit={id:number;actor_id:string|null;action:string;target_type:string;target_id:string;reason:string|null;details:Record<string,string>;created_at:string};
type PartnerRequestSummary={id:string;title:string;city:string;budget:number;status:string;created_at:string;requester_id:string;partner_category_id:string};
type PartnerBookingSummary={id:string;request_id:string;requester_id:string;provider_id:string;final_price:number;status:string;created_at:string};
type Overview = { students: number; newRegistrations30d:number; studentModes: number; teacherModes: number; tasks: number; taskStatuses:Record<string,number>; applications: number; taskApplicationCounts:Record<string,number>; services: number; activeServices: number; advertisements: Advertisement[]; advertisementCount: number;pendingAdvertisements:number; advertisementSetupError: string | null; users: AdminUser[]; tasksList: AdminTask[]; reports: AdminReport[]; moderationEvents: ModerationEvent[]; verifiedPaymentVolumePaise: number; verifiedBuyerFeesPaise:number; payments:AdminPayment[];learningRequestCount:number;learningOfferCount:number;learningRequests:AdminLearningRequest[];learningServices:AdminLearningService[];sessionRequests:AdminTeachingRequest[];auditLog:AdminAudit[]; partnerRequestCount?:number; partnerBookingCount?:number; partnerRequests?: PartnerRequestSummary[]; partnerBookings?: PartnerBookingSummary[]; commission: null; dataWarnings: string[] };

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
        <div className="stat-card"><small>New registrations (30d)</small><b>{overview.newRegistrations30d}</b></div>
        <div className="stat-card"><small>Student modes</small><b>{overview.studentModes}</b></div>
        <div className="stat-card"><small>Teacher modes</small><b>{overview.teacherModes}</b></div>
        <div className="stat-card"><small>Tasks</small><b>{overview.tasks}</b></div>
        <div className="stat-card"><small>Open / in progress / completed / cancelled</small><b>{overview.taskStatuses.open} / {overview.taskStatuses.in_progress} / {overview.taskStatuses.completed} / {overview.taskStatuses.cancelled}</b></div>
        <div className="stat-card"><small>Applications</small><b>{overview.applications}</b></div>
        <div className="stat-card"><small>Teaching services</small><b>{overview.services}</b></div>
        <div className="stat-card"><small>Student learn requests / offers</small><b>{overview.learningRequestCount} / {overview.learningOfferCount}</b></div>
        <div className="stat-card"><small>Active teaching services</small><b>{overview.activeServices}</b></div>
        <div className="stat-card"><small>Campaigns</small><b>{overview.advertisementCount}</b></div>
        <div className="stat-card"><small>Pending ad approvals</small><b>{overview.pendingAdvertisements}</b></div>
        <div className="stat-card"><small>Verified ad payments</small><b>₹{(overview.verifiedPaymentVolumePaise / 100).toLocaleString('en-IN')}</b></div>
        <div className="stat-card"><small>Verified task buyer fees (1%)</small><b>₹{(overview.verifiedBuyerFeesPaise / 100).toLocaleString('en-IN')}</b></div>
        <div className="stat-card"><small>OUTS Partner</small><b>{overview.partnerRequestCount ?? 0} requests · {overview.partnerBookingCount ?? 0} bookings</b></div>
        <div className="stat-card"><small>Platform commission</small><b>Not configured</b></div>
      </div>}
      {overview?.dataWarnings.map((warning) => <p className="notice account-error" key={warning}>{warning}</p>)}
      {overview && <section className="admin-ad-section"><div className="panel-heading"><div><p className="eyebrow">ACCOUNT DIRECTORY</p><h2>Users</h2></div></div><label className="search-box wide"><input value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="Search name, college, course or mode" /></label><div className="admin-data-list">{visibleUsers.map((account) => <article className="admin-ad-row" key={account.id}><div><h3>{account.full_name || 'OUTS member'}</h3><p>{account.college || 'College not provided'}{account.course ? ` · ${account.course}` : ''}</p><small>{account.active_mode} mode · {account.role}{account.is_verified ? ' · verified' : ''} · Joined {new Date(account.created_at).toLocaleDateString()}</small></div></article>)}{!visibleUsers.length && <p className="empty-state">No matching users found in the latest 100 accounts.</p>}</div><p className="muted">Account suspension is unavailable until enforcement is added to all database access paths.</p></section>}
      {overview && <section className="admin-ad-section"><div className="panel-heading"><div><p className="eyebrow">TASK MODERATION</p><h2>Tasks</h2></div></div>{overview.tasksList.map((task) => <article className="admin-ad-row" key={task.id}><div><span className={`status status-${task.moderation_status}`}>{task.moderation_status}</span><h3>{task.title}</h3><p>{task.category} · ₹{Number(task.budget).toLocaleString('en-IN')} · {task.status} · payment {task.payment_status} · {overview.taskApplicationCounts[task.id]??0} applications</p><p>{task.description}</p><small>{task.deadline_at?`Deadline ${new Date(task.deadline_at).toLocaleString()} · `:''}{task.moderation_reason || `Provider ${task.provider_id}`}</small>{overview.moderationEvents.filter((event) => event.task_id === task.id).slice(0,3).map((event) => <small className="moderation-history" key={event.id}>{event.action} · {event.reason || 'No reason'} · {new Date(event.created_at).toLocaleString()}</small>)}</div><div className="task-actions">{task.moderation_status === 'visible' && <button disabled={busyId === task.id} onClick={() => { const reason = askReason('Reason for hiding this task:'); if (reason) void adminAction(task.id,'hide_task',reason); }}>Hide</button>}{task.moderation_status !== 'visible' && <button disabled={busyId === task.id} onClick={() => void adminAction(task.id,'restore_task')}>Restore</button>}{task.moderation_status !== 'removed' && <button disabled={busyId === task.id} onClick={() => { const reason = askReason('Reason for removing this task from the marketplace:'); if (reason) void adminAction(task.id,'remove_task',reason); }}>Remove</button>}</div></article>)}</section>}
      {overview && <section className="admin-ad-section"><div className="panel-heading"><div><p className="eyebrow">REPORT QUEUE</p><h2>Task reports</h2></div></div>{overview.reports.map((report) => <article className="admin-ad-row" key={report.id}><div><span className={`status status-${report.status}`}>{report.status}</span><h3>{report.reason.replace('_',' ')}</h3><p>{report.details}</p><small><Link href={`/tasks/${report.task_id}`}>View reported task</Link> · {new Date(report.created_at).toLocaleString()}</small>{report.resolution && <p>Resolution: {report.resolution}</p>}</div><div className="task-actions">{report.status === 'open' && <button disabled={busyId === report.id} onClick={() => { const reason = askReason('Review note:'); if (reason) void adminAction(report.id,'review_report',reason); }}>Review</button>}{['open','reviewing'].includes(report.status) && <><button disabled={busyId === report.id} onClick={() => { const reason = askReason('Resolution note:'); if (reason) void adminAction(report.id,'resolve_report',reason); }}>Resolve</button><button disabled={busyId === report.id} onClick={() => { const reason = askReason('Reason for dismissing report:'); if (reason) void adminAction(report.id,'dismiss_report',reason); }}>Dismiss</button></>}</div></article>)}{!overview.reports.length && <p className="empty-state">No open reports.</p>}</section>}
      {overview && <section className="admin-ad-section"><div className="panel-heading"><div><p className="eyebrow">OUTS PARTNER</p><h2>Partner activity overview</h2></div><Link className="text-link" href="/partner">Open partner marketplace</Link></div><h3>Recent requests</h3>{(overview.partnerRequests ?? []).map((request) => <article className="admin-ad-row" key={request.id}><div><span className={`status status-${request.status}`}>{request.status}</span><h3>{request.title}</h3><p>{request.city} · ₹{Number(request.budget).toLocaleString('en-IN')} · requester {request.requester_id}</p><small>{new Date(request.created_at).toLocaleString()}</small></div></article>)}{!(overview.partnerRequests ?? []).length && <p className="empty-state">No active partner requests yet.</p>}<h3>Bookings</h3>{(overview.partnerBookings ?? []).map((booking) => <article className="admin-ad-row" key={booking.id}><div><span className={`status status-${booking.status}`}>{booking.status}</span><h3>Booking #{booking.id.slice(0, 8)}</h3><p>Request {booking.request_id} · buyer {booking.requester_id} · provider {booking.provider_id}</p><small>₹{Number(booking.final_price).toLocaleString('en-IN')} · {new Date(booking.created_at).toLocaleString()}</small></div></article>)}{!(overview.partnerBookings ?? []).length && <p className="empty-state">No partner bookings yet.</p>}</section>}
      {overview && <section className="admin-ad-section"><div className="panel-heading"><div><p className="eyebrow">PEER LEARNING</p><h2>Learning requests and services</h2></div><Link className="text-link" href="/learn/requests">Open marketplace</Link></div><h3>Student requests</h3>{overview.learningRequests.map((request)=><article className="admin-ad-row" key={request.id}><div><span className={`status status-${request.status}`}>{request.status}</span><h3>{request.title}</h3><p>{request.topic} · {request.category} · {request.level} · {request.session_type}</p><small>Budget ₹{Number(request.budget_per_hour).toLocaleString('en-IN')}/hour · Student {request.student_id} · {new Date(request.created_at).toLocaleString()}</small></div></article>)}{!overview.learningRequests.length&&<p className="empty-state">No student learning requests.</p>}<h3>Teaching services</h3>{overview.learningServices.map((service)=><article className="admin-ad-row" key={service.id}><div><span className={`status status-${service.status}`}>{service.status}</span><h3>{service.title}</h3><p>{service.skill} · {service.session_type} · ₹{Number(service.price).toLocaleString('en-IN')}/hour</p><small>Teacher {service.provider_id} · {new Date(service.created_at).toLocaleDateString()}</small></div></article>)}<h3>Teaching session requests</h3>{overview.sessionRequests.map((request)=><article className="admin-ad-row" key={request.id}><div><span className={`status status-${request.status}`}>{request.status}</span><p>Student {request.student_id} → teacher {request.provider_id} · ₹{Number(request.agreed_price??request.proposed_price).toLocaleString('en-IN')}/hour</p><small>{request.scheduled_at?new Date(request.scheduled_at).toLocaleString():'Not scheduled'}</small></div></article>)}{!overview.sessionRequests.length&&<p className="empty-state">No teaching session requests.</p>}</section>}
      {overview && <AdminRentPanel />}
      {overview && <section className="admin-ad-section"><div className="panel-heading"><div><p className="eyebrow">PAYMENT RECORDS</p><h2>Verified and pending transactions</h2></div></div><p className="muted">Verified volume includes advertisement checkout and any verified task payments. Provider settlement and commission are reported only where recorded.</p>{overview.payments.map(payment=><article className="admin-ad-row" key={payment.id}><div><span className={`status status-${payment.status}`}>{payment.status}</span><p>₹{(Number(payment.amount_paise)/100).toLocaleString('en-IN')} {payment.currency} · {payment.task_id?'Task '+payment.task_id:'Advertisement '+payment.advertisement_id}</p><small>Order {payment.razorpay_order_id||'—'} · Payment {payment.razorpay_payment_id||'—'} · Refund {payment.razorpay_refund_id||'—'}</small><small>Buyer fee {payment.buyer_fee_paise===null?'—':`₹${(payment.buyer_fee_paise/100).toLocaleString('en-IN')}`} · {new Date(payment.created_at).toLocaleString()}</small></div></article>)}{!overview.payments.length&&<p className="empty-state">No payment transactions.</p>}</section>}
      {overview && <section className="admin-ad-section"><div className="panel-heading"><div><p className="eyebrow">ADMIN AUDIT LOG</p><h2>Recent sensitive changes</h2></div></div>{overview.auditLog.map(event=><article className="admin-ad-row" key={event.id}><div><b>{event.action.replaceAll('_',' ')}</b><p>{event.target_type} · {event.target_id}{event.reason?` · ${event.reason}`:''}</p><small>By {event.actor_id??'system'} · {new Date(event.created_at).toLocaleString()}</small></div></article>)}{!overview.auditLog.length&&<p className="empty-state">No moderation or advertisement review changes recorded yet.</p>}</section>}
      {overview && <section className="admin-ad-section">
        <div className="panel-heading"><div><p className="eyebrow">CAMPAIGN REVIEW</p><h2>Advertisements</h2></div><Link className="text-link" href="/advertiser">Advertiser dashboard</Link></div>
        {overview.advertisementSetupError && <p className="notice" role="status">{overview.advertisementSetupError}</p>}
        {overview.advertisements.length ? overview.advertisements.map((ad) => <article className="admin-ad-row" key={ad.id}>
          <div><span className={`status status-${ad.status}`}>{ad.status}</span><h3>{ad.title}</h3><p>{ad.brand_name} · {ad.category} · ₹{Number(ad.total_price).toLocaleString('en-IN')} · Payment: {ad.payment_status}</p><small>Advertiser: {overview.users.find(account=>account.id===ad.advertiser_id)?.full_name??ad.advertiser_id} · {ad.impressions} impressions · {ad.clicks} clicks · CTR {ad.impressions?((ad.clicks/ad.impressions)*100).toFixed(2):'0.00'}%{ad.rejection_reason ? ` · Reason: ${ad.rejection_reason}` : ''}</small>{ad.image_url&&<Image src={ad.image_url} alt={`${ad.brand_name} campaign creative`} width={240} height={140} unoptimized className="admin-ad-preview"/>}</div>
          <div className="task-actions">{ad.status === 'pending' && <><button disabled={busyId === ad.id || ad.payment_status !== 'paid'} onClick={() => void review(ad,'approve')} title={ad.payment_status !== 'paid' ? 'Verified payment is required' : undefined}>Approve</button><button disabled={busyId === ad.id} onClick={() => void review(ad,'reject')}>Reject</button></>}{ad.status === 'approved' && <button disabled={busyId === ad.id} onClick={() => void review(ad,'pause')}>Pause</button>}{['approved','paused'].includes(ad.status) && <button disabled={busyId === ad.id} onClick={() => void review(ad,'expire')}>Expire</button>}</div>
        </article>) : !overview.advertisementSetupError && <p className="empty-state">No campaigns have been submitted.</p>}
      </section>}
    </section>
  </main>;
}
