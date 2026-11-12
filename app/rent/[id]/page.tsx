'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import RentNav from '@/components/rent-nav';
import { createClient } from '@/lib/supabase/client';
import { getBillableRentalDays, getRentalEstimatePaise } from '@/lib/rent/pricing';

type Item = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  subcategory: string;
  condition: string;
  brand: string;
  model: string;
  daily_price_paise: number;
  deposit_paise: number;
  min_duration_hours: number;
  max_duration_hours: number;
  available_from: string;
  available_until: string;
  availability_status: string;
  unavailable_dates: string[];
  college: string;
  pickup_point: string;
  return_location: string;
  pickup_instructions: string;
  rental_terms: string;
  damage_policy: string;
  usage_restrictions: string;
  rent_categories: { name: string } | null;
};

export default function RentDetail() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const [item, setItem] = useState<Item | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  useEffect(() => {
    void (async () => {
      const { data, error: loadError } = await supabase.from('rent_listings')
        .select('*,rent_categories(name),rent_listing_images(storage_path,sort_order,is_ownership_proof)')
        .eq('id', id)
        .single();
      if (loadError || !data) {
        setError('This listing could not be loaded.');
        return;
      }

      setItem(data as unknown as Item);
      const paths = (data.rent_listing_images ?? [])
        .filter((image: { is_ownership_proof: boolean }) => !image.is_ownership_proof)
        .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
        .map((image: { storage_path: string }) =>
          supabase.storage.from('outs-rent-images').getPublicUrl(image.storage_path).data.publicUrl);
      setImages(paths);
    })();
  }, [id, supabase]);

  const durationMs = start && end ? new Date(end).getTime() - new Date(start).getTime() : 0;
  const billableDays = getBillableRentalDays(durationMs);
  const requestedHours = Number.isFinite(durationMs) && durationMs > 0 ? Math.ceil(durationMs / (60 * 60 * 1000)) : 0;
  const durationFits = item !== null && requestedHours >= item.min_duration_hours && requestedHours <= item.max_duration_hours;
  const estimatePaise = item && billableDays
    ? getRentalEstimatePaise(Number(item.daily_price_paise), billableDays)
    : null;

  async function book() {
    if (!item || !start || !end || !billableDays) return;
    setError('');
    setMessage('');
    setBusy(true);
    const { data, error: bookingError } = await supabase.rpc('create_rent_booking', {
      p_listing_id: item.id,
      p_starts_at: new Date(start).toISOString(),
      p_ends_at: new Date(end).toISOString(),
      p_pickup: '',
      p_return: '',
    });
    if (bookingError) {
      setError(bookingError.message.includes('Verified')
        ? 'Only verified students in an enabled college pilot can request a booking.'
        : bookingError.message);
    } else {
      setMessage(`Booking request ${String(data).slice(0, 8)} sent. The owner must approve it before eligible PayPal Sandbox checkout is available. Sandbox is not real-money payment; deposits and seller payouts are not supported.`);
    }
    setBusy(false);
  }

  async function report() {
    if (!item) return;
    const reason = window.prompt('Why are you reporting this listing?');
    if (!reason) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Sign in before reporting a listing.');
      return;
    }
    const { error: reportError } = await supabase.from('rent_reports').insert({
      listing_id: item.id,
      reporter_id: user.id,
      reason: reason.slice(0, 200),
    });
    if (reportError) setError('Could not submit report.');
    else setMessage('Thanks. The report was sent to moderation.');
  }

  return (
    <main className="rent-page">
      <RentNav />
      {item ? (
        <section className="rent-detail-wrap">
          <Link href="/rent" className="rent-back">← Explore rentals</Link>
          <div className="rent-detail-grid">
            <div>
              {images.length ? (
                <div className="rent-gallery">
                  {images.map(src => <Image key={src} src={src} alt={item.title} width={800} height={520} unoptimized />)}
                </div>
              ) : <div className="rent-detail-art">OUTS Rent</div>}
              <article className="rent-detail-copy">
                <span className="rent-chip">{item.rent_categories?.name} · {item.condition.replace('_', ' ')}</span>
                <h1>{item.title}</h1>
                <p>{item.description}</p>
                <div className="rent-info-grid">
                  <div><small>Brand / model</small><b>{[item.brand, item.model].filter(Boolean).join(' ') || 'Not specified'}</b></div>
                  <div><small>College</small><b>{item.college}</b></div>
                  <div><small>Pickup</small><b>{item.pickup_point}</b></div>
                  <div><small>Return location</small><b>{item.return_location}</b></div>
                  <div><small>Listed availability</small><b>{item.available_from} – {item.available_until}</b></div>
                  <div><small>Minimum duration</small><b>{item.min_duration_hours} hours</b></div>
                  <div><small>Maximum duration</small><b>{item.max_duration_hours} hours</b></div>
                </div>
                <h3>Terms and care</h3>
                <p>{item.rental_terms || 'Agree on rental terms with the owner before handover.'}</p>
                {item.damage_policy && <p>Damage policy: {item.damage_policy}</p>}
                {item.usage_restrictions && <p>Usage restrictions: {item.usage_restrictions}</p>}
                {item.pickup_instructions && <p>{item.pickup_instructions}</p>}
              </article>
            </div>

            <aside className="rent-book-card">
              <p className="eyebrow">BOOK THIS ITEM</p>
              <h2>₹{(item.daily_price_paise / 100).toLocaleString('en-IN')} <small>/ day</small></h2>
              <div className="rent-price-line"><span>Refundable deposit (not collected)</span><b>₹{(item.deposit_paise / 100).toLocaleString('en-IN')}</b></div>
              <div className="rent-payment-note">
                Booking requests require owner approval. Eligible approved bookings can use PayPal Sandbox checkout for rent only. Sandbox is not real-money payment; deposits and seller payouts are not supported.
              </div>
              {item.availability_status !== 'available' && <p className="rent-alert">This listing is currently marked unavailable for booking requests.</p>}
              <label>Start date and time
                <input type="datetime-local" value={start} min={`${item.available_from}T00:00`} max={`${item.available_until}T23:59`} onChange={event => setStart(event.target.value)} />
              </label>
              <label>End date and time
                <input type="datetime-local" value={end} min={start || `${item.available_from}T00:00`} max={`${item.available_until}T23:59`} onChange={event => setEnd(event.target.value)} />
              </label>
              {estimatePaise !== null && (
                <div className="rent-estimate">
                  Estimated rent: ₹{(estimatePaise / 100).toLocaleString('en-IN')}
                  <small>Based on the database daily rate and billed in 24-hour days rounded up. Deposit excluded; owner approval and date checks still apply.</small>
                </div>
              )}
              {billableDays && !durationFits && <p className="rent-alert">Choose a rental length between {item.min_duration_hours} and {item.max_duration_hours} hours.</p>}
              <button disabled={busy || !start || !end || !billableDays || !durationFits || item.availability_status !== 'available' || item.owner_id === ''} className="btn btn-dark" onClick={() => void book()}>
                {busy ? 'Sending…' : 'Request booking'}
              </button>
              {error && <p role="alert" className="rent-alert">{error}</p>}
              {message && <p role="status" className="rent-success">{message}</p>}
              <button className="rent-report" onClick={() => void report()}>Report this listing</button>
            </aside>
          </div>
        </section>
      ) : (
        <section className="rent-content">{error ? <p role="alert">{error}</p> : 'Loading item…'}</section>
      )}
    </main>
  );
}
