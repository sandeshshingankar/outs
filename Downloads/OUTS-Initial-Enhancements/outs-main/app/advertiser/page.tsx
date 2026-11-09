'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Megaphone, Plus, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Campaign = {
  id: string; title: string; brand_name: string; description: string; image_path: string | null;
  destination_url: string; category: string; target_audience: string | null; starts_at: string;
  duration_days: number; total_price: number; status: string; payment_status: string;
  rejection_reason: string | null; impressions: number; clicks: number; created_at: string;
};
type CheckoutOptions = {
  key: string; amount: number; currency: string; name: string; description: string;
  order_id: string; handler: (result: { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string }) => void;
  modal?: { ondismiss: () => void };
  prefill?: { email?: string };
  theme?: { color: string };
};
declare global { interface Window { Razorpay?: new (options: CheckoutOptions) => { open: () => void } } }

async function loadRazorpayCheckout() {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Razorpay Checkout could not be loaded.'));
    document.body.appendChild(script);
  });
}

export default function AdvertiserDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [payingId, setPayingId] = useState('');
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data, error: queryError } = await supabase.from('advertisements')
        .select('id,title,brand_name,description,image_path,destination_url,category,target_audience,starts_at,duration_days,total_price,status,payment_status,rejection_reason,impressions,clicks,created_at')
        .order('created_at', { ascending: false });
      if (!live) return;
      if (queryError) setError(`Could not load campaigns: ${queryError.message}. Apply the advertisements migration first.`);
      else setCampaigns((data ?? []) as Campaign[]);
      setLoading(false);
    })();
    return () => { live = false; };
  }, [supabase]);

  const metrics = {
    total: campaigns.length,
    active: campaigns.filter((ad) => ad.status === 'approved' && ad.payment_status === 'paid' && ad.starts_at <= today && new Date(`${ad.starts_at}T00:00:00Z`).getTime() + ad.duration_days * 86400000 > Date.now()).length,
    pending: campaigns.filter((ad) => ad.status === 'pending').length,
    rejected: campaigns.filter((ad) => ad.status === 'rejected').length,
    impressions: campaigns.reduce((sum, ad) => sum + Number(ad.impressions), 0),
    clicks: campaigns.reduce((sum, ad) => sum + Number(ad.clicks), 0),
    spend: campaigns.filter((ad) => ad.payment_status === 'paid').reduce((sum, ad) => sum + Number(ad.total_price), 0),
  };

  async function payCampaign(ad: Campaign) {
    setError(''); setNotice(''); setPayingId(ad.id);
    try {
      const response = await fetch('/api/payments/advertisement/order', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ campaignId: ad.id }),
      });
      const order = await response.json() as { keyId?: string; orderId?: string; transactionId?: string; amount?: number; currency?: string; error?: string };
      if (!response.ok || !order.keyId || !order.orderId || !order.transactionId || !order.amount) throw new Error(order.error ?? 'Could not start payment.');
      await loadRazorpayCheckout();
      if (!window.Razorpay) throw new Error('Razorpay Checkout is unavailable in this browser.');
      const checkout = new window.Razorpay({
        key: order.keyId, amount: order.amount, currency: order.currency ?? 'INR',
        name: 'OUTS advertisements', description: ad.title, order_id: order.orderId, theme: { color: '#7664e8' },
        modal: { ondismiss: () => setPayingId('') },
        handler: (result) => {
          void (async () => {
            const verified = await fetch('/api/payments/advertisement/verify', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ transactionId: order.transactionId, orderId: result.razorpay_order_id, paymentId: result.razorpay_payment_id, signature: result.razorpay_signature }),
            });
            const body = await verified.json() as { error?: string };
            if (!verified.ok) { setError(body.error ?? 'Payment has not been verified.'); setPayingId(''); return; }
            window.location.reload();
          })();
        },
      });
      checkout.open();
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Payment could not be started.');
      setPayingId('');
    }
  }

  async function resubmitCampaign(ad: Campaign) {
    setPayingId(ad.id); setError('');
    const { error: submitError } = await supabase.rpc('submit_paid_advertisement', { p_advertisement_id: ad.id });
    if (submitError) setError(`Could not resubmit campaign: ${submitError.message}`);
    else {
      setCampaigns((current) => current.map((item) => item.id === ad.id ? { ...item, status: 'pending', rejection_reason: null } : item));
      setNotice('Campaign resubmitted for admin review.');
    }
    setPayingId('');
  }

  return <main className="form-page advertiser-page">
    <Link href="/dashboard" className="back-link"><ArrowLeft size={16} /> Dashboard</Link>
    <header className="list-heading"><p className="eyebrow"><Megaphone size={14} /> ADVERTISER CENTER</p><h1>Your campaigns</h1><p className="muted">Prepare campaign drafts, track review status and monitor results.</p></header>
    <div className="stat-grid advertiser-stats">
      <div className="stat-card"><small>Total advertisements</small><b>{metrics.total}</b></div><div className="stat-card"><small>Active</small><b>{metrics.active}</b></div><div className="stat-card"><small>Pending approval</small><b>{metrics.pending}</b></div><div className="stat-card"><small>Rejected</small><b>{metrics.rejected}</b></div><div className="stat-card"><small>Impressions</small><b>{metrics.impressions}</b></div><div className="stat-card"><small>Clicks</small><b>{metrics.clicks}</b></div><div className="stat-card"><small>Verified spend</small><b>₹{metrics.spend.toLocaleString('en-IN')}</b></div>
    </div>
    <div className="advertiser-topline"><h2>Campaigns</h2><Link href="/advertiser/ads/new" className="btn btn-dark"><Plus size={16} /> Create advertisement</Link></div>
    <p className="notice" role="status">Payment is verified server-side before an admin can review a campaign. Standard Razorpay Checkout is not escrow, and OUTS does not automatically release task funds.</p>
    {error && <p className="notice account-error" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {loading ? <p className="empty-state">Loading campaigns…</p> : campaigns.length ? <div className="ad-campaign-list">{campaigns.map((ad) => <article className="ad-campaign" key={ad.id}>
      <div className="ad-campaign-head"><div><span className={`status status-${ad.status}`}>{ad.status}</span><h3>{ad.title}</h3><small>{ad.brand_name} · {ad.category}</small></div><b>₹{Number(ad.total_price).toLocaleString('en-IN')}</b></div>
      <p>{ad.description}</p><div className="ad-campaign-meta"><span>{ad.duration_days} days from {ad.starts_at}</span><span>Remaining: {Math.max(0, Math.ceil((new Date(`${ad.starts_at}T00:00:00Z`).getTime() + ad.duration_days * 86400000 - Date.now()) / 86400000))} days</span><span>Payment: {ad.payment_status}</span><span>{ad.impressions} impressions · {ad.clicks} clicks</span><span>CTR: {ad.impressions ? ((ad.clicks / ad.impressions) * 100).toFixed(2) : '0.00'}%</span></div>
      {ad.rejection_reason && <p className="notice account-error">Review note: {ad.rejection_reason}</p>}
      {(ad.status === 'draft' || ad.status === 'rejected' || ad.status === 'pending') && <Link className="text-link" href={`/advertiser/ads/new?edit=${ad.id}`}>Edit campaign</Link>}
      {['draft','rejected'].includes(ad.status) && !['paid','refunded'].includes(ad.payment_status) && <button type="button" className="btn btn-dark ad-pay-button" disabled={Boolean(payingId)} onClick={() => void payCampaign(ad)}>{payingId === ad.id ? 'Opening checkout…' : `Pay ₹${Number(ad.total_price).toLocaleString('en-IN')} and submit for review`}</button>}
      {ad.status === 'rejected' && ad.payment_status === 'paid' && <button type="button" className="btn btn-dark ad-pay-button" disabled={Boolean(payingId)} onClick={() => void resubmitCampaign(ad)}>{payingId === ad.id ? 'Submitting…' : 'Resubmit for review'}</button>}
    </article>)}</div> : <div className="empty-state">No advertisements yet. Create a draft to get started.</div>}
  </main>;
}

export function NewAdvertisement() {
  const supabase = useMemo(() => createClient(), []);
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; image_path: string | null } | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('edit');
    if (!id) return;
    void (async () => {
      const { data, error: loadError } = await supabase.from('advertisements')
        .select('id,title,brand_name,description,image_path,destination_url,category,target_audience,starts_at,duration_days')
        .eq('id', id).maybeSingle();
      if (loadError || !data || !formRef.current) { setError(loadError?.message ?? 'Campaign could not be found.'); return; }
      setEditing({ id: data.id, image_path: data.image_path });
      const fields = formRef.current.elements as typeof formRef.current.elements & Record<string, HTMLInputElement | HTMLTextAreaElement>;
      for (const key of ['title','brand_name','description','destination_url','category','target_audience','starts_at','duration_days'] as const) {
        const field = fields.namedItem(key);
        if (field && 'value' in field) field.value = String(data[key] ?? '');
      }
    })();
  }, [supabase]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const form = new FormData(event.currentTarget);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) { setError('Sign in to create a campaign.'); setBusy(false); return; }
    const image = form.get('image');
    let imagePath: string | null = null;
    if (image instanceof File && image.size > 0) {
      if (!['image/jpeg','image/png','image/webp'].includes(image.type) || image.size > 5 * 1024 * 1024) { setError('Choose a PNG, JPEG or WebP image under 5 MB.'); setBusy(false); return; }
      imagePath = `${user.id}/${crypto.randomUUID()}.${image.type === 'image/png' ? 'png' : image.type === 'image/webp' ? 'webp' : 'jpg'}`;
      const { error: uploadError } = await supabase.storage.from('outs-ad-creatives').upload(imagePath, image, { contentType: image.type, upsert: false });
      if (uploadError) { setError(`Could not upload the banner: ${uploadError.message}`); setBusy(false); return; }
    }
    const rawUrl = String(form.get('destination_url') ?? '').trim();
    let destinationUrl = '';
    try { const parsed = new URL(rawUrl); if (parsed.protocol !== 'https:') throw new Error(); destinationUrl = parsed.toString(); }
    catch { setError('Enter a valid HTTPS destination URL.'); setBusy(false); return; }
    const duration = Number(form.get('duration_days'));
    const values = {
      title: String(form.get('title')).trim(), brand_name: String(form.get('brand_name')).trim(),
      description: String(form.get('description')).trim(), image_path: imagePath, destination_url: destinationUrl,
      category: String(form.get('category')).trim(), target_audience: String(form.get('target_audience') ?? '').trim() || null,
      starts_at: String(form.get('starts_at')), duration_days: duration, updated_at: new Date().toISOString(),
    };
    if (!Number.isInteger(duration) || duration < 1 || duration > 365) { setError('Duration must be between 1 and 365 days.'); setBusy(false); return; }
    const result = editing
      ? await supabase.from('advertisements').update({ ...values, image_path: imagePath ?? editing.image_path }).eq('id', editing.id).eq('advertiser_id', user.id)
      : await supabase.from('advertisements').insert({ ...values, image_path: imagePath, advertiser_id: user.id, daily_price: 100, status: 'draft', payment_status: 'pending' });
    const insertError = result.error;
    if (insertError) {
      if (imagePath) await supabase.storage.from('outs-ad-creatives').remove([imagePath]);
      setError(`Could not save campaign: ${insertError.message}`);
    } else {
      if (imagePath && editing?.image_path) await supabase.storage.from('outs-ad-creatives').remove([editing.image_path]);
      setNotice(`${editing ? 'Campaign updated' : 'Draft saved'}. Estimated campaign price: ₹${(duration * 100).toLocaleString('en-IN')}. Payment setup is required before review or display.`);
      if (!editing) (event.currentTarget as HTMLFormElement).reset();
    }
    setBusy(false);
  }

  return <main className="form-page"><Link href="/advertiser" className="back-link"><ArrowLeft size={16} /> Advertiser dashboard</Link><section className="form-card advertiser-form-card">
    <div className="auth-icon"><Upload /></div><p className="eyebrow">NEW CAMPAIGN</p><h1>Create advertisement</h1><p className="muted">All campaigns require verified payment and admin approval. Pricing is ₹100 per day.</p>
    <form ref={formRef} className="task-form" onSubmit={save}>
      <label>Advertisement title<input name="title" required minLength={5} maxLength={120} /></label>
      <label>Brand or business name<input name="brand_name" required minLength={2} maxLength={120} /></label>
      <label>Description<textarea name="description" required minLength={10} maxLength={3000} rows={4} /></label>
      <label>Banner image (PNG, JPEG or WebP, up to 5 MB)<input name="image" type="file" accept="image/png,image/jpeg,image/webp" /></label>
      <label>Destination website (HTTPS)<input name="destination_url" type="url" placeholder="https://example.com" required /></label>
      <label>Category<input name="category" required minLength={2} maxLength={80} placeholder="Books, student events, technology…" /></label>
      <label>Target audience (optional)<input name="target_audience" maxLength={200} placeholder="First-year engineering students" /></label>
      <label>Campaign start date<input name="starts_at" type="date" min={new Date().toISOString().slice(0,10)} required /></label>
      <label>Duration in days (₹100/day)<input name="duration_days" type="number" min="1" max="365" step="1" defaultValue="7" required /></label>
      <div className="notice">Payment checkout is not available yet. This form saves an unpaid draft; it will not appear to students.</div>
      <button className="btn btn-dark auth-submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save campaign changes' : 'Save campaign draft'}</button>
    </form>{error && <p className="notice account-error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
  </section></main>;
}
