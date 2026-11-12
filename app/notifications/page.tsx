'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { normalizeNotifications, type NotificationItem } from '@/lib/notifications';
type NotificationPreferences = { applications: boolean; messages: boolean; teaching: boolean; tasks: boolean; reuse: boolean; advertisements: boolean; payments: boolean; account: boolean };
const defaultPreferences: NotificationPreferences = { applications: true, messages: true, teaching: true, tasks: true, reuse: true, advertisements: true, payments: true, account: true };

function safeInternalLink(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : null;
}

export default function NotificationsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState('');
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [savingPreference, setSavingPreference] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        if (active) { setError(authError?.message ?? 'Sign in to view notifications.'); setLoading(false); }
        return;
      }
      setUserId(user.id);
      const { data, error: queryError } = await supabase.from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (!active) return;
      if (queryError) setError(`Could not load notifications: ${queryError.message}`);
      else {
        try {
          setItems(normalizeNotifications((data ?? []) as Record<string, unknown>[]));
        } catch (schemaError) {
          setError(schemaError instanceof Error ? schemaError.message : 'The notifications schema is not supported.');
        }
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [supabase]);

  useEffect(() => {
    if (!userId) return;
    void (async () => {
      const { data, error: preferenceError } = await supabase.from('notification_preferences')
        .select('applications,messages,teaching,tasks,reuse,advertisements,payments,account').eq('user_id',userId).maybeSingle();
      if (preferenceError) setError(`Could not load notification preferences: ${preferenceError.message}`);
      else if (data) setPreferences(data as NotificationPreferences);
      setPreferencesReady(true);
    })();
  }, [supabase,userId]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`notifications:${userId}`).on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}`,
    }, (payload) => {
      try {
        const [item] = normalizeNotifications([payload.new as Record<string, unknown>]);
        setItems((current) => current.some((row) => row.id === item.id) ? current : [item, ...current]);
      } catch (notificationError) { setError(notificationError instanceof Error ? notificationError.message : 'Notification update failed.'); }
    }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase,userId]);

  async function updatePreference(key: keyof NotificationPreferences, value: boolean) {
    if (!userId || !preferencesReady) return;
    setSavingPreference(key); setError('');
    const { data: existing, error: lookupError } = await supabase.from('notification_preferences').select('user_id').eq('user_id',userId).maybeSingle();
    if (lookupError) { setError(`Could not save preference: ${lookupError.message}`); setSavingPreference(''); return; }
    const result = existing
      ? await supabase.from('notification_preferences').update({ [key]: value, updated_at: new Date().toISOString() }).eq('user_id',userId)
      : await supabase.from('notification_preferences').insert({ ...defaultPreferences, [key]: value, user_id: userId });
    if (result.error) setError(`Could not save preference: ${result.error.message}`);
    else setPreferences((current) => ({ ...current, [key]: value }));
    setSavingPreference('');
  }

  async function markRead(id: string) {
    setError('');
    const notification = items.find((item) => item.id === id);
    if (!notification) return;
    const value = notification.readColumn === 'read_at' ? new Date().toISOString() : true;
    const { error: updateError } = await supabase.from('notifications')
      .update({ [notification.readColumn]: value }).eq('id', id);
    if (updateError) setError(`Could not mark notification as read: ${updateError.message}`);
    else setItems((current) => current.map((item) => item.id === id ? { ...item, isRead: true } : item));
  }

  return <main className="form-page">
    <Link href="/dashboard" className="back-link"><ArrowLeft size={16} /> Dashboard</Link>
    <header className="list-heading"><p className="eyebrow">YOUR UPDATES</p><h1>Notifications</h1><p className="muted">Marketplace and conversation updates for your account.</p></header>
    {error && <p className="notice account-error" role="alert">{error}</p>}
    <section className="panel notification-preferences"><h2>Notification preferences</h2><p className="muted">Choose which in-app updates you receive.</p><div className="preference-grid">{([
      ['applications','Task applications'],['tasks','Task progress'],['messages','New messages'],['teaching','Teaching requests'],['reuse','Reuse requests'],['advertisements','Advertisement reviews'],['payments','Payment updates'],['account','Account updates'],
    ] as Array<[keyof NotificationPreferences,string]>).map(([key,label]) => <label key={key}><input type="checkbox" checked={preferences[key]} disabled={!preferencesReady || savingPreference === key} onChange={(event) => void updatePreference(key,event.target.checked)} />{label}</label>)}</div></section>
    <section className="notification-list" aria-label="Notifications">
      {loading && <p className="empty-state">Loading notifications…</p>}
      {!loading && items.map((item) => {
        const href = safeInternalLink(item.link);
        return <article className={item.isRead ? 'notification-item' : 'notification-item unread'} key={item.id}>
          <span className="notification-icon"><Bell size={17} /></span>
          <div className="notification-content"><b>{item.title}</b>{item.body && <p>{item.body}</p>}<time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
            <div className="notification-actions">{href && <Link href={href}>Open update</Link>}{!item.isRead && <button type="button" onClick={() => markRead(item.id)}><Check size={14} /> Mark as read</button>}</div>
          </div>
          {!item.isRead && <span className="unread-dot" aria-label="Unread" />}
        </article>;
      })}
      {!loading && !items.length && !error && <p className="empty-state">You are all caught up.</p>}
    </section>
  </main>;
}
