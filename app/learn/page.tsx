'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, GraduationCap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import SponsoredAds from '@/components/sponsored-ads';

type LearningService = {
  id: string;
  provider_id: string;
  title: string;
  skill: string;
  price: number;
  description: string;
  session_type: 'individual' | 'group';
  status: 'active' | 'paused' | 'archived';
  created_at: string;
};
type SessionRequest = { id: string; service_id: string; student_id: string; provider_id: string; proposed_price: number; agreed_price: number | null; scheduled_at: string | null; duration_minutes: number; note: string | null; status: 'requested' | 'accepted' | 'rejected' | 'scheduled' | 'completed' | 'cancelled' };
type TeacherProfile = { id: string; full_name: string | null; college: string | null; course: string | null; bio: string | null };

export default function Learn() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [services, setServices] = useState<LearningService[]>([]);
  const [sessionRequests, setSessionRequests] = useState<SessionRequest[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [title, setTitle] = useState('');
  const [skill, setSkill] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [sessionType, setSessionType] = useState<'individual' | 'group'>('individual');
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [mode, setMode] = useState<'student' | 'teacher'>('student');
  const [teachers, setTeachers] = useState<Record<string, TeacherProfile>>({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError) setError(`Could not check your sign-in: ${authError.message}`);
      setUser(authData.user);
      if (authData.user) {
        const { data: profile, error: profileError } = await supabase.from('profiles')
          .select('active_mode').eq('id', authData.user.id).maybeSingle();
        if (profileError) setError(`Could not load your account mode: ${profileError.message}`);
        else setMode(profile?.active_mode === 'teacher' ? 'teacher' : 'student');
      }
      const { data, error: serviceError } = await supabase.from('learning_services')
        .select('id,provider_id,title,skill,price,description,session_type,status,created_at')
        .order('created_at', { ascending: false });
      if (!active) return;
      if (serviceError) setError(`Could not load peer sessions: ${serviceError.message}`);
      else {
        const serviceRows = (data ?? []) as LearningService[];
        setServices(serviceRows);
        const providerIds = [...new Set(serviceRows.map((service) => service.provider_id))];
        if (providerIds.length) {
          const { data: profiles, error: teacherError } = await supabase.from('profiles')
            .select('id,full_name,college,course,bio').in('id', providerIds);
          if (!active) return;
          if (teacherError) setError(`Could not load teacher profiles: ${teacherError.message}`);
          else setTeachers(Object.fromEntries((profiles ?? []).map((teacher) => [teacher.id, teacher as TeacherProfile])));
        }
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [supabase]);

  useEffect(() => {
    if (!user) return;
    const column = mode === 'teacher' ? 'provider_id' : 'student_id';
    void (async () => {
      const { data, error: requestError } = await supabase.from('teaching_session_requests').select('*')
        .eq(column, user.id).order('created_at', { ascending: false });
      if (requestError) setError(`Could not load teaching requests: ${requestError.message}`);
      else setSessionRequests((data ?? []) as SessionRequest[]);
    })();
  }, [mode, supabase, user]);

  async function saveService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      router.push('/auth');
      return;
    }
    if (title.trim().length < 5 || !skill.trim() || !Number.isFinite(Number(price)) || Number(price) <= 0) {
      setError('Enter a title of at least five characters, a skill, and a valid non-negative hourly rate.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    const values = {
      title: title.trim(),
      skill: skill.trim(),
      price: Number(price),
      description: description.trim(),
      session_type: sessionType,
      status: editing ? services.find((service) => service.id === editing)?.status ?? 'active' : 'active' as const,
      provider_id: user.id,
    };
    const result = editing
      ? await supabase.from('learning_services').update(values).eq('id', editing).eq('provider_id', user.id)
      : await supabase.from('learning_services').insert(values);
    if (result.error) {
      setError(`Could not ${editing ? 'save' : 'publish'} your service: ${result.error.message}`);
      setBusy(false);
      return;
    }
    const { data, error: reloadError } = await supabase.from('learning_services')
      .select('id,provider_id,title,skill,price,description,session_type,status,created_at')
      .order('created_at', { ascending: false });
    if (reloadError) setError(`Your service was published, but the list could not be refreshed: ${reloadError.message}`);
    else {
      setServices((data ?? []) as LearningService[]);
      setNotice(editing ? 'Your learning service has been updated.' : 'Your learning service is published.');
    }
    setTitle('');
    setSkill('');
    setPrice('');
    setDescription('');
    setEditing(null);
    setBusy(false);
  }

  async function changeStatus(service: LearningService, status: LearningService['status']) {
    setBusy(true);
    setError('');
    const { error: updateError } = await supabase.from('learning_services')
      .update({ status }).eq('id', service.id).eq('provider_id', user?.id);
    if (updateError) {
      setError(`Could not update service status: ${updateError.message}`);
      setBusy(false);
      return;
    }
    setServices((current) => current.map((item) => item.id === service.id ? { ...item, status } : item));
    setBusy(false);
  }

  async function requestSession(service: LearningService) {
    if (!user || user.id === service.provider_id) return;
    setBusy(true); setError(''); setNotice('');
    const { error: requestError } = await supabase.from('teaching_session_requests').insert({
      service_id: service.id, student_id: user.id, provider_id: service.provider_id,
      proposed_price: service.price, duration_minutes: 60,
    });
    if (requestError) setError(`Could not request a session: ${requestError.message}`);
    else setNotice('Session request sent. Use messages to negotiate any price changes.');
    setBusy(false);
  }

  async function updateSessionRequest(request: SessionRequest, status: SessionRequest['status']) {
    let scheduledAt: string | null = null;
    let agreedPrice = Number(request.agreed_price ?? request.proposed_price);
    if (status === 'scheduled') {
      const amount = window.prompt('Enter the negotiated hourly rate (₹):', String(agreedPrice));
      if (amount === null) return;
      agreedPrice = Number(amount);
      if (!Number.isFinite(agreedPrice) || agreedPrice <= 0) { setError('Enter a valid agreed rate.'); return; }
      const entered = window.prompt('Enter the session date and time (for example 2026-11-15T14:00):');
      if (!entered) return;
      const parsed = new Date(entered);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) { setError('Choose a valid future date and time.'); return; }
      scheduledAt = parsed.toISOString();
    }
    setBusy(true); setError('');
    const { error: updateError } = await supabase.rpc('transition_session_request', {
      p_request_id: request.id, p_next_status: status,
      p_agreed_price: agreedPrice, p_scheduled_at: scheduledAt,
    });
    if (updateError) setError(`Could not update session request: ${updateError.message}`);
    else {
      setSessionRequests((current) => current.map((item) => item.id === request.id
        ? { ...item, status, agreed_price: agreedPrice, scheduled_at: scheduledAt ?? item.scheduled_at } : item));
      setNotice(`Session request ${status}.`);
    }
    setBusy(false);
  }

  async function deleteService(service: LearningService) {
    if (!window.confirm(`Permanently delete "${service.title}"?`)) return;
    setBusy(true);
    setError('');
    const { error: deleteError } = await supabase.from('learning_services')
      .delete().eq('id', service.id).eq('provider_id', user?.id);
    if (deleteError) setError(`Could not delete service: ${deleteError.message}`);
    else setServices((current) => current.filter((item) => item.id !== service.id));
    setBusy(false);
  }

  function editService(service: LearningService) {
    setEditing(service.id);
    setTitle(service.title);
    setSkill(service.skill);
    setPrice(String(service.price));
    setDescription(service.description);
    setSessionType(service.session_type);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const filteredServices = services.filter((service) =>
    (maxPrice === '' || Number(service.price) <= Number(maxPrice))
    && `${service.title} ${service.skill} ${service.description} ${teachers[service.provider_id]?.full_name ?? ''} ${teachers[service.provider_id]?.college ?? ''}`
      .toLowerCase().includes(query.trim().toLowerCase()),
  );
  const ownServices = services.filter((service) => service.provider_id === user?.id);
  const visibleServices = mode === 'teacher' ? ownServices : filteredServices.filter((service) => service.status === 'active');

  return (
    <main className="form-page">
      <Link href="/dashboard" className="back-link"><ArrowLeft size={16} /> Dashboard</Link>
      <div className="list-heading">
        <p className="eyebrow">PEER LEARNING</p>
        <h1>Learn from your classmates</h1>
        <p className="muted">Offer tutoring or find a peer who can help you learn a skill.</p>
        <div className="mode-switch"><span>Current mode: <b>{mode === 'teacher' ? 'Teacher' : 'Student'}</b></span><Link href="/dashboard">Change mode in dashboard</Link></div>
        <Link className="btn btn-light" href="/learn/requests">Learn Requests — post what you want to learn or send a teaching offer</Link>
      </div>
      {mode === 'teacher' && <section className="form-card compact">
        <h2>{editing ? 'Edit learning service' : 'Offer a learning session'}</h2>
        <form className="task-form" onSubmit={saveService}>
          <label>Session title<input required maxLength={140} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Python basics for beginners" /></label>
          <label>Skill<input required maxLength={100} value={skill} onChange={(event) => setSkill(event.target.value)} placeholder="Python" /></label>
          <label>Description<textarea required minLength={10} maxLength={3000} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What will students learn?" /></label>
          <div className="form-two">
            <label>Price per hour (₹)<input type="number" min="1" step="1" required value={price} onChange={(event) => setPrice(event.target.value)} placeholder="200" /></label>
            <label>Session type<select value={sessionType} onChange={(event) => setSessionType(event.target.value as 'individual' | 'group')}><option value="individual">Individual</option><option value="group">Group</option></select></label>
          </div>
          <button className="btn btn-dark" disabled={busy || loading}>{busy ? 'Publishing…' : 'Publish service'}</button>
          {editing && <button className="btn btn-light" type="button" onClick={() => { setEditing(null); setTitle(''); setSkill(''); setPrice(''); setDescription(''); }}>Cancel edit</button>}
        </form>
      </section>}
      {error && <p className="notice account-error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      <SponsoredAds />
      {mode === 'student' && <div className="learning-search"><label className="search-box wide"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search teachers by skill or topic" aria-label="Search teachers by skill or topic" /></label><label className="filter-field">Maximum hourly price<input type="number" min="0" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="Any price" /></label></div>}
      {sessionRequests.length > 0 && <section className="panel session-requests"><h2>{mode === 'teacher' ? 'Incoming session requests' : 'Your session requests'}</h2>{sessionRequests.map((request) => {
        const service = services.find((item) => item.id === request.service_id);
        return <article className="application-row" key={request.id}><div><b>{service?.title ?? 'Peer session'}</b><small>{request.status} · ₹{Number(request.agreed_price ?? request.proposed_price).toLocaleString('en-IN')} · {request.duration_minutes} min{request.scheduled_at ? ` · ${new Date(request.scheduled_at).toLocaleString()}` : ''}</small>{request.note && <p>{request.note}</p>}</div><div className="task-actions">{mode === 'teacher' && <Link className="btn btn-light" href={`/messages?with=${request.student_id}&service=${request.service_id}`}>Message student</Link>}{mode === 'teacher' && request.status === 'requested' && <><button type="button" disabled={busy} onClick={() => void updateSessionRequest(request,'accepted')}>Accept</button><button type="button" disabled={busy} onClick={() => void updateSessionRequest(request,'rejected')}>Reject</button></>}{mode === 'teacher' && request.status === 'accepted' && <button type="button" disabled={busy} onClick={() => void updateSessionRequest(request,'scheduled')}>Schedule</button>}{mode === 'teacher' && request.status === 'scheduled' && <button type="button" disabled={busy} onClick={() => void updateSessionRequest(request,'completed')}>Mark completed</button>}{mode === 'student' && ['requested','accepted','scheduled'].includes(request.status) && <button type="button" disabled={busy} onClick={() => void updateSessionRequest(request,'cancelled')}>Cancel</button>}</div></article>;
      })}</section>}
      <h2 className="section-title">{mode === 'teacher' ? 'Your teaching services' : 'Available peer sessions'}</h2>
      <div className="market-grid">
        {loading ? <p className="empty-state">Loading peer sessions…</p> : visibleServices.map((service) => (
          <article className="task-card" key={service.id}>
            <span className="task-category"><GraduationCap size={13} /> {service.skill}</span>
            <h3>{service.title}</h3>
            <p>{service.description}</p>
            {mode === 'student' && <div className="teacher-summary"><b>{teachers[service.provider_id]?.full_name || 'OUTS teacher'}</b><small>{[teachers[service.provider_id]?.course, teachers[service.provider_id]?.college].filter(Boolean).join(' · ') || 'Student educator'}</small>{teachers[service.provider_id]?.bio && <p>{teachers[service.provider_id].bio}</p>}</div>}
            <div className="market-foot"><b>₹{Number(service.price).toLocaleString('en-IN')} / hour</b><span>{service.session_type}</span></div>
            {mode === 'teacher' ? <div className="service-actions">
              <span className={`status status-${service.status}`}>{service.status}</span>
              <button type="button" disabled={busy} onClick={() => editService(service)}>Edit</button>
              {service.status === 'active'
                ? <button type="button" disabled={busy} onClick={() => changeStatus(service, 'paused')}>Pause</button>
                : service.status === 'paused'
                  ? <button type="button" disabled={busy} onClick={() => changeStatus(service, 'active')}>Activate</button>
                  : null}
              {service.status !== 'archived' && <button type="button" disabled={busy} onClick={() => changeStatus(service, 'archived')}>Archive</button>}
              <button type="button" disabled={busy} onClick={() => deleteService(service)}>Delete</button>
            </div>             : <div className="service-actions"><Link className="btn btn-dark service-contact" href={`/messages?with=${service.provider_id}&service=${service.id}`}>Contact teacher</Link><button type="button" disabled={busy || sessionRequests.some((request) => request.service_id === service.id && !['rejected','cancelled','completed'].includes(request.status))} onClick={() => void requestSession(service)}>Request a session</button></div>}
          </article>
        ))}
        {!loading && !visibleServices.length && <div className="empty-state">{mode === 'teacher' ? 'You have not published a service yet.' : 'No matching active services found.'}</div>}
      </div>
    </main>
  );
}
