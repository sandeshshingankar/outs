'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Listing = { id: string; title: string; category: string; listing_type: string; college: string; status: string; moderation_reason: string | null; created_at: string };
type Report = { id: string; listing_id: string; reporter_id: string; reason: string; details: string | null; status: string; resolution: string | null; created_at: string; reuse_listings: { title: string } | null };
type Event = { id: number; listing_id: string; admin_id: string; action: string; reason: string | null; created_at: string };
type Data = { listings: Listing[]; reports: Report[]; events: Event[] };

export default function AdminReusePanel() {
  const [data, setData] = useState<Data | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    try {
      const response = await fetch('/api/admin/reuse', { cache: 'no-store' });
      const result = await response.json() as Data | { error?: string };
      if (!response.ok) setMessage('error' in result ? result.error ?? 'Reuse moderation data could not be loaded.' : 'Reuse moderation data could not be loaded.');
      else { setData(result as Data); setMessage(''); }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Reuse moderation data could not be loaded.');
    }
  }

  useEffect(() => { void load(); }, []);

  async function act(type: 'listing' | 'report', id: string, action: string) {
    const reason = action === 'reject' || action === 'suspend' || action === 'resolved' || action === 'dismissed'
      ? window.prompt('Add a short moderation note:') : null;
    if (reason === null && ['reject', 'suspend', 'resolved', 'dismissed'].includes(action)) return;
    setBusy(id);
    try {
      const response = await fetch('/api/admin/reuse', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, id, action, reason }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) setMessage(result.error ?? 'Moderation action failed.');
      else { setMessage('Moderation action recorded.'); await load(); }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Moderation action failed.');
    } finally { setBusy(''); }
  }

  return <section className="admin-ad-section">
    <div className="panel-heading"><div><p className="eyebrow">OUTS REUSE</p><h2>Reuse moderation</h2></div><Link className="text-link" href="/reuse">Open Reuse</Link></div>
    {message && <p className="muted" role="status">{message}</p>}
    {data && <>
      <h3>Listings</h3>
      {data.listings.map(item => <article className="admin-ad-row" key={item.id}>
        <div><span className={`status status-${item.status}`}>{item.status.replaceAll('_', ' ')}</span><h3>{item.title}</h3>
          <p>{item.college} · {item.category} · {item.listing_type}</p>
          {item.moderation_reason && <small>{item.moderation_reason}</small>}
          <small>{new Date(item.created_at).toLocaleString()}</small>
        </div><div className="task-actions">
          {item.status === 'pending_approval' && <><button disabled={busy === item.id} onClick={() => void act('listing', item.id, 'approve')}>Approve</button><button disabled={busy === item.id} onClick={() => void act('listing', item.id, 'reject')}>Reject</button></>}
          {item.status === 'published' && <button disabled={busy === item.id} onClick={() => void act('listing', item.id, 'suspend')}>Suspend</button>}
          {item.status === 'suspended' && <button disabled={busy === item.id} onClick={() => void act('listing', item.id, 'restore')}>Restore</button>}
          <Link href={`/reuse/${item.id}`}>View</Link>
        </div>
      </article>)}
      {!data.listings.length && <p className="empty-state">No Reuse listings.</p>}
      <h3>Reports</h3>
      {data.reports.map(report => <article className="admin-ad-row" key={report.id}>
        <div><span className={`status status-${report.status}`}>{report.status}</span><h3>{report.reason} · {report.reuse_listings?.title ?? 'Listing'}</h3>
          <p>{report.details || 'No details provided.'}</p><small>Reporter {report.reporter_id} · {new Date(report.created_at).toLocaleString()}</small>
          {report.resolution && <p>Resolution: {report.resolution}</p>}
        </div><div className="task-actions">
          {report.status === 'open' && <button disabled={busy === report.id} onClick={() => void act('report', report.id, 'reviewed')}>Mark reviewed</button>}
          {['open', 'reviewed'].includes(report.status) && <><button disabled={busy === report.id} onClick={() => void act('report', report.id, 'resolved')}>Resolve</button><button disabled={busy === report.id} onClick={() => void act('report', report.id, 'dismissed')}>Dismiss</button></>}
          <Link href={`/reuse/${report.listing_id}`}>View listing</Link>
        </div>
      </article>)}
      {!data.reports.length && <p className="empty-state">No listing reports.</p>}
      <h3>Recent review history</h3>
      {data.events.map(event => <article className="admin-ad-row" key={event.id}><div>
        <b>{event.action} · listing {event.listing_id.slice(0, 8)}</b><p>{event.reason || 'No note'}</p><small>{new Date(event.created_at).toLocaleString()} · admin {event.admin_id}</small>
      </div></article>)}
    </>}
  </section>;
}
