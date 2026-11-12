'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type PartnerCategory = { id: string; name: string; slug: string; description: string };
type ProfileEligibility = {
  is_verified: boolean;
  age_verified: boolean;
  partner_consent: boolean;
  student_verification_status: string;
};

export default function NewPartnerRequest() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [categories, setCategories] = useState<PartnerCategory[]>([]);
  const [profile, setProfile] = useState<ProfileEligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [activityDate, setActivityDate] = useState('');
  const [startTime, setStartTime] = useState('18:00');
  const [durationMinutes, setDurationMinutes] = useState('120');
  const [city, setCity] = useState('');
  const [meetingLocation, setMeetingLocation] = useState('');
  const [participantsNeeded, setParticipantsNeeded] = useState('2');
  const [budget, setBudget] = useState('1000');
  const [preferredGender, setPreferredGender] = useState('any');
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !user) {
        router.replace('/auth?mode=login&next=%2Fpartner%2Fnew');
        return;
      }
      const [categoryResult, profileResult] = await Promise.all([
        supabase.from('partner_categories').select('id,name,description,slug').eq('is_active', true).order('sort_order', { ascending: true }),
        supabase.from('profiles').select('is_verified,age_verified,partner_consent,student_verification_status').eq('id', user.id).single(),
      ]);
      if (!active) return;
      if (categoryResult.error) {
        setError(`Could not load partner categories: ${categoryResult.error.message}`);
      } else {
        setCategories((categoryResult.data ?? []) as PartnerCategory[]);
      }
      if (profileResult.error) setError(`Could not load your eligibility: ${profileResult.error.message}`);
      else setProfile((profileResult.data ?? null) as ProfileEligibility | null);
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [router, supabase]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) {
      setError('Your eligibility details are still loading.');
      return;
    }
    if (!categoryId) {
      setError('Select an activity category before creating your request.');
      return;
    }
    if (!categories.some((category) => category.id === categoryId)) {
      setError('The selected activity category is no longer available. Please select another category.');
      return;
    }
    const isEligible = profile.is_verified && profile.age_verified && profile.student_verification_status === 'verified' && profile.partner_consent;
    if (!isEligible) {
      setError('Only verified 18+ college students who accepted the partner policy can create a partner request.');
      return;
    }
    if (!consent) {
      setError('Please confirm that this is a legal, consensual, paid student activity request with public meeting guidelines.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !currentUser) {
      setError('Your session expired. Please sign in again to create a partner request.');
      setBusy(false);
      return;
    }
    const { data, error: insertError } = await supabase.from('partner_requests').insert({
      requester_id: currentUser.id,
      partner_category_id: categoryId,
      title: title.trim(),
      description: description.trim(),
      activity_date: activityDate,
      start_time: startTime,
      duration_minutes: Number(durationMinutes),
      city: city.trim(),
      meeting_location: meetingLocation.trim(),
      participants_needed: Number(participantsNeeded),
      budget: Number(budget),
      preferred_gender: preferredGender,
      additional_instructions: additionalInstructions.trim(),
      safety_notes: 'Meet in public places and never share exact live location.',
      consent_acknowledged: true,
      status: 'open',
    }).select('id').single();
    if (insertError) {
      setError(`Could not create the partner request: ${insertError.message}`);
      setBusy(false);
      return;
    }
    setNotice('Your request is live. Another verified student can now submit an offer.');
    router.push(`/partner/${data.id}`);
    setBusy(false);
  }

  if (loading) return <main className="app-loading">Loading partner eligibility…</main>;

  return (
    <main className="form-page">
      <Link href="/partner" className="back-link"><ArrowLeft size={16} /> Back to OUTS Partner</Link>
      <section className="form-card partner-form-card">
        <div className="auth-icon"><ShieldCheck /></div>
        <p className="eyebrow">CREATE PARTNER REQUEST</p>
        <h1>Plan a safe paid activity</h1>
        <p className="muted">This is a legal, consensual, paid student activity-partner service for verified college users aged 18+.</p>
        {error && <p className="notice account-error" role="alert">{error}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}

        <form className="form-grid" onSubmit={submit}>
          <label>Activity title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ganpati Darshan Partner" required /></label>
          <label>Category<select value={categoryId} onChange={(event) => {
            setCategoryId(event.target.value);
            if (error) setError('');
          }} required aria-describedby="category-help">
            <option value="" disabled>Select an activity category</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select><span id="category-help" className="field-help">Choose the activity type for this request.</span></label>

          <label className="full-width">Activity description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the plan, what you want to do, and any important details for a suitable partner." rows={5} required /></label>

          <label>Date<input type="date" value={activityDate} onChange={(event) => setActivityDate(event.target.value)} required /></label>
          <label>Start time<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></label>
          <label>Expected duration (minutes)<input type="number" min={30} max={600} value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} required /></label>
          <label>City<input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Pune" required /></label>
          <label>Public meeting location<input value={meetingLocation} onChange={(event) => setMeetingLocation(event.target.value)} placeholder="Cafe entrance, station gate, campus gate" required /></label>
          <label>Participants needed<input type="number" min={1} max={20} value={participantsNeeded} onChange={(event) => setParticipantsNeeded(event.target.value)} required /></label>
          <label>Budget (₹)<input type="number" min={0} step={50} value={budget} onChange={(event) => setBudget(event.target.value)} required /></label>
          <label>Preferred gender<select value={preferredGender} onChange={(event) => setPreferredGender(event.target.value)}>
            <option value="any">Any</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="non_binary">Non-binary</option>
            <option value="other">Other / prefer not to say</option>
          </select></label>

          <label className="full-width">Additional instructions<textarea value={additionalInstructions} onChange={(event) => setAdditionalInstructions(event.target.value)} placeholder="Any scheduling, dress code, transport notes, or activity-specific instructions." rows={3} /></label>

          <label className="checkbox-row full-width">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            I confirm this is a legal, consensual, paid student activity-partner request and I understand that I must meet in public places and follow all safety rules.
          </label>

          <button type="submit" className="btn btn-dark full-width" disabled={busy}>{busy ? 'Publishing request…' : 'Create request'}</button>
        </form>
      </section>
    </main>
  );
}
