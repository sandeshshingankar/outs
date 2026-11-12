'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import RentNav from '@/components/rent-nav';
import { createClient } from '@/lib/supabase/client';

type Category = { id: string; name: string; subcategories: string[] };

export default function NewRentListing() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [college, setCollege] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);

  const selectedCategory = categories.find(category => category.id === selectedCategoryId);

  useEffect(() => {
    let active = true;
    async function loadFormData() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (!active) return;
        if (authError || !user) {
          router.replace('/auth?mode=login&next=%2Frent%2Flist');
          return;
        }
        const [categoryResult, profileResult] = await Promise.all([
          supabase.from('rent_categories').select('id,name,subcategories').eq('is_active', true).order('sort_order'),
          supabase.from('profiles').select('college').eq('id', user.id).maybeSingle(),
        ]);
        if (!active) return;
        if (categoryResult.error) setLoadError(`Could not load rental categories: ${categoryResult.error.message}`);
        else setCategories((categoryResult.data ?? []) as Category[]);
        if (profileResult.error) setLoadError(previous => previous
          ? `${previous} Your college could not be loaded: ${profileResult.error.message}`
          : `Your college could not be loaded: ${profileResult.error.message}`);
        else setCollege(profileResult.data?.college ?? '');
      } catch (loadRequestError) {
        if (active) setLoadError(loadRequestError instanceof Error ? loadRequestError.message : 'Could not load listing form data.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadFormData();
    return () => { active = false; };
  }, [router, supabase]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        router.replace('/auth?mode=login&next=%2Frent%2Flist');
        return;
      }
      const category = categories.find(item => item.id === String(formData.get('category_id')));
      const availableFrom = String(formData.get('available_from'));
      const availableUntil = String(formData.get('available_until'));
      const dailyPricePaise = Math.round(Number(formData.get('daily_price')) * 100);
      const depositPaise = Math.round(Number(formData.get('deposit') || 0) * 100);
      const minHours = Number(formData.get('min_hours'));
      const maxHours = Number(formData.get('max_hours'));
      if (!category || !category.subcategories.includes(subcategory) ||
        !Number.isSafeInteger(dailyPricePaise) || dailyPricePaise <= 0 ||
        !Number.isSafeInteger(depositPaise) || depositPaise < 0 ||
        availableUntil < availableFrom || !Number.isInteger(minHours) ||
        !Number.isInteger(maxHours) || minHours < 1 || maxHours < minHours) {
        setError('Check category and subcategory, positive price, availability dates, and rental duration.');
        return;
      }
      if (files && files.length > 5) {
        setError('Choose up to 5 images.');
        return;
      }
      if (files && Array.from(files).some(file =>
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
        setError('Images must be JPG, PNG, or WebP and no larger than 5 MB each.');
        return;
      }

      const values = {
        owner_id: user.id,
        category_id: category.id,
        title: String(formData.get('title')).trim(),
        subcategory,
        description: String(formData.get('description')).trim(),
        brand: String(formData.get('brand') || ''),
        model: String(formData.get('model') || ''),
        condition: String(formData.get('condition')),
        accessories: String(formData.get('accessories') || ''),
        ownership_confirmed: formData.get('ownership') === 'on',
        daily_price_paise: dailyPricePaise,
        deposit_paise: depositPaise,
        min_duration_hours: minHours,
        max_duration_hours: maxHours,
        available_from: availableFrom,
        available_until: availableUntil,
        college,
        pickup_point: String(formData.get('pickup_point')).trim(),
        return_location: String(formData.get('return_location')).trim(),
        pickup_instructions: String(formData.get('pickup_instructions') || ''),
        damage_policy: String(formData.get('damage_policy') || ''),
        usage_restrictions: String(formData.get('usage_restrictions') || ''),
        rental_terms: String(formData.get('rental_terms') || ''),
        status: 'pending_approval',
      };
      const { data: listing, error: insertError } = await supabase.from('rent_listings')
        .insert(values).select('id').single();
      if (insertError || !listing) {
        setError(insertError?.message.includes('row-level security')
          ? 'Rent is available to verified students in the enabled college pilot. Check your verification and college access.'
          : insertError?.message ?? 'Could not create listing.');
        return;
      }

      for (const [index, file] of Array.from(files ?? []).entries()) {
        const path = `${user.id}/${listing.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const upload = await supabase.storage.from('outs-rent-images').upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (upload.error) {
          setError(`Listing saved, but an image could not upload: ${upload.error.message}`);
          return;
        }
        const imageResult = await supabase.from('rent_listing_images').insert({
          listing_id: listing.id,
          storage_path: path,
          sort_order: index,
        });
        if (imageResult.error) {
          setError(`Listing saved, but image details could not be recorded: ${imageResult.error.message}`);
          return;
        }
      }
      router.push('/rent/my?created=1');
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not submit the rental listing.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="rent-page">
      <RentNav />
      <section className="rent-form-wrap">
        <p className="eyebrow">EARN FROM WHAT YOU OWN</p>
        <h1>List an item for rent</h1>
        <p className="muted">Listings go through a safety review before appearing to students.</p>
        {error && <p className="rent-alert" role="alert">{error}</p>}
        {loadError && <p className="rent-alert" role="alert">{loadError}</p>}
        {loading && <p className="rent-loading-note" role="status">Loading your campus and rental categories…</p>}
        {!loading && !loadError && categories.length === 0 &&
          <p className="rent-empty" role="status">No rental categories are available right now.</p>}
        <form className="rent-form" onSubmit={submit}>
          <div className="rent-form-grid">
            <label>Item title<input name="title" minLength={4} maxLength={120} required placeholder="e.g. Casio scientific calculator" /></label>
            <label>Category
              <select name="category_id" required value={selectedCategoryId} disabled={loading || categories.length === 0}
                onChange={event => { setSelectedCategoryId(event.target.value); setSubcategory(''); }}>
                <option value="" disabled>{loading ? 'Loading categories…' : 'Choose a category'}</option>
                {categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label>Subcategory
              <select name="subcategory" required value={subcategory} disabled={!selectedCategory || loading}
                onChange={event => setSubcategory(event.target.value)}>
                <option value="" disabled>{selectedCategory ? 'Choose a type' : 'Choose a category first'}</option>
                {(selectedCategory?.subcategories ?? []).map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>Condition<select name="condition" required><option value="good">Good</option><option value="new">New</option><option value="like_new">Like new</option><option value="fair">Fair</option></select></label>
            <label>Brand<input name="brand" maxLength={100} /></label>
            <label>Model<input name="model" maxLength={100} /></label>
            <label className="rent-wide">Description<textarea name="description" required minLength={20} maxLength={5000} rows={4} placeholder="Describe the item, its condition and how it should be used." /></label>
            <label className="rent-wide">Accessories included<input name="accessories" maxLength={1000} /></label>
            <label>Daily price (₹)<input name="daily_price" type="number" min="0.01" step="0.01" required /></label>
            <label>Refundable security deposit (₹)<input name="deposit" type="number" min="0" step="0.01" defaultValue="0" /></label>
            <label>Minimum duration (hours)<input name="min_hours" type="number" min="1" max="8760" defaultValue="24" required /></label>
            <label>Maximum duration (hours)<input name="max_hours" type="number" min="1" max="8760" defaultValue="720" required /></label>
            <label>Available from<input name="available_from" type="date" required /></label>
            <label>Available until<input name="available_until" type="date" required /></label>
            <label>College / campus<input value={college} readOnly aria-readonly="true" /></label>
            <label>Preferred pickup point<input name="pickup_point" required maxLength={200} placeholder="Library entrance" /></label>
            <label>Return location<input name="return_location" required maxLength={200} /></label>
            <label>Pickup instructions<input name="pickup_instructions" maxLength={1000} /></label>
            <label className="rent-wide">Damage policy<textarea name="damage_policy" maxLength={2000} rows={2} /></label>
            <label className="rent-wide">Usage restrictions<textarea name="usage_restrictions" maxLength={2000} rows={2} /></label>
            <label className="rent-wide">Rental terms<textarea name="rental_terms" maxLength={3000} rows={3} /></label>
            <label className="rent-wide">Item images (up to 5, JPG/PNG/WebP, max 5 MB each)
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => setFiles(event.target.files)} />
            </label>
            <label className="rent-check rent-wide"><input name="ownership" type="checkbox" required />
              <span>I confirm that I own this item or am authorized to rent it out, and the information is accurate.</span>
            </label>
            <div className="rent-wide rent-payment-note">Booking requests require your approval. Eligible approved bookings can use PayPal Sandbox for rent only. Sandbox is not real-money payment; deposits and seller payouts are not supported.</div>
            <button className="btn btn-dark rent-wide" disabled={busy || loading || Boolean(loadError) || categories.length === 0}>
              {busy ? 'Submitting…' : 'Submit for approval'}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
