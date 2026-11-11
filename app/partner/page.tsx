'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, MapPin, ShieldCheck, Sparkles, Users, WalletCards } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type PartnerCategory = {
  id: string;
  name: string;
  description: string;
  slug: string;
};

type PartnerRequest = {
  id: string;
  title: string;
  description: string;
  city: string;
  activity_date: string;
  budget: number;
  status: string;
  participants_needed: number;
  meeting_location: string;
  partner_category_id: string;
  created_at: string;
};

export default function PartnerHome() {
  const supabase = useMemo(() => createClient(), []);
  const [categories, setCategories] = useState<PartnerCategory[]>([]);
  const [requests, setRequests] = useState<PartnerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      const [categoryResult, requestsResult] = await Promise.all([
        supabase.from('partner_categories').select('id,name,description,slug').eq('is_active', true).order('sort_order', { ascending: true }),
        supabase.from('partner_requests').select('id,title,description,city,activity_date,budget,status,participants_needed,meeting_location,partner_category_id,created_at').eq('status', 'open').order('created_at', { ascending: false }).limit(8),
      ]);
      if (!active) return;
      if (categoryResult.error) setError(`Could not load partner categories: ${categoryResult.error.message}`);
      else setCategories((categoryResult.data ?? []) as PartnerCategory[]);
      if (requestsResult.error) setError(`Could not load partner requests: ${requestsResult.error.message}`);
      else setRequests((requestsResult.data ?? []) as PartnerRequest[]);
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [supabase]);

  return (
    <main className="form-page partner-page">
      <section className="partner-hero">
        <div className="partner-copy">
          <p className="eyebrow">OUTS PARTNER</p>
          <h1>Find Someone. Do More Together.</h1>
          <p className="muted">Book a verified college peer for safe, legal, paid activities when you do not want to go alone.</p>
          <div className="hero-buttons">
            <Link className="btn btn-dark" href="/partner/new">Create a request <ArrowRight size={16} /></Link>
            <Link className="btn btn-light" href="/partner#browse">Browse activities</Link>
          </div>
          <div className="partner-badges">
            <span><ShieldCheck size={14} /> Verified student-only</span>
            <span><WalletCards size={14} /> Pay only after agreement</span>
          </div>
        </div>
        <div className="partner-panel">
          <div className="mini-highlight"><Sparkles size={18} /> Safety-first marketplace</div>
          <ul>
            <li><CheckCircle2 size={16} /> 18+ verified eligibility required</li>
            <li><CheckCircle2 size={16} /> Public meeting locations only</li>
            <li><CheckCircle2 size={16} /> Clear budget, agreement, and cancellation rules</li>
          </ul>
        </div>
      </section>

      <section className="section wrap">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ACTIVITY CATEGORIES</p>
            <h2>Choose your vibe.</h2>
          </div>
        </div>
        <div className="category-grid partner-grid">
          {categories.map((category) => (
            <article className="category-card" key={category.id}>
              <div className="category-icon tone-cyan"><Users size={20} /></div>
              <div className="category-meta">
                <h3>{category.name}</h3>
                <p>{category.description || 'A safe, student-approved activity category.'}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="browse" className="section wrap">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ACTIVE REQUESTS</p>
            <h2>Popular activity requests</h2>
          </div>
          <Link className="text-link" href="/partner/new">Post your request <ArrowRight size={15} /></Link>
        </div>
        {error && <p className="notice account-error" role="alert">{error}</p>}
        {loading ? <p className="empty-state">Loading active partner requests…</p> : (
          <div className="market-grid">
            {requests.map((request) => (
              <article key={request.id} className="task-card">
                <span className="task-category">{categories.find((category) => category.id === request.partner_category_id)?.name ?? 'Partner activity'}</span>
                <h3>{request.title}</h3>
                <p>{request.description.slice(0, 120)}{request.description.length > 120 ? '…' : ''}</p>
                <div className="partner-meta">
                  <span><CalendarDays size={14} /> {new Date(request.activity_date).toLocaleDateString('en-IN')}</span>
                  <span><MapPin size={14} /> {request.city}</span>
                </div>
                <div className="market-foot">
                  <b>₹{Number(request.budget).toLocaleString('en-IN')}</b>
                  <Link href={`/partner/${request.id}`}>View request →</Link>
                </div>
              </article>
            ))}
            {!requests.length && <div className="empty-state">No active partner requests yet. Be the first to create one.</div>}
          </div>
        )}
      </section>
    </main>
  );
}
