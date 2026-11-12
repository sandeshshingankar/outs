'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import RentNav from '@/components/rent-nav';
import { createClient } from '@/lib/supabase/client';
import RentPayPalCheckout from '@/components/rent-paypal-checkout';

type Row = {
  id: string;
  title?: string;
  item_name?: string;
  status: string;
  payment_status?: string;
  rental_paise?: number;
  created_at: string;
  listing_id?: string;
  starts_at?: string;
  ends_at?: string;
  renter_id?: string;
  owner_id?: string;
};

export default function MyRent() {
  const supabase = useMemo(() => createClient(), []);
  const [listings, setListings] = useState<Row[]>([]);
  const [requests, setRequests] = useState<Row[]>([]);
  const [bookings, setBookings] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Sign in to view your Rent activity.');
      setLoading(false);
      return;
    }

    setUserId(user.id);
    const [listingResult, requestResult, bookingResult] = await Promise.all([
      supabase.from('rent_listings').select('id,title,status,created_at').eq('owner_id', user.id).order('created_at', { ascending: false }),
      supabase.from('rent_requests').select('id,item_name,status,created_at').eq('requester_id', user.id).order('created_at', { ascending: false }),
      supabase.from('rent_bookings').select('id,listing_id,status,payment_status,rental_paise,created_at,starts_at,ends_at,renter_id,owner_id').or(`renter_id.eq.${user.id},owner_id.eq.${user.id}`).order('created_at', { ascending: false }),
    ]);
    const failed = [listingResult, requestResult, bookingResult].find(result => result.error);
    if (failed?.error) setError(failed.error.message);
    setListings(listingResult.data ?? []);
    setRequests(requestResult.data ?? []);
    const bookingRows = bookingResult.data ?? [];
    const listingIds = [...new Set(bookingRows.map(booking => booking.listing_id).filter(Boolean))];
    if (listingIds.length) {
      const { data: bookingListings, error: bookingListingsError } = await supabase
        .from('rent_listings').select('id,title').in('id', listingIds);
      if (bookingListingsError) setError(bookingListingsError.message);
      const titles = new Map((bookingListings ?? []).map(listing => [listing.id, listing.title]));
      setBookings(bookingRows.map(booking => ({ ...booking, title: titles.get(booking.listing_id) })));
    } else {
      setBookings(bookingRows);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
    const params = new URLSearchParams(window.location.search);
    if (params.get('created')) setNotice('Listing submitted for approval.');
    if (params.get('request')) setNotice('Your request is posted and open for offers.');
  }, [load]);

  const handlePaymentComplete = useCallback(async () => {
    setNotice('PayPal Sandbox payment verified and booking confirmed. This is not real-money payment; no deposit or seller payout was processed.');
    await load();
  }, [load]);

  async function bookingAction(id: string, action: string) {
    setError('');
    setBusy(id);
    const { error: actionError } = await supabase.rpc('rent_booking_action', {
      p_booking_id: id,
      p_action: action,
    });
    if (actionError) setError(actionError.message);
    else {
      setNotice(`Booking ${action} recorded.`);
      await load();
    }
    setBusy('');
  }

  return (
    <main className="rent-page">
      <RentNav />
      <section className="rent-content">
        <p className="eyebrow">YOUR RENT ACTIVITY</p>
        <h1>My Rent</h1>
        <p className="muted">Track your listings, requests, and booking decisions. Booking requests require owner approval. Eligible approved bookings can use PayPal Sandbox for rent only; Sandbox is not real-money payment, and deposits and seller payouts are not supported.</p>
        {notice && <p className="rent-success" role="status">{notice}</p>}
        {error && <p className="rent-alert" role="alert">Could not load some Rent activity: {error}</p>}

        {loading ? <div className="rent-grid">{[1, 2, 3].map(number => <div className="rent-skeleton" key={number} />)}</div> : (
          <div className="rent-my-grid">
            <section className="rent-list-panel">
              <div className="rent-section-head"><h2>My listings</h2><Link href="/rent/list">+ List item</Link></div>
              {listings.length ? listings.map(listing => (
                <div className="rent-activity-row" key={listing.id}>
                  <div><b>{listing.title}</b><small>Listing · {listing.status.replace('_', ' ')}</small></div>
                  <Link href={`/rent/${listing.id}`}>View</Link>
                </div>
              )) : <p className="rent-empty-inline">You haven’t listed an item yet.</p>}
            </section>

            <section className="rent-list-panel">
              <div className="rent-section-head"><h2>My requests</h2><Link href="/rent/requests/new">+ Request</Link></div>
              {requests.length ? requests.map(request => (
                <div className="rent-activity-row" key={request.id}>
                  <div><b>{request.item_name}</b><small>Request · {request.status.replace('_', ' ')}</small></div>
                  <Link href="/rent/requests">Offers</Link>
                </div>
              )) : <p className="rent-empty-inline">No item requests yet.</p>}
            </section>

            <section className="rent-list-panel rent-wide">
              <div className="rent-section-head"><h2>My bookings and rentals</h2></div>
              {bookings.length ? bookings.map(booking => (
                <div className="rent-activity-row" key={booking.id}>
                  <div>
                    <b>{booking.title || 'Rental booking'} · {booking.id.slice(0, 8)}</b>
                    <small>{booking.starts_at ? new Date(booking.starts_at).toLocaleString() : 'Start date unavailable'} – {booking.ends_at ? new Date(booking.ends_at).toLocaleString() : 'End date unavailable'}</small>
                    {booking.rental_paise !== undefined && <small>Rent: ₹{(booking.rental_paise / 100).toLocaleString('en-IN')} · Deposit not collected</small>}
                  </div>
                  <div>
                    <span className="rent-chip">{booking.status.replaceAll('_', ' ')}</span>
                    {booking.status === 'requested' && booking.owner_id === userId && (
                      <div className="task-actions">
                        <button disabled={busy === booking.id} onClick={() => void bookingAction(booking.id, 'approve')}>Approve</button>
                        <button disabled={busy === booking.id} onClick={() => void bookingAction(booking.id, 'reject')}>Reject</button>
                      </div>
                    )}
                    {['requested', 'owner_approved'].includes(booking.status) && booking.renter_id === userId && (
                      <div className="task-actions">
                        <button disabled={busy === booking.id} onClick={() => void bookingAction(booking.id, 'cancel')}>Cancel</button>
                      </div>
                    )}
                    {booking.status === 'requested' && booking.renter_id === userId && <small>Waiting for owner approval before checkout is available.</small>}
                    {['owner_approved', 'payment_pending'].includes(booking.status) && booking.renter_id === userId && booking.payment_status !== 'paid' && (
                      <RentPayPalCheckout bookingId={booking.id} amountPaise={booking.rental_paise ?? 0} onComplete={handlePaymentComplete} />
                    )}
                    {booking.payment_status === 'paid' && <small>PayPal Sandbox payment verified · test transaction only; no deposit or seller payout.</small>}
                  </div>
                </div>
              )) : <p className="rent-empty-inline">No bookings yet. Browse campus listings to get started.</p>}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
