'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, CheckCircle2, MapPin, ShieldCheck, Wallet } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

type PartnerCategory = { id: string; name: string; description: string };
type PartnerRequest = {
  id: string;
  requester_id: string;
  partner_category_id: string;
  title: string;
  description: string;
  activity_date: string;
  start_time: string;
  duration_minutes: number;
  city: string;
  meeting_location: string;
  participants_needed: number;
  budget: number;
  preferred_gender: string;
  additional_instructions: string | null;
  consent_acknowledged: boolean;
  status: string;
};
type PartnerOffer = {
  id: string;
  request_id: string;
  offerer_id: string;
  proposed_amount: number;
  note: string;
  status: string;
  created_at: string;
  offerer_name?: string;
};

export default function PartnerRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [request, setRequest] = useState<PartnerRequest | null>(null);
  const [category, setCategory] = useState<PartnerCategory | null>(null);
  const [offers, setOffers] = useState<PartnerOffer[]>([]);
  const [offerAmount, setOfferAmount] = useState('1000');
  const [offerNote, setOfferNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      setUser(currentUser);
      if (authError && !currentUser) {
        setError('Please sign in to view this partner request.');
        setLoading(false);
        return;
      }
      const requestResult = await supabase.from('partner_requests').select('*').eq('id', id).single();
      if (!active) return;
      if (requestResult.error) {
        setError(`Could not load request: ${requestResult.error.message}`);
        setLoading(false);
        return;
      }
      const requestData = requestResult.data as PartnerRequest;
      setRequest(requestData);
      const categoryResult = await supabase.from('partner_categories').select('id,name,description').eq('id', requestData.partner_category_id).maybeSingle();
      if (!active) return;
      if (categoryResult.data) setCategory(categoryResult.data as PartnerCategory);
      const offersResult = await supabase.from('partner_offers').select('*').eq('request_id', id).order('created_at', { ascending: false });
      if (!active) return;
      if (offersResult.error) {
        setError(`Could not load offers: ${offersResult.error.message}`);
      } else {
        const offersData = offersResult.data ?? [];
        if (offersData.length) {
          const profileResult = await supabase.from('profiles').select('id,full_name').in('id', [...new Set(offersData.map((offer) => offer.offerer_id))]);
          if (!active) return;
          if (profileResult.error) setError(`Could not load offer data: ${profileResult.error.message}`);
          const names = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile.full_name || 'Student']));
          setOffers((offersData as PartnerOffer[]).map((offer) => ({ ...offer, offerer_name: names.get(offer.offerer_id) ?? 'Student' })));
        }
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [id, supabase]);

  async function submitOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !request) {
      router.push('/auth?next=%2Fpartner%2Fnew');
      return;
    }
    if (request.requester_id === user.id) {
      setError('You cannot offer on your own partner request.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    const { error: offerError } = await supabase.from('partner_offers').insert({
      request_id: request.id,
      offerer_id: user.id,
      proposed_amount: Number(offerAmount),
      note: offerNote.trim() || 'I am available for this activity and can match your plans.',
      status: 'pending',
    });
    if (offerError) setError(`Could not submit your offer: ${offerError.message}`);
    else setNotice('Offer submitted. The requester can review it and accept it or negotiate.');
    setBusy(false);
  }

  async function acceptOffer(offerId: string, offererId: string, amount: number) {
    if (!request || !user || request.requester_id !== user.id) return;
    if (!window.confirm('Accept this offer and create a booking?')) return;
    setBusy(true); setError(''); setNotice('');
    const { error: updateError } = await supabase.from('partner_offers').update({ status: 'accepted' }).eq('id', offerId);
    if (updateError) {
      setError(`Could not update the offer: ${updateError.message}`);
      setBusy(false);
      return;
    }
    const { error: otherOffersError } = await supabase.from('partner_offers').update({ status: 'rejected' }).eq('request_id', request.id).neq('id', offerId);
    if (otherOffersError) {
      setError(`Offer accepted, but other offers could not be updated: ${otherOffersError.message}`);
      setBusy(false);
      return;
    }

    const { error: bookingError } = await supabase.from('partner_bookings').insert({
      request_id: request.id,
      offer_id: offerId,
      requester_id: request.requester_id,
      provider_id: offererId,
      final_price: amount,
      activity_date: request.activity_date,
      start_time: request.start_time,
      duration_minutes: request.duration_minutes,
      meeting_location: request.meeting_location,
      status: 'pending_confirmation',
      payment_status: 'pending',
      payment_provider: 'provider_abstraction',
      cancellation_policy: 'Both parties must agree on cancellation before the activity begins.',
    });
    if (bookingError) {
      setError(`Offer accepted, but the booking could not be created: ${bookingError.message}`);
      setBusy(false);
      return;
    }
    const { error: requestUpdateError } = await supabase.from('partner_requests').update({ status: 'matched' }).eq('id', request.id);
    if (requestUpdateError) setError(`Booking created, but the request could not be marked as matched: ${requestUpdateError.message}`);
    else {
      setRequest({ ...request, status: 'matched' });
      setNotice('Offer accepted and booking created. Both parties can now confirm the final agreement.');
    }
    setBusy(false);
  }

  if (loading) return <main className="app-loading">Loading partner request…</main>;
  if (!request) return <main className="app-loading">Request not found.</main>;

  const isRequester = user?.id === request.requester_id;

  return (
    <main className="form-page">
      <Link href="/partner" className="back-link"><ArrowLeft size={16} /> Back to partner list</Link>
      <article className="detail-card partner-detail-card">
        <span className="task-category">{category?.name ?? 'Partner activity'}</span>
        <h1>{request.title}</h1>
        <div className="detail-budget">₹{Number(request.budget).toLocaleString('en-IN')} <small>budget</small></div>
        <div className="partner-meta detail-meta">
          <span><CalendarDays size={14} /> {new Date(request.activity_date).toLocaleString('en-IN', { dateStyle: 'medium' })}</span>
          <span><MapPin size={14} /> {request.city}</span>
          <span><Wallet size={14} /> {request.participants_needed} participants needed</span>
        </div>
        <p className="detail-description">{request.description}</p>
        <div className="detail-grid">
          <div><b>Start time</b><p>{request.start_time}</p></div>
          <div><b>Duration</b><p>{request.duration_minutes} min</p></div>
          <div><b>Public meeting</b><p>{request.meeting_location}</p></div>
          <div><b>Preferred gender</b><p>{request.preferred_gender}</p></div>
        </div>
        {request.additional_instructions && <div className="safety-note"><ShieldCheck size={16} /> {request.additional_instructions}</div>}
        {error && <p className="notice account-error" role="alert">{error}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}

        {!isRequester && user && (
          <form className="partner-offer-form" onSubmit={submitOffer}>
            <h3>Submit an offer</h3>
            <label>Proposed amount (₹)<input type="number" min={0} step={50} value={offerAmount} onChange={(event) => setOfferAmount(event.target.value)} /></label>
            <label>Message to requester<textarea value={offerNote} onChange={(event) => setOfferNote(event.target.value)} rows={4} placeholder="I can join this activity and match your plans." /></label>
            <button type="submit" className="btn btn-dark" disabled={busy}>{busy ? 'Submitting…' : 'Send offer'}</button>
          </form>
        )}

        {isRequester && (
          <section className="partner-offer-list">
            <h3>Offers</h3>
            {offers.length ? offers.map((offer) => (
              <article key={offer.id} className="partner-offer-row">
                <div>
                  <b>{offer.offerer_name}</b>
                  <p>{offer.note}</p>
                  <small>{new Date(offer.created_at).toLocaleDateString('en-IN')} · {offer.status}</small>
                </div>
                <div className="task-actions">
                  <b>₹{Number(offer.proposed_amount).toLocaleString('en-IN')}</b>
                  {offer.status === 'pending' && (
                    <button type="button" onClick={() => void acceptOffer(offer.id, offer.offerer_id, Number(offer.proposed_amount))}>Accept offer</button>
                  )}
                </div>
              </article>
            )) : <p className="empty-state">No offers yet for this request.</p>}
          </section>
        )}

        {user && !isRequester && <div className="safety-box"><CheckCircle2 size={16} /> Safety reminder: meet in public places, keep the payment and agreement inside the platform, and do not share personal contact details.</div>}
        {!user && <p className="empty-state">Sign in to view and respond to this request.</p>}
      </article>
    </main>
  );
}
