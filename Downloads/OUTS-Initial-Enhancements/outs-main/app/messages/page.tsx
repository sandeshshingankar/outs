'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MessageCircle, Send } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

type Conversation = {
  id: string;
  listing_id: string | null;
  task_id: string | null;
  learning_service_id: string | null;
  provider_id: string;
  performer_id: string;
  created_at: string;
  title: string;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type ProfileName = { id: string; full_name: string | null; college: string | null };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function MessagesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [names, setNames] = useState<Record<string, ProfileName>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadConversations = useCallback(async (currentUser: User) => {
    const { data, error: conversationError } = await supabase.from('conversations')
      .select('id,listing_id,task_id,learning_service_id,provider_id,performer_id,created_at')
      .or(`provider_id.eq.${currentUser.id},performer_id.eq.${currentUser.id}`)
      .order('created_at', { ascending: false });
    if (conversationError) {
      setError(`Could not load conversations: ${conversationError.message}`);
      return;
    }

    const rows = data ?? [];
    const peerIds = [...new Set(rows.map((row) => row.provider_id === currentUser.id ? row.performer_id : row.provider_id))];
    const taskIds = [...new Set(rows.flatMap((row) => row.task_id ? [row.task_id] : []))];
    const serviceIds = [...new Set(rows.flatMap((row) => row.learning_service_id ? [row.learning_service_id] : []))];
    const listingIds = [...new Set(rows.flatMap((row) => row.listing_id ? [row.listing_id] : []))];
    const [profileResult, taskResult, serviceResult, listingResult] = await Promise.all([
      peerIds.length ? supabase.from('profiles').select('id,full_name,college').in('id', peerIds) : Promise.resolve({ data: [], error: null }),
      taskIds.length ? supabase.from('tasks').select('id,title').in('id', taskIds) : Promise.resolve({ data: [], error: null }),
      serviceIds.length ? supabase.from('learning_services').select('id,title').in('id', serviceIds) : Promise.resolve({ data: [], error: null }),
      listingIds.length ? supabase.from('listings').select('id,title').in('id', listingIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (profileResult.error) setError(`Could not load conversation profiles: ${profileResult.error.message}`);
    else setNames(Object.fromEntries((profileResult.data ?? []).map((profile) => [profile.id, profile as ProfileName])));
    if (taskResult.error) setError(`Could not load task conversation titles: ${taskResult.error.message}`);
    if (serviceResult.error) setError(`Could not load teaching conversation titles: ${serviceResult.error.message}`);
    if (listingResult.error) setError(`Could not load listing conversation titles: ${listingResult.error.message}`);
    const titles = new Map<string, string>();
    (taskResult.data ?? []).forEach((task) => titles.set(task.id, task.title));
    (serviceResult.data ?? []).forEach((service) => titles.set(service.id, service.title));
    (listingResult.data ?? []).forEach((listing) => titles.set(listing.id, listing.title));
    setConversations(rows.map((row) => ({
      ...row,
      title: (row.listing_id && titles.get(row.listing_id))
        || (row.task_id && titles.get(row.task_id))
        || (row.learning_service_id && titles.get(row.learning_service_id))
        || 'OUTS conversation',
    })));
  }, [supabase]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !currentUser) {
        setError(authError?.message ?? 'Sign in to view your conversations.');
        setLoading(false);
        return;
      }
      setUser(currentUser);
      const params = new URLSearchParams(window.location.search);
      const peerId = params.get('with');
      const taskId = params.get('task');
      const serviceId = params.get('service');
      if (peerId && uuidPattern.test(peerId) && peerId !== currentUser.id) {
        let contextValid = false;
        if (taskId && uuidPattern.test(taskId)) {
          const { data: task, error: taskError } = await supabase.from('tasks')
            .select('id,provider_id').eq('id', taskId).maybeSingle();
          if (taskError) setError(`Could not verify the task conversation: ${taskError.message}`);
          else if (task?.provider_id === currentUser.id || task?.provider_id === peerId) {
            const applicantId = task.provider_id === currentUser.id ? peerId : currentUser.id;
            const { data: application, error: applicationError } = await supabase.from('applications')
              .select('id').eq('task_id', taskId).eq('applicant_id', applicantId).maybeSingle();
            if (applicationError) setError(`Could not verify the task application: ${applicationError.message}`);
            else contextValid = Boolean(application);
          }
        } else if (serviceId && uuidPattern.test(serviceId)) {
          const { data: service, error: serviceError } = await supabase.from('learning_services')
            .select('id,provider_id,status').eq('id', serviceId).maybeSingle();
          if (serviceError) setError(`Could not verify the teaching service: ${serviceError.message}`);
          else if (service?.status === 'active' && service.provider_id === peerId) {
            contextValid = true;
          } else if (service?.status === 'active' && service.provider_id === currentUser.id) {
            const { data: request, error: requestError } = await supabase.from('teaching_session_requests')
              .select('id').eq('service_id', serviceId).eq('provider_id', currentUser.id)
              .eq('student_id', peerId).in('status', ['requested', 'accepted', 'scheduled', 'completed']).maybeSingle();
            if (requestError) setError(`Could not verify the teaching request: ${requestError.message}`);
            else contextValid = Boolean(request);
          }
        }
        if (!contextValid) {
          setError('A conversation can only be started from an active teaching service or a task application.');
        } else {
          const providerId = serviceId
            ? (await supabase.from('learning_services').select('provider_id').eq('id', serviceId).single()).data?.provider_id
            : taskId ? (await supabase.from('tasks').select('provider_id').eq('id', taskId).single()).data?.provider_id : '';
          const performerId = providerId === currentUser.id ? peerId : currentUser.id;
          const context = serviceId ? 'learning_service_id' : 'task_id';
          const contextId = serviceId ?? taskId!;
          const lookup = supabase.from('conversations').select('id').eq(context, contextId)
            .eq('provider_id', providerId).eq('performer_id', performerId).maybeSingle();
          const { data: existing, error: lookupError } = await lookup;
          if (lookupError) setError(`Could not check for an existing conversation: ${lookupError.message}`);
          else if (existing) setSelectedId(existing.id);
          else {
            const { data: created, error: createError } = await supabase.from('conversations')
              .insert({
                listing_id: null,
                provider_id: providerId,
                performer_id: performerId,
                task_id: taskId,
                learning_service_id: serviceId,
              })
              .select('id')
              .single();
            if (createError) setError(`Could not start the conversation: ${createError.message}`);
            else setSelectedId(created.id);
          }
        }
      } else if (peerId) {
        setError('The conversation link is invalid.');
      }
      await loadConversations(currentUser);
      if (active) setLoading(false);
    }
    void initialize();
    return () => { active = false; };
  }, [loadConversations, supabase]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    async function loadMessages() {
      const { data, error: messageError } = await supabase.from('messages')
        .select('id,conversation_id,sender_id,body,created_at')
        .eq('conversation_id', selectedId)
        .order('created_at', { ascending: true });
      if (!active) return;
      if (messageError) setError(`Could not load messages: ${messageError.message}`);
      else setMessages((data ?? []) as Message[]);
    }
    void loadMessages();
    const channel = supabase.channel(`conversation:${selectedId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${selectedId}`,
      }, (payload) => {
        const newMessage = payload.new as Message;
        setMessages((current) => current.some((message) => message.id === newMessage.id)
          ? current
          : [...current, newMessage]);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError('Realtime messaging is unavailable. Reload the conversation to check for new messages.');
        }
      });
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [selectedId, supabase]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!user || !selectedId || !trimmed || trimmed.length > 5000) return;
    setBusy(true);
    setError('');
    const { error: sendError } = await supabase.from('messages').insert({
      conversation_id: selectedId,
      sender_id: user.id,
      body: trimmed,
    });
    if (sendError) setError(`Could not send message: ${sendError.message}`);
    else setBody('');
    setBusy(false);
  }

  const selected = conversations.find((conversation) => conversation.id === selectedId);
  const peerId = selected && user
    ? selected.provider_id === user.id ? selected.performer_id : selected.provider_id
    : '';
  const peer = peerId ? names[peerId] : null;

  return (
    <main className="form-page messages-page">
      <Link href="/dashboard" className="back-link"><ArrowLeft size={16} /> Dashboard</Link>
      <header className="list-heading"><p className="eyebrow">MESSAGES</p><h1>Your conversations</h1><p className="muted">Task and teaching conversations are private to their participants.</p></header>
      {error && <p className="notice account-error" role="alert">{error}</p>}
      <div className="conversation-layout">
        <aside className="conversation-list" aria-label="Conversation list">
          {loading && <p className="empty-state">Loading conversations…</p>}
          {!loading && conversations.map((conversation) => {
            const otherId = conversation.provider_id === user?.id ? conversation.performer_id : conversation.provider_id;
            const other = names[otherId];
            return <button className={selectedId === conversation.id ? 'conversation-item selected' : 'conversation-item'} key={conversation.id} onClick={() => setSelectedId(conversation.id)}>
              <b>{other?.full_name || 'OUTS member'}</b><small>{conversation.title}</small><small>{other?.college || 'Student'}</small>
            </button>;
          })}
          {!loading && !conversations.length && <p className="empty-state">No conversations yet. Contact a teacher from an active service or apply to a task.</p>}
        </aside>
        <section className="conversation-panel">
          {selectedId ? <>
            <header className="conversation-header"><MessageCircle /><div><b>{peer?.full_name || 'OUTS member'}</b><small>{selected?.title}</small></div></header>
            <div className="message-list" aria-live="polite">
              {messages.map((message) => <article className={message.sender_id === user?.id ? 'message-bubble mine' : 'message-bubble'} key={message.id}>
                <p>{message.body}</p><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time>
              </article>)}
              {!messages.length && <p className="empty-state">Start the conversation with a message.</p>}
            </div>
            <form className="message-compose" onSubmit={sendMessage}>
              <label className="sr-only" htmlFor="message-body">Message</label>
              <textarea id="message-body" rows={2} maxLength={5000} required value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a message…" />
              <button className="btn btn-dark" disabled={busy || !body.trim()}><Send size={15} />{busy ? 'Sending…' : 'Send'}</button>
            </form>
          </> : <div className="conversation-placeholder"><MessageCircle /><p>Select a conversation to view messages.</p></div>}
        </section>
      </div>
    </main>
  );
}
