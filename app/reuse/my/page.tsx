'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ReuseNav from '@/components/reuse-nav';
import { createClient } from '@/lib/supabase/client';

type Listing = {
  id: string;
  title: string;
  listing_type: 'sell' | 'free' | 'exchange' | 'rent';
  status: string;
  price_paise: number;
  available_quantity: number;
};
type RelatedListing = { id?: string; owner_id: string; title: string };
type Request = {
  id: string;
  listing_id: string;
  requester_id: string;
  quantity: number;
  message: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  completed_outcome: string | null;
  created_at: string;
  reuse_listings?: RelatedListing | RelatedListing[] | null;
};

const outcome: Record<Listing['listing_type'], string> = {
  sell: 'sold', free: 'given', exchange: 'exchanged', rent: 'rented',
};

export default function MyReuse() {
  const supabase = useMemo(() => createClient(), []);
  const [listings, setListings] = useState<Listing[]>([]);
  const [incoming, setIncoming] = useState<Request[]>([]);
  const [outgoing, setOutgoing] = useState<Request[]>([]);
  const [favorites, setFavorites] = useState<Array<{ id: string; title: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setError('');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setError(authError?.message ?? 'Sign in to view your Reuse activity.');
      setLoading(false);
      return;
    }
    const [listingResult, outgoingResult, favoriteResult] = await Promise.all([
      supabase.from('reuse_listings').select('id,title,listing_type,status,price_paise,available_quantity')
        .eq('owner_id', user.id).order('created_at', { ascending: false }),
      supabase.from('reuse_requests').select('id,listing_id,requester_id,quantity,message,starts_at,ends_at,status,completed_outcome,created_at,reuse_listings(owner_id,title)')
        .eq('requester_id', user.id).order('created_at', { ascending: false }),
      supabase.from('reuse_favorites').select('listing_id,reuse_listings(id,title)')
        .eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);
    const failed = [listingResult, outgoingResult, favoriteResult].find(result => result.error);
    if (failed?.error) setError(`Some activity could not be loaded: ${failed.error.message}`);
    const owned = (listingResult.data ?? []) as Listing[];
    setListings(owned);
    setOutgoing((outgoingResult.data ?? []) as Request[]);
    setFavorites((favoriteResult.data ?? []).flatMap(row => {
      const related = row.reuse_listings as unknown as RelatedListing | RelatedListing[] | null;
      const listing = Array.isArray(related) ? related[0] : related;
      return listing?.id ? [{ id: listing.id, title: listing.title }] : [];
    }));
    if (owned.length) {
      const { data: incomingRows, error: incomingError } = await supabase.from('reuse_requests')
        .select('id,listing_id,requester_id,quantity,message,starts_at,ends_at,status,completed_outcome,created_at')
        .in('listing_id', owned.map(item => item.id)).order('created_at', { ascending: false });
      if (incomingError) setError(`Incoming requests could not be loaded: ${incomingError.message}`);
      setIncoming((incomingRows ?? []) as Request[]);
    } else setIncoming([]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  async function act(requestId: string, action: string, listingType?: Listing['listing_type']) {
    setError('');
    setNotice('');
    setBusy(requestId);
    const { error: actionError } = await supabase.rpc('reuse_respond_to_request', {
      p_request_id: requestId,
      p_action: action,
      p_outcome: action === 'complete' && listingType ? outcome[listingType] : null,
    });
    if (actionError) setError(`Request could not be updated: ${actionError.message}`);
    else {
      setNotice(`Request ${action === 'complete' ? 'marked complete' : `${action}ed`}.`);
      await load();
    }
    setBusy('');
  }

  async function archiveListing(listingId: string) {
    setError('');
    setNotice('');
    setBusy(listingId);
    const { error: archiveError } = await supabase.rpc('reuse_owner_archive_listing', { p_listing_id: listingId });
    if (archiveError) setError(`Listing could not be archived: ${archiveError.message}`);
    else { setNotice('Listing archived.'); await load(); }
    setBusy('');
  }

  const titleById = new Map(listings.map(item => [item.id, item.title]));
  const listingById = new Map(listings.map(item => [item.id, item]));

  return (
    <main className="rent-page">
      <ReuseNav />
      <section className="rent-content">
        <p className="eyebrow">YOUR CAMPUS ACTIVITY</p><h1>My Reuse</h1>
        <p className="muted">Track listings, request decisions, and saved items. Reuse requests are not payments or confirmed transactions until the owner accepts.</p>
        {notice && <p className="rent-success" role="status">{notice}</p>}
        {error && <p className="rent-alert" role="alert">{error}</p>}
        {loading ? <div className="rent-grid">{[1, 2, 3].map(number => <div className="rent-skeleton" key={number} />)}</div> : <div className="rent-my-grid">
          <section className="rent-list-panel">
            <div className="rent-section-head"><h2>My listings</h2><Link href="/reuse/new">+ List an item</Link></div>
            {listings.length ? listings.map(item => <div className="rent-activity-row" key={item.id}>
              <div><b>{item.title}</b><small>Listing · {item.status.replaceAll('_', ' ')} · {item.available_quantity} available</small></div>
              <span><Link href={`/reuse/${item.id}`}>View</Link>{!['archived', 'sold_out'].includes(item.status) && <button className="rent-report" disabled={busy === item.id} onClick={() => void archiveListing(item.id)}>Archive</button>}</span>
            </div>) : <p className="rent-empty-inline">You have not listed an item yet.</p>}
          </section>
          <section className="rent-list-panel">
            <div className="rent-section-head"><h2>Requests I sent</h2><Link href="/reuse">Explore</Link></div>
            {outgoing.length ? outgoing.map(request => {
              const related = Array.isArray(request.reuse_listings) ? request.reuse_listings[0] : request.reuse_listings;
              return <article className="reuse-request-row" key={request.id}>
              <b>{titleById.get(request.listing_id) ?? related?.title ?? 'Campus listing'}</b>
              <small>{request.status} · {request.quantity} item(s) · {new Date(request.created_at).toLocaleDateString()}</small>
              {request.message && <p>{request.message}</p>}
              {request.starts_at && request.ends_at && <small>{new Date(request.starts_at).toLocaleDateString()} – {new Date(request.ends_at).toLocaleDateString()}</small>}
              {request.status === 'accepted' && <p className="rent-payment-note">The owner accepted your request. OUTS does not process a payment; coordinate handover details through messages.</p>}
              {['pending', 'accepted'].includes(request.status) && <button className="rent-report" disabled={busy === request.id} onClick={() => void act(request.id, 'cancel')}>Cancel request</button>}
              {related?.owner_id && <Link href={`/messages?with=${related.owner_id}&reuse=${request.listing_id}`}>Open conversation</Link>}
            </article>;
            }) : <p className="rent-empty-inline">You have not requested an item yet.</p>}
          </section>
          <section className="rent-list-panel rent-wide">
            <div className="rent-section-head"><h2>Incoming requests</h2><span>{incoming.length}</span></div>
            {incoming.length ? incoming.map(request => {
              const listing = listingById.get(request.listing_id);
              return <article className="reuse-request-row" key={request.id}>
                <b>{listing?.title ?? 'Your listing'}</b>
                <small>{request.status} · {request.quantity} item(s) · {new Date(request.created_at).toLocaleDateString()}</small>
                {request.message && <p>{request.message}</p>}
                {request.starts_at && request.ends_at && <small>{new Date(request.starts_at).toLocaleDateString()} – {new Date(request.ends_at).toLocaleDateString()}</small>}
                <div className="rent-actions">
                  {request.status === 'pending' && <><button className="btn btn-dark" disabled={busy === request.id} onClick={() => void act(request.id, 'accept')}>Accept</button><button className="btn btn-light" disabled={busy === request.id} onClick={() => void act(request.id, 'reject')}>Decline</button></>}
                  {request.status === 'accepted' && listing && <button className="btn btn-dark" disabled={busy === request.id} onClick={() => void act(request.id, 'complete', listing.listing_type)}>Mark {listing.listing_type === 'free' ? 'given away' : listing.listing_type === 'exchange' ? 'exchanged' : listing.listing_type === 'rent' ? 'rental complete' : 'sold'} </button>}
                  {listing && <Link className="btn btn-light" href={`/messages?with=${request.requester_id}&reuse=${listing.id}`}>Message requester</Link>}
                </div>
              </article>;
            }) : <p className="rent-empty-inline">No incoming requests yet.</p>}
          </section>
          <section className="rent-list-panel rent-wide">
            <div className="rent-section-head"><h2>Saved listings</h2></div>
            {favorites.length ? favorites.map(item => <div className="rent-activity-row" key={item.id}><b>{item.title}</b><Link href={`/reuse/${item.id}`}>View</Link></div>) : <p className="rent-empty-inline">Save listings to find them here later.</p>}
          </section>
        </div>}
      </section>
    </main>
  );
}
