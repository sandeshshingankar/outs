'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BookOpenCheck, MessageCircle, Send } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type LearningRequest = {
  id: string; student_id: string; title: string; topic: string; category: string; description: string;
  concepts: string | null; level: 'beginner'|'intermediate'|'advanced'; session_type: 'individual'|'group';
  budget_per_hour: number; preferred_schedule: string | null; deadline_at: string | null;
  status: 'open'|'paused'|'fulfilled'|'cancelled'; created_at: string;
};
type LearningOffer = {
  id: string; request_id: string; teacher_id: string; hourly_price: number; message: string;
  schedule_suggestion: string | null; status: 'pending'|'accepted'|'rejected'|'withdrawn'; created_at: string;
};
type Profile = { id: string; full_name: string | null; college: string | null; course: string | null };

const categories = ['Computer Science','Mathematics','Science','Languages','Business','Design','Research','Other'];

export default function LearningRequestsPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [mode, setMode] = useState<'student'|'teacher'>('student');
  const [requests, setRequests] = useState<LearningRequest[]>([]);
  const [offers, setOffers] = useState<LearningOffer[]>([]);
  const [profiles, setProfiles] = useState<Record<string,Profile>>({});
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [maxBudget, setMaxBudget] = useState('');
  const [editId, setEditId] = useState('');
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [description, setDescription] = useState('');
  const [concepts, setConcepts] = useState('');
  const [level, setLevel] = useState<'beginner'|'intermediate'|'advanced'>('beginner');
  const [sessionType, setSessionType] = useState<'individual'|'group'>('individual');
  const [budget, setBudget] = useState('');
  const [schedule, setSchedule] = useState('');
  const [deadline, setDeadline] = useState('');
  const [offerFor, setOfferFor] = useState('');
  const [offerPrice, setOfferPrice] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [offerSchedule, setOfferSchedule] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadData = useCallback(async (id: string) => {
    const { data: reqData, error: reqError } = await supabase.from('learning_requests').select('*').order('created_at',{ascending:false});
    if (reqError) { setError(`Could not load student learning requests: ${reqError.message}`); return; }
    const requestRows = (reqData ?? []) as LearningRequest[];
    setRequests(requestRows);
    const requestIds = requestRows.map((row) => row.id);
    const ownOfferQuery = supabase.from('learning_offers').select('*').eq('teacher_id', id);
    const requestOfferQuery = requestIds.length
      ? supabase.from('learning_offers').select('*').in('request_id', requestIds)
      : Promise.resolve({ data: [], error: null });
    const [ownOffers, requestOffers] = await Promise.all([ownOfferQuery, requestOfferQuery]);
    if (ownOffers.error || requestOffers.error) { setError(`Could not load learning offers: ${ownOffers.error?.message ?? requestOffers.error?.message}`); return; }
    const allOffers = [...(ownOffers.data ?? []), ...(requestOffers.data ?? [])] as LearningOffer[];
    const byId = new Map(allOffers.map((offer) => [offer.id, offer]));
    const offerRows = [...byId.values()];
    setOffers(offerRows);
    const people = [...new Set([...requestRows.map((r) => r.student_id), ...offerRows.map((o) => o.teacher_id)])];
    if (people.length) {
      const { data: profileRows, error: profileError } = await supabase.from('profiles').select('id,full_name,college,course').in('id',people);
      if (profileError) setError(`Could not load member details: ${profileError.message}`);
      else setProfiles(Object.fromEntries((profileRows ?? []).map((p) => [p.id,p as Profile])));
    }
  },[supabase]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { router.replace('/auth?mode=login&next=%2Flearn%2Frequests'); return; }
      const { data: profile, error: profileError } = await supabase.from('profiles').select('active_mode').eq('id',user.id).single();
      if (!active) return;
      if (profileError) setError(`Could not load your marketplace mode: ${profileError.message}`);
      setUserId(user.id); setMode(profile?.active_mode === 'teacher' ? 'teacher' : 'student');
      await loadData(user.id);
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  },[loadData,router,supabase]);

  function resetForm() {
    setEditId(''); setTitle(''); setTopic(''); setCategory(categories[0]); setDescription(''); setConcepts('');
    setLevel('beginner'); setSessionType('individual'); setBudget(''); setSchedule(''); setDeadline('');
  }

  function editRequest(row: LearningRequest) {
    setEditId(row.id); setTitle(row.title); setTopic(row.topic); setCategory(row.category); setDescription(row.description);
    setConcepts(row.concepts ?? ''); setLevel(row.level); setSessionType(row.session_type); setBudget(String(row.budget_per_hour));
    setSchedule(row.preferred_schedule ?? ''); setDeadline(row.deadline_at ? new Date(row.deadline_at).toISOString().slice(0,16) : '');
    window.scrollTo({top:0,behavior:'smooth'});
  }

  async function saveRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || mode !== 'student') return;
    const hourlyBudget = Number(budget);
    if (title.trim().length<5 || topic.trim().length<2 || description.trim().length<10 || !Number.isFinite(hourlyBudget) || hourlyBudget<=0) {
      setError('Enter a request title, topic, clear learning goals, and a positive hourly budget.'); return;
    }
    setBusy(true); setError(''); setNotice('');
    const values = { title:title.trim(),topic:topic.trim(),category,description:description.trim(),concepts:concepts.trim()||null,level,session_type:sessionType,budget_per_hour:hourlyBudget,preferred_schedule:schedule.trim()||null,deadline_at:deadline?new Date(deadline).toISOString():null,updated_at:new Date().toISOString() };
    const result = editId
      ? await supabase.from('learning_requests').update(values).eq('id',editId).eq('student_id',userId)
      : await supabase.from('learning_requests').insert({...values,student_id:userId,status:'open'});
    if (result.error) setError(`Could not save your learning request: ${result.error.message}`);
    else { setNotice(editId?'Learning request updated.':'Learning request posted. Teachers can now send you offers.'); resetForm(); await loadData(userId); }
    setBusy(false);
  }

  async function removeRequest(row: LearningRequest) {
    if (!window.confirm(`Delete your request “${row.title}”? Existing offers and chats are retained only while the request exists.`)) return;
    setBusy(true); setError('');
    const { error: deleteError } = await supabase.from('learning_requests').delete().eq('id',row.id).eq('student_id',userId);
    if (deleteError) setError(`Could not delete request: ${deleteError.message}`); else await loadData(userId);
    setBusy(false);
  }

  async function sendOffer(event: FormEvent<HTMLFormElement>, request: LearningRequest) {
    event.preventDefault();
    const amount=Number(offerPrice);
    if (!Number.isFinite(amount)||amount<=0||offerMessage.trim().length<10) { setError('Enter a positive hourly offer and a message of at least 10 characters.'); return; }
    setBusy(true); setError(''); setNotice('');
    const { error: offerError } = await supabase.from('learning_offers').insert({request_id:request.id,teacher_id:userId,hourly_price:amount,message:offerMessage.trim(),schedule_suggestion:offerSchedule.trim()||null});
    if (offerError) setError(`Could not send the teaching offer: ${offerError.message}`);
    else { setNotice('Offer sent to the student. You can continue the discussion in private messages.'); setOfferFor(''); setOfferPrice(''); setOfferMessage(''); setOfferSchedule(''); await loadData(userId); }
    setBusy(false);
  }

  async function decideOffer(offer: LearningOffer,status:'accepted'|'rejected'|'withdrawn') {
    setBusy(true); setError('');
    const { error: decisionError } = await supabase.rpc('decide_learning_offer',{p_offer_id:offer.id,p_status:status});
    if (decisionError) setError(`Could not ${status} this offer: ${decisionError.message}`);
    else { setNotice(status==='accepted'?'Offer accepted. The request is now marked fulfilled.':status==='rejected'?'Offer declined.':'Offer withdrawn.'); await loadData(userId); }
    setBusy(false);
  }

  const visibleRequests = requests.filter((row) => (mode==='teacher' ? row.status==='open' && row.student_id!==userId : row.student_id===userId || row.status==='open')
    && (!categoryFilter||row.category===categoryFilter) && (!levelFilter||row.level===levelFilter)
    && (!maxBudget||Number(row.budget_per_hour)<=Number(maxBudget))
    && `${row.title} ${row.topic} ${row.category} ${row.description} ${row.concepts??''}`.toLowerCase().includes(search.trim().toLowerCase()));

  return <main className="form-page learning-requests-page">
    <Link href="/learn" className="back-link"><ArrowLeft size={16}/> Peer learning</Link>
    <header className="list-heading"><p className="eyebrow"><BookOpenCheck size={14}/> TWO-WAY PEER LEARNING</p><h1>Learn Requests</h1><p className="muted">Students describe what they want to learn. Teachers respond with a price and schedule offer.</p><div className="mode-switch"><span>Current mode: <b>{mode}</b></span><Link href="/dashboard">Change mode in dashboard</Link></div></header>
    {error&&<p className="notice account-error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
    {mode==='student'&&<section className="form-card learning-request-form"><h2>{editId?'Edit your learning request':'Post what you want to learn'}</h2><form className="task-form" onSubmit={saveRequest}>
      <label>Request title<input required minLength={5} maxLength={140} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Help me understand object-oriented programming"/></label>
      <div className="form-two"><label>Topic or skill<input required maxLength={120} value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Python programming"/></label><label>Subject/category<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(item=><option key={item}>{item}</option>)}</select></label></div>
      <label>What are you finding difficult?<textarea required minLength={10} maxLength={3000} rows={3} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe the help you need."/></label>
      <label>Specific concepts (optional)<textarea maxLength={2000} rows={2} value={concepts} onChange={e=>setConcepts(e.target.value)} placeholder="Classes, inheritance, polymorphism…"/></label>
      <div className="form-two"><label>Current level<select value={level} onChange={e=>setLevel(e.target.value as typeof level)}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label><label>Teaching mode<select value={sessionType} onChange={e=>setSessionType(e.target.value as typeof sessionType)}><option value="individual">Individual</option><option value="group">Group</option></select></label></div>
      <div className="form-two"><label>Budget per hour (₹)<input type="number" min="1" step="1" required value={budget} onChange={e=>setBudget(e.target.value)} placeholder="50"/></label><label>Preferred schedule<input maxLength={500} value={schedule} onChange={e=>setSchedule(e.target.value)} placeholder="Weekday evenings"/></label></div>
      <label>Optional deadline<input type="datetime-local" value={deadline} onChange={e=>setDeadline(e.target.value)}/></label>
      <div className="account-actions"><button className="btn btn-dark" disabled={busy}>{busy?'Saving…':editId?'Save changes':'Post learning request'}</button>{editId&&<button className="btn btn-light" type="button" onClick={resetForm}>Cancel edit</button>}</div>
    </form></section>}
    <div className="learning-request-filters"><label className="search-box wide"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search topic, title or concepts"/></label><label>Category<select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="">All categories</option>{categories.map(item=><option key={item}>{item}</option>)}</select></label><label>Level<select value={levelFilter} onChange={e=>setLevelFilter(e.target.value)}><option value="">All levels</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label><label>Max budget/hour<input type="number" min="0" value={maxBudget} onChange={e=>setMaxBudget(e.target.value)} placeholder="Any"/></label></div>
    <h2 className="section-title">{mode==='teacher'?'Student learning requests':'Student requests and your offers'}</h2>
    {loading?<p className="empty-state">Loading learning requests…</p>:<div className="learning-request-list">{visibleRequests.map(row=>{
      const own=row.student_id===userId; const profile=profiles[row.student_id]; const rowOffers=offers.filter(offer=>offer.request_id===row.id);
      const ownOffer=rowOffers.find(offer=>offer.teacher_id===userId);
      return <article className="learning-request-card" key={row.id}><div className="learning-request-card-head"><div><span className={`status status-${row.status}`}>{row.status}</span><span className="status">{row.level}</span><h3>{row.title}</h3><small>{row.topic} · {row.category} · {row.session_type} · ₹{Number(row.budget_per_hour).toLocaleString('en-IN')}/hour</small></div><b>{profile?.full_name||'OUTS student'}</b></div><p>{row.description}</p>{row.concepts&&<p><b>Concepts:</b> {row.concepts}</p>}<div className="learning-request-meta"><span>{profile?.college||'College not provided'}{profile?.course?` · ${profile.course}`:''}</span>{row.preferred_schedule&&<span>Schedule: {row.preferred_schedule}</span>}{row.deadline_at&&<span>By {new Date(row.deadline_at).toLocaleString()}</span>}</div>
        {own&&row.status==='open'&&<div className="service-actions"><button type="button" onClick={()=>editRequest(row)}>Edit request</button><button type="button" disabled={busy} onClick={()=>void removeRequest(row)}>Delete request</button></div>}
        {own&&rowOffers.length>0&&<section className="learning-offers"><h4>Teacher offers</h4>{rowOffers.map(offer=><div className="learning-offer" key={offer.id}><div><b>{profiles[offer.teacher_id]?.full_name||'OUTS teacher'}</b><small>{profiles[offer.teacher_id]?.college||'Student educator'} · ₹{Number(offer.hourly_price).toLocaleString('en-IN')}/hour · {offer.status}</small><p>{offer.message}</p>{offer.schedule_suggestion&&<small>Suggested schedule: {offer.schedule_suggestion}</small>}</div><div className="task-actions">{offer.teacher_id!==userId&&<Link className="btn btn-light" href={`/messages?with=${offer.teacher_id}&request=${row.id}`}><MessageCircle size={14}/> Message</Link>}{offer.status==='pending'&&<><button type="button" disabled={busy||row.status!=='open'} onClick={()=>void decideOffer(offer,'accepted')}>Accept offer</button><button type="button" disabled={busy} onClick={()=>void decideOffer(offer,'rejected')}>Decline</button></>}</div></div>)}</section>}
        {mode==='teacher'&&<div className="learning-request-offer-actions">{ownOffer?<div className="task-actions"><p className="muted">Your offer: ₹{Number(ownOffer.hourly_price).toLocaleString('en-IN')}/hour · {ownOffer.status}</p><Link href={`/messages?with=${row.student_id}&request=${row.id}`}>Open chat</Link>{ownOffer.status==='pending'&&<button type="button" disabled={busy} onClick={()=>void decideOffer(ownOffer,'withdrawn')}>Withdraw offer</button>}</div>:offerFor===row.id?<form className="task-form offer-form" onSubmit={e=>void sendOffer(e,row)}><label>Your hourly price (₹)<input type="number" min="1" step="1" required value={offerPrice} onChange={e=>setOfferPrice(e.target.value)}/></label><label>Offer message<textarea minLength={10} maxLength={1500} required value={offerMessage} onChange={e=>setOfferMessage(e.target.value)} placeholder="Explain how you can help with the topic."/></label><label>Suggested schedule<input maxLength={500} value={offerSchedule} onChange={e=>setOfferSchedule(e.target.value)} placeholder="Weekday evenings"/></label><button className="btn btn-dark" disabled={busy}><Send size={14}/> Send offer</button><button type="button" className="btn btn-light" onClick={()=>setOfferFor('')}>Cancel</button></form>:<button type="button" className="btn btn-dark" disabled={busy} onClick={()=>{setOfferFor(row.id);setOfferPrice(String(row.budget_per_hour));}}>Send a teaching offer</button>}</div>}
      </article>;
    })}{!visibleRequests.length&&<p className="empty-state">No matching learning requests.</p>}</div>}
  </main>;
}
