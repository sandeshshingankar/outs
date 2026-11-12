'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import ReuseNav from '@/components/reuse-nav';
import { createClient } from '@/lib/supabase/client';

type Listing = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  category: string;
  listing_type: 'sell' | 'free' | 'exchange' | 'rent';
  item_condition: string;
  price_paise: number;
  available_quantity: number;
  exchange_for: string | null;
  available_from: string | null;
  available_until: string | null;
  college: string;
  status: string;
};
type Photo = { id: string; storage_path: string; alt_text: string; sort_order: number };

const typeLabels: Record<Listing['listing_type'], string> = {
  sell: 'For sale', free: 'Give away', exchange: 'Exchange', rent: 'Rent by request',
};

export default function ReuseListingDetail() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [listing, setListing] = useState<Listing | null>(null);
  const [photos, setPhotos] = useState<Array<Photo & { url: string }>>([]);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [message, setMessage] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const load = useCallback(async () => {
    const [{ data: { user }, error: authError }, { data, error: listingError }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('reuse_listings')
        .select('id,owner_id,title,description,category,listing_type,item_condition,price_paise,available_quantity,exchange_for,available_from,available_until,college,status')
        .eq('id', params.id).maybeSingle(),
    ]);
    if (authError) setError(`Sign-in could not be verified: ${authError.message}`);
    else setUserId(user?.id ?? '');
    if (listingError) setError(`Listing could not be loaded: ${listingError.message}`);
    if (!data) {
      setLoading(false);
      return;
    }
    setListing(data as Listing);
    const { data: imageRows, error: imageError } = await supabase.from('reuse_listing_images')
      .select('id,storage_path,alt_text,sort_order').eq('listing_id', data.id).order('sort_order');
    if (imageError) setError(`Listing photos could not be loaded: ${imageError.message}`);
    const signed = await Promise.all((imageRows ?? []).map(async photo => {
      const { data: signedUrl, error: signedError } = await supabase.storage
        .from('outs-reuse-images').createSignedUrl(photo.storage_path, 3600);
      if (signedError) {
        setError(`A listing photo could not be displayed: ${signedError.message}`);
        return null;
      }
      return { ...photo, url: signedUrl.signedUrl };
    }));
    setPhotos(signed.filter((photo): photo is Photo & { url: string } => photo !== null));
    if (user && user.id !== data.owner_id) {
      const { data: existingFavorite, error: favoriteError } = await supabase.from('reuse_favorites')
        .select('listing_id').eq('listing_id', data.id).eq('user_id', user.id).maybeSingle();
      if (favoriteError) setError(`Favorite status could not be loaded: ${favoriteError.message}`);
      setFavorite(Boolean(existingFavorite));
    }
    setLoading(false);
  }, [params.id, supabase]);

  useEffect(() => {
    void load();
    if (new URLSearchParams(window.location.search).has('submitted')) setNotice('Listing submitted for approval. It will appear in discovery after review.');
  }, [load]);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!listing) return;
    setBusy(true);
    setError('');
    setNotice('');
    const requestQuantity = listing.listing_type === 'rent' ? 1 : Number(quantity);
    if (!Number.isInteger(requestQuantity) || requestQuantity < 1 || requestQuantity > listing.available_quantity) {
      setError('Enter a whole-number quantity within the amount currently available.');
      setBusy(false);
      return;
    }
    const request = {
      listing_id: listing.id,
      requester_id: userId,
      quantity: requestQuantity,
      message: message.trim() || null,
      starts_at: listing.listing_type === 'rent' && startDate ? new Date(`${startDate}T00:00:00Z`).toISOString() : null,
      ends_at: listing.listing_type === 'rent' && endDate ? new Date(`${endDate}T23:59:59.999Z`).toISOString() : null,
      status: 'pending',
    };
    if (listing.listing_type === 'rent' && (!startDate || !endDate || endDate <= startDate)) {
      setError('Choose a valid rental start date and a later end date.');
      setBusy(false);
      return;
    }
    const { data, error: requestError } = await supabase.from('reuse_requests').insert(request).select('id').single();
    if (requestError) setError(`Request could not be submitted: ${requestError.message}`);
    else {
      setNotice('Request submitted. The owner must accept it before it is considered agreed; OUTS does not process payment.');
      router.push(`/messages?with=${listing.owner_id}&reuse=${listing.id}`);
      void data;
    }
    setBusy(false);
  }

  async function toggleFavorite() {
    if (!listing || !userId) return;
    setBusy(true);
    const result = favorite
      ? await supabase.from('reuse_favorites').delete().eq('user_id', userId).eq('listing_id', listing.id)
      : await supabase.from('reuse_favorites').insert({ user_id: userId, listing_id: listing.id });
    if (result.error) setError(`Favorite could not be updated: ${result.error.message}`);
    else setFavorite(!favorite);
    setBusy(false);
  }

  async function reportListing() {
    if (!listing || typeof window === 'undefined') return;
    const reason = window.prompt('Why are you reporting this listing? Use misleading, prohibited, spam, safety, or other.');
    if (!reason) return;
    const allowed = ['misleading', 'prohibited', 'spam', 'safety', 'other'];
    const selected = allowed.find(value => reason.trim().toLowerCase().startsWith(value));
    if (!selected) {
      setError('Use one of these report reasons: misleading, prohibited, spam, safety, or other.');
      return;
    }
    const { error: reportError } = await supabase.from('reuse_reports').insert({
      listing_id: listing.id, reporter_id: userId, reason: selected,
      details: reason.trim().slice(selected.length).replace(/^[:\s-]+/, '').slice(0, 1500) || null,
    });
    if (reportError) setError(`Report could not be submitted: ${reportError.message}`);
    else setNotice('Report sent to the moderation team.');
  }

  return (
    <main className="rent-page">
      <ReuseNav />
      <section className="rent-detail-wrap">
        <Link className="rent-back" href="/reuse">← Back to Reuse</Link>
        {loading ? <div className="rent-skeleton" /> : !listing ? <div className="rent-empty"><h2>Listing unavailable</h2><p>It may have been removed or is outside your campus.</p></div> : <>
          {error && <p className="rent-alert" role="alert">{error}</p>}
          {notice && <p className="rent-success" role="status">{notice}</p>}
          <div className="rent-detail-grid">
            <section>
              {photos.length ? <div className="rent-gallery">{photos.map(photo => <Image key={photo.id} src={photo.url} alt={photo.alt_text} width={600} height={400} unoptimized />)}</div> : <div className="rent-detail-art">{listing.category}</div>}
              <article className="rent-detail-copy">
                <span className="rent-chip">{typeLabels[listing.listing_type]}</span>
                <h1>{listing.title}</h1>
                <p>{listing.description}</p>
                {listing.exchange_for && <p><b>Looking for:</b> {listing.exchange_for}</p>}
                <div className="rent-info-grid">
                  <div><small>Category</small><b>{listing.category}</b></div>
                  <div><small>Condition</small><b>{listing.item_condition.replace('_', ' ')}</b></div>
                  <div><small>Campus</small><b>{listing.college}</b></div>
                  <div><small>Quantity</small><b>{listing.available_quantity} available</b></div>
                  {(listing.available_from || listing.available_until) && <div><small>Availability</small><b>{listing.available_from ?? 'Flexible'} – {listing.available_until ?? 'Flexible'}</b></div>}
                </div>
                <p className="rent-payment-note">Requests require owner approval. OUTS Reuse does not collect payment or deposits and does not provide seller payouts. Coordinate a handover in a safe, public campus location.</p>
                {userId && userId !== listing.owner_id && <button className="rent-report" type="button" onClick={() => void reportListing()}>Report this listing</button>}
              </article>
            </section>
            <aside className="rent-book-card">
              <h2>{listing.listing_type === 'free' ? 'Free' : listing.listing_type === 'exchange' ? 'Exchange' : `₹${(Number(listing.price_paise) / 100).toLocaleString('en-IN')} ${listing.listing_type === 'rent' ? '/ day' : ''}`}</h2>
              {listing.status !== 'published' && <p className="rent-payment-note">Listing status: {listing.status.replace('_', ' ')}</p>}
              {userId === listing.owner_id ? <p>This is your listing. Review and manage incoming requests in <Link href="/reuse/my">My activity</Link>.</p>
                : listing.status === 'published' && listing.available_quantity > 0 ? <>
                  <button className="btn btn-light" type="button" disabled={busy} onClick={() => void toggleFavorite()}>{favorite ? 'Saved to favorites' : 'Save listing'}</button>
                  <form onSubmit={event => void submitRequest(event)}>
                    {listing.listing_type === 'rent' ? <>
                      <label>Start date<input required type="date" min={listing.available_from ?? undefined} max={listing.available_until ?? undefined} value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
                      <label>End date<input required type="date" min={startDate || listing.available_from || undefined} max={listing.available_until ?? undefined} value={endDate} onChange={event => setEndDate(event.target.value)} /></label>
                    </> : <label>Quantity<input required type="number" min="1" max={listing.available_quantity} step="1" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>}
                    <label>Message to owner<textarea maxLength={1500} rows={4} value={message} onChange={event => setMessage(event.target.value)} placeholder="Introduce yourself and ask any item-specific questions." /></label>
                    <button className="btn btn-dark" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Request this item'}</button>
                  </form>
                </> : <p>This listing is not currently accepting requests.</p>}
            </aside>
          </div>
        </>}
      </section>
    </main>
  );
}
