'use client';

import { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ReuseNav from '@/components/reuse-nav';
import { createClient } from '@/lib/supabase/client';

type ListingType = 'sell' | 'free' | 'exchange' | 'rent';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export default function NewReuseListing() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [type, setType] = useState<ListingType>('sell');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState('good');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [exchangeFor, setExchangeFor] = useState('');
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [partialListingId, setPartialListingId] = useState('');

  function choosePhotos(event: ChangeEvent<HTMLInputElement>) {
    const next = Array.from(event.target.files ?? []);
    const invalid = next.find(file => !allowedTypes.has(file.type) || file.size > 5 * 1024 * 1024);
    if (invalid) {
      setError('Photos must be JPG, PNG, or WebP files no larger than 5 MB each.');
      setPhotos([]);
      event.target.value = '';
      return;
    }
    if (next.length > 3) {
      setError('Choose up to 3 photos.');
      setPhotos([]);
      event.target.value = '';
      return;
    }
    setError('');
    setPhotos(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    const numericPrice = type === 'free' || type === 'exchange' ? 0 : Number(price);
    const pricePaise = Math.round(numericPrice * 100);
    const numericQuantity = Number(quantity);
    if (!Number.isSafeInteger(pricePaise) || pricePaise < 0 || (type !== 'free' && type !== 'exchange' && pricePaise <= 0)) {
      setError('Enter a valid positive price in rupees (up to two decimal places).');
      return;
    }
    if (!Number.isInteger(numericQuantity) || numericQuantity < 1 || numericQuantity > 1000) {
      setError('Quantity must be a whole number between 1 and 1000.');
      return;
    }
    if ((availableFrom && !availableUntil) || (!availableFrom && availableUntil) ||
      (availableFrom && availableUntil && availableUntil < availableFrom)) {
      setError('Provide both availability dates and make sure the end date is not before the start date.');
      return;
    }
    if (type === 'exchange' && exchangeFor.trim().length < 3) {
      setError('Describe what you would accept in exchange.');
      return;
    }
    setBusy(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setError(authError?.message ?? 'Sign in before creating a listing.');
      setBusy(false);
      return;
    }
    const { data: profile, error: profileError } = await supabase.from('profiles')
      .select('college').eq('id', user.id).maybeSingle();
    if (profileError || !profile?.college) {
      setError(profileError?.message ?? 'Add your college to your profile before listing an item.');
      setBusy(false);
      return;
    }
    const { data: listing, error: insertError } = await supabase.from('reuse_listings').insert({
      owner_id: user.id,
      college: profile.college,
      title: title.trim(),
      description: description.trim(),
      category: category.trim(),
      listing_type: type,
      item_condition: condition,
      price_paise: pricePaise,
      available_quantity: numericQuantity,
      exchange_for: type === 'exchange' ? exchangeFor.trim() : null,
      available_from: availableFrom || null,
      available_until: availableUntil || null,
      status: 'pending_approval',
    }).select('id').single();
    if (insertError || !listing) {
      setError(insertError?.message ?? 'The listing could not be created.');
      setBusy(false);
      return;
    }

    for (const [index, photo] of photos.entries()) {
      const extension = photo.type === 'image/jpeg' ? 'jpg' : photo.type === 'image/png' ? 'png' : 'webp';
      const path = `${user.id}/${listing.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('outs-reuse-images').upload(path, photo, {
        contentType: photo.type,
        cacheControl: '3600',
        upsert: false,
      });
      if (uploadError) {
        setPartialListingId(listing.id);
        setNotice('Your listing was submitted for review, but a photo could not be uploaded. You can still open the listing below.');
        setError(`Photo upload failed: ${uploadError.message}`);
        setBusy(false);
        return;
      }
      const { error: imageError } = await supabase.from('reuse_listing_images').insert({
        listing_id: listing.id,
        storage_path: path,
        alt_text: `${title.trim()} photo ${index + 1}`,
        sort_order: index,
      });
      if (imageError) {
        const { error: cleanupError } = await supabase.storage.from('outs-reuse-images').remove([path]);
        setPartialListingId(listing.id);
        setNotice('Your listing was submitted for review, but a photo record could not be saved.');
        setError(`Photo record failed: ${imageError.message}${cleanupError ? ` Photo cleanup failed: ${cleanupError.message}` : ''}`);
        setBusy(false);
        return;
      }
    }
    router.push(`/reuse/${listing.id}?submitted=1`);
  }

  return (
    <main className="rent-page">
      <ReuseNav />
      <section className="rent-form-wrap">
        <Link className="rent-back" href="/reuse">← Back to Reuse</Link>
        <p className="eyebrow">SHARE IT WITH YOUR CAMPUS</p><h1>List an item</h1>
        <p className="muted">New listings are reviewed before they appear publicly. Requests are not payments, reservations, or seller payouts.</p>
        {notice && <p className="rent-success" role="status">{notice}</p>}
        {error && <p className="rent-alert" role="alert">{error}</p>}
        {partialListingId && <p><Link className="text-link" href={`/reuse/${partialListingId}`}>Open submitted listing</Link></p>}
        <form className="rent-form" onSubmit={event => void submit(event)}>
          <div className="rent-form-grid">
            <label>How are you sharing it?
              <select value={type} onChange={event => setType(event.target.value as ListingType)}>
                <option value="sell">Sell</option><option value="free">Give away</option><option value="exchange">Exchange</option><option value="rent">Rent by request</option>
              </select>
            </label>
            <label>Category<input required maxLength={60} value={category} onChange={event => setCategory(event.target.value)} placeholder="Books, electronics, sports…" /></label>
            <label className="rent-wide">Item name<input required minLength={3} maxLength={120} value={title} onChange={event => setTitle(event.target.value)} /></label>
            <label className="rent-wide">Description<textarea required minLength={10} maxLength={3000} rows={5} value={description} onChange={event => setDescription(event.target.value)} /></label>
            <label>Condition
              <select value={condition} onChange={event => setCondition(event.target.value)}>
                <option value="new">New</option><option value="like_new">Like new</option><option value="good">Good</option><option value="fair">Fair</option>
              </select>
            </label>
            {type !== 'free' && type !== 'exchange' && <label>{type === 'rent' ? 'Daily price (₹)' : 'Price (₹)'}<input required type="number" min="0.01" step="0.01" max="99999999" value={price} onChange={event => setPrice(event.target.value)} /></label>}
            <label>Quantity<input required type="number" min="1" max="1000" step="1" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
            {type === 'exchange' && <label>Looking for<input required minLength={3} maxLength={500} value={exchangeFor} onChange={event => setExchangeFor(event.target.value)} /></label>}
            <label>Available from (optional)<input type="date" value={availableFrom} onChange={event => setAvailableFrom(event.target.value)} /></label>
            <label>Available until (optional)<input type="date" value={availableUntil} onChange={event => setAvailableUntil(event.target.value)} /></label>
            <label className="rent-wide">Photos (up to 3, 5 MB each)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={choosePhotos} /><small>{photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'} selected` : 'JPG, PNG, or WebP only.'}</small></label>
            <div className="rent-payment-note rent-wide">OUTS Reuse is request-based. It does not collect payment or deposits and does not guarantee a transaction. Arrange exchanges in safe, public campus locations.</div>
          </div>
          <div className="rent-actions"><button className="btn btn-dark" disabled={busy || Boolean(partialListingId)}>{busy ? 'Submitting…' : 'Submit for review'}</button><Link className="btn btn-light" href="/reuse">Cancel</Link></div>
        </form>
      </section>
    </main>
  );
}
