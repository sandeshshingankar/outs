'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import RentNav from '@/components/rent-nav';
import { createClient } from '@/lib/supabase/client';

type Category = { id: string; name: string };

export default function NewRentRequest() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [categoryError, setCategoryError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadCategories() {
      const { data, error: queryError } = await supabase
        .from('rent_categories')
        .select('id,name')
        .eq('is_active', true)
        .order('sort_order');
      if (!active) return;
      if (queryError) setCategoryError(`Could not load categories: ${queryError.message}`);
      else setCategories(data ?? []);
      setLoadingCategories(false);
    }
    void loadCategories();
    return () => { active = false; };
  }, [supabase]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        router.push('/auth?mode=login&next=%2Frent%2Frequests%2Fnew');
        return;
      }
      const form = new FormData(event.currentTarget);
      const startsOn = String(form.get('starts_on'));
      const returnsOn = String(form.get('returns_on'));
      const budget = Number(form.get('budget'));
      const maximum = Number(form.get('maximum'));
      if (!categories.some(category => category.id === String(form.get('category')))) {
        setError('Please choose a valid category.');
        return;
      }
      if (!startsOn || !returnsOn || returnsOn <= startsOn || !Number.isFinite(budget) || budget <= 0 || !Number.isFinite(maximum) || maximum <= 0) {
        setError('Enter valid dates and positive budget amounts. Return date must be after start date.');
        return;
      }
      const { data, error: insertError } = await supabase.from('rent_requests').insert({
        requester_id: user.id,
        category_id: String(form.get('category')),
        item_name: String(form.get('item_name')).trim(),
        description: String(form.get('description')).trim(),
        quantity: Number(form.get('quantity')),
        starts_on: startsOn,
        returns_on: returnsOn,
        budget_per_day_paise: Math.round(budget * 100),
        max_total_paise: Math.round(maximum * 100),
        college: String(form.get('college')).trim(),
        pickup_preference: String(form.get('pickup') || ''),
        additional_requirements: String(form.get('requirements') || ''),
      }).select('id').single();
      if (insertError || !data) {
        setError(insertError?.message.includes('row-level security')
          ? 'Verified student access in an enabled college pilot is required.'
          : insertError?.message ?? 'Could not post the rental request.');
        return;
      }
      router.push(`/rent/my?request=${data.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not post the rental request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="rent-page">
      <RentNav />
      <section className="rent-form-wrap">
        <p className="eyebrow">FIND A MATCH</p>
        <h1>Request an item</h1>
        <p className="muted">Tell verified students what you need and when.</p>
        {(error || categoryError) && <p className="rent-alert" role="alert">{error || categoryError}</p>}
        {loadingCategories && <p className="rent-loading-note" role="status">Loading categories…</p>}
        {!loadingCategories && !categoryError && categories.length === 0 && <p className="rent-alert" role="alert">No active rental categories are configured. Apply the latest OUTS Rent category migration.</p>}
        <form className="rent-form" onSubmit={submit}>
          <div className="rent-form-grid">
            <label>Item name<input name="item_name" required minLength={3} maxLength={120} /></label>
            <label>Category<select name="category" required defaultValue="" disabled={loadingCategories || Boolean(categoryError) || categories.length === 0}>
              <option value="" disabled>{loadingCategories ? 'Loading categories…' : 'Choose a category'}</option>
              {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select></label>
            <label className="rent-wide">Description<textarea name="description" required minLength={10} maxLength={3000} /></label>
            <label>Quantity<input name="quantity" type="number" min="1" max="20" defaultValue="1" required /></label>
            <label>Preferred college / campus<input name="college" required maxLength={160} /></label>
            <label>Start date<input name="starts_on" type="date" required /></label>
            <label>Return date<input name="returns_on" type="date" required /></label>
            <label>Budget per day (₹)<input name="budget" type="number" min="0.01" step="0.01" required /></label>
            <label>Maximum total budget (₹)<input name="maximum" type="number" min="0.01" step="0.01" required /></label>
            <label>Pickup preference<input name="pickup" maxLength={200} /></label>
            <label className="rent-wide">Additional requirements<textarea name="requirements" maxLength={2000} /></label>
            <button className="btn btn-dark rent-wide" disabled={busy || loadingCategories || categories.length === 0}>{busy ? 'Posting…' : 'Post rental request'}</button>
          </div>
        </form>
      </section>
    </main>
  );
}
