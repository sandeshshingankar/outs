'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ReuseNav from '@/components/reuse-nav';
import { createClient } from '@/lib/supabase/client';

type Listing = {
  id: string;
  title: string;
  description: string;
  category: string;
  listing_type: 'sell' | 'free' | 'exchange' | 'rent';
  item_condition: string;
  price_paise: number;
  available_quantity: number;
  exchange_for: string | null;
  college: string;
  created_at: string;
};

const typeLabels: Record<Listing['listing_type'], string> = {
  sell: 'For sale',
  free: 'Give away',
  exchange: 'Exchange',
  rent: 'Rent by request',
};

function priceLabel(item: Listing) {
  if (item.listing_type === 'free') return 'Free';
  if (item.listing_type === 'exchange') return 'Exchange';
  return `₹${(Number(item.price_paise) / 100).toLocaleString('en-IN')}${item.listing_type === 'rent' ? ' / day' : ''}`;
}

export default function ReuseExplore() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error: queryError } = await supabase.from('reuse_listings')
        .select('id,title,description,category,listing_type,item_condition,price_paise,available_quantity,exchange_for,college,created_at')
        .eq('status', 'published').gt('available_quantity', 0)
        .order('created_at', { ascending: false }).limit(100);
      if (!active) return;
      if (queryError) setError(`Reuse listings could not be loaded: ${queryError.message}`);
      setRows((data ?? []) as Listing[]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [supabase]);

  const categories = [...new Set(rows.map(item => item.category))].sort();
  const filtered = rows.filter(item => {
    const text = `${item.title} ${item.description} ${item.category} ${item.exchange_for ?? ''}`.toLowerCase();
    return (!search.trim() || text.includes(search.trim().toLowerCase()))
      && (!type || item.listing_type === type)
      && (!category || item.category === category);
  });

  return (
    <main className="rent-page">
      <ReuseNav />
      <section className="rent-hero">
        <div>
          <p className="eyebrow">OUTS REUSE</p>
          <h1>Pass useful things<br /><em>around campus.</em></h1>
          <p>Buy, give away, exchange, or request a rental from verified students at your college.</p>
          <div className="rent-actions"><Link className="btn btn-dark" href="/reuse/new">List an item</Link><Link className="btn btn-light" href="/reuse/my">My activity</Link></div>
        </div>
        <aside className="rent-note"><b>Safer campus handovers</b><p>Listings are reviewed before appearing in discovery. Requests are not payments or reservations until the owner accepts.</p><small>OUTS does not process payments, deposits, or seller payouts for Reuse. Arrange a handover through campus-approved public locations.</small></aside>
      </section>
      <section className="rent-content">
        <div className="rent-section-head"><div><p className="eyebrow">VERIFIED CAMPUS LISTINGS</p><h2>Explore Reuse</h2></div><span>{filtered.length} items</span></div>
        <div className="rent-filters">
          <input aria-label="Search reuse listings" placeholder="Search items and categories" value={search} onChange={event => setSearch(event.target.value)} />
          <select aria-label="Listing type" value={type} onChange={event => setType(event.target.value)}><option value="">All ways to reuse</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select aria-label="Category" value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select>
        </div>
        {error && <p className="rent-alert" role="alert">{error}</p>}
        {loading ? <div className="rent-grid">{[1, 2, 3].map(number => <div className="rent-skeleton" key={number} />)}</div>
          : filtered.length ? <div className="rent-grid">{filtered.map(item => <Link className="rent-card" href={`/reuse/${item.id}`} key={item.id}>
            <div className="rent-card-art">{item.category}</div>
            <div className="rent-card-body">
              <div className="rent-tags"><span>{typeLabels[item.listing_type]}</span><span>{item.item_condition.replace('_', ' ')}</span></div>
              <h3>{item.title}</h3><p>{item.description}</p>
              <div className="rent-card-foot"><b>{priceLabel(item)}</b><span>{item.available_quantity} available</span></div>
            </div>
          </Link>)}</div>
          : <div className="rent-empty"><h3>No matching listings yet</h3><p>Try a different search or list an item your campus could use.</p><Link className="btn btn-light" href="/reuse/new">Create a listing</Link></div>}
      </section>
    </main>
  );
}
