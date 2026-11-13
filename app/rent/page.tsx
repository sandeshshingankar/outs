'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import RentNav from '@/components/rent-nav';
import { createClient } from '@/lib/supabase/client';

type Listing = {
  id: string; title: string; subcategory: string; description: string;
  daily_price_paise: number; deposit_paise: number; condition: string;
  college: string; pickup_point: string; available_from: string;
  available_until: string; availability_status: string; created_at: string;
  image_url?: string; rent_categories?: { name: string } | null;
};
type Category = { id: string; name: string };
type ListingWithImages = Listing & {
  rent_listing_images?: Array<{ storage_path: string; sort_order: number; is_ownership_proof: boolean }>;
};

export default function RentExplore() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Listing[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryError, setCategoryError] = useState('');
  const [listingError, setListingError] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [condition, setCondition] = useState('');
  const [sort, setSort] = useState('newest');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [{ data: { user } }, categoryResult, listingResult] = await Promise.all([
          supabase.auth.getUser(),
          supabase.from('rent_categories').select('id,name').eq('is_active', true).order('sort_order'),
          supabase.from('rent_listings')
            .select('id,title,subcategory,description,daily_price_paise,deposit_paise,condition,college,pickup_point,available_from,available_until,availability_status,created_at,rent_categories(name),rent_listing_images(storage_path,sort_order,is_ownership_proof)')
            .eq('status', 'published').order('created_at', { ascending: false }).limit(60),
        ]);
        if (!active) return;
        setSignedIn(Boolean(user));
        if (categoryResult.error) setCategoryError(categoryResult.error.message);
        else setCats(categoryResult.data ?? []);
        if (listingResult.error) setListingError(listingResult.error.message);
        else {
          const data = (listingResult.data ?? []) as unknown as ListingWithImages[];
          setRows(data.map(row => {
            const image = row.rent_listing_images?.filter(item => !item.is_ownership_proof)
              .sort((a, b) => a.sort_order - b.sort_order)[0];
            return {
              ...row,
              image_url: image
                ? supabase.storage.from('outs-rent-images').getPublicUrl(image.storage_path).data.publicUrl
                : undefined,
            };
          }));
        }
      } catch (loadError) {
        if (active) setListingError(loadError instanceof Error ? loadError.message : 'Could not load rental data.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [supabase]);

  const maxPricePaise = maxPrice.trim() && Number.isFinite(Number(maxPrice)) ? Number(maxPrice) * 100 : null;
  const filtered = rows.filter(item => item.availability_status === 'available'
    && (!search || `${item.title} ${item.subcategory} ${item.description} ${item.rent_categories?.name ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()))
    && (!category || cats.find(cat => cat.id === category)?.name === item.rent_categories?.name)
    && (maxPricePaise === null || item.daily_price_paise <= maxPricePaise)
    && (!condition || item.condition === condition));
  const sorted = [...filtered].sort((a, b) => sort === 'price-low'
    ? a.daily_price_paise - b.daily_price_paise
    : sort === 'price-high' ? b.daily_price_paise - a.daily_price_paise
      : new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const clearFilters = () => { setSearch(''); setCategory(''); setMaxPrice(''); setCondition(''); setSort('newest'); };

  return (
    <main className="rent-page">
      <RentNav />
      <section className="rent-hero">
        <div>
          <p className="eyebrow">CAMPUS RENTALS, MADE SIMPLE</p>
          <h1>Rent what you need.<br /><em>Earn from what you own.</em></h1>
          <p>Borrow useful things from verified students in your college community, with clear rental terms before you request.</p>
          <div className="rent-actions">
            <Link className="btn btn-dark" href="/rent/list">List an item</Link>
            <Link className="btn btn-light" href="/rent/requests/new">Request an item</Link>
            <Link className="btn btn-light" href="/rent/assistant">Ask Rent Assistant</Link>
          </div>
        </div>
        <aside className="rent-note">
          <b>Student to student</b>
          <p>Booking requests require owner approval. Eligible approved bookings can use PayPal Sandbox checkout for rent.</p>
          <small>Sandbox is not real-money payment. Deposits and seller payouts are not supported.</small>
        </aside>
      </section>

      <section className="rent-content">
        <div className="rent-section-head">
          <div><p className="eyebrow">THE CAMPUS MARKETPLACE</p><h2>Explore rentals</h2></div>
          <span>{sorted.length} items</span>
        </div>
        <div className="rent-filters">
          <input aria-label="Search rentals" placeholder="Search items" value={search} onChange={event => setSearch(event.target.value)} />
          <select aria-label="Category" value={category} onChange={event => setCategory(event.target.value)} disabled={Boolean(categoryError)}>
            <option value="">All categories</option>
            {cats.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <input aria-label="Maximum daily price" type="number" min="0" placeholder="Max ₹ / day" value={maxPrice} onChange={event => setMaxPrice(event.target.value)} />
          <select aria-label="Condition" value={condition} onChange={event => setCondition(event.target.value)}>
            <option value="">Any condition</option><option value="new">New</option><option value="like_new">Like new</option><option value="good">Good</option><option value="fair">Fair</option>
          </select>
          <select aria-label="Sort rentals" value={sort} onChange={event => setSort(event.target.value)}>
            <option value="newest">Newest first</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option>
          </select>
          <button className="btn btn-light" type="button" onClick={clearFilters}>Clear filters</button>
        </div>
        {categoryError && <div role="alert" className="rent-alert">Rental categories could not load. Apply the latest OUTS Rent category migration. Details: {categoryError}</div>}
        {listingError && <div role="alert" className="rent-alert">Rental listings could not load. Details: {listingError}</div>}
        {loading ? <div className="rent-grid">{[1, 2, 3].map(number => <div className="rent-skeleton" key={number} />)}</div>
          : sorted.length ? <div className="rent-grid">{sorted.map(item => (
            <Link className="rent-card" href={`/rent/${item.id}`} key={item.id}>
              <div className="rent-card-art">{item.image_url ? <Image src={item.image_url} alt={item.title} width={480} height={300} unoptimized /> : item.rent_categories?.name ?? 'OUTS Rent'}</div>
              <div className="rent-card-body">
                <div className="rent-tags"><span>{item.condition.replace('_', ' ')}</span><span>{item.college}</span></div>
                <h3>{item.title}</h3><p>{item.description}</p>
                <small>{item.available_from} – {item.available_until}</small>
                <div className="rent-card-foot"><b>₹{(item.daily_price_paise / 100).toLocaleString('en-IN')} <small>/ day</small></b><span>Deposit ₹{(item.deposit_paise / 100).toLocaleString('en-IN')}</span></div>
              </div>
            </Link>
          ))}</div> : <div className="rent-empty">
            <h3>No rentals available yet</h3>
            <p>{!signedIn
              ? 'Sign in with your verified college account to explore listings available to your campus.'
              : 'There are no published listings available for your verified college yet. Listings appear after owner submission and admin approval.'}</p>
            <div className="rent-actions"><Link className="btn btn-dark" href="/rent/requests/new">Request an item</Link><Link className="btn btn-light" href="/rent/list">List an item</Link></div>
          </div>}
      </section>
    </main>
  );
}
