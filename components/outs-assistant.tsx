'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, Send, Sparkles, X } from 'lucide-react';

type Result = { id: string; title: string; category: string; type: string; college: string; price_paise: number; price_label: string; href: string; description: string };
type Suggestion = { label: string; href: string };
type Message = { role: 'user' | 'assistant'; text: string; results?: Result[]; suggestions?: Suggestion[] };
const storageKey = 'outs-assistant-session-v1';
const starters = ['Find a calculator under ₹500', 'How do I sell an item?', 'How does Rent work?'];

export default function OutsAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([{
    role: 'assistant',
    text: 'I can help you navigate OUTS and search published Reuse and Rent listings from your verified campus. Results and prices come from listing records.',
  }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Message[];
        if (Array.isArray(parsed) && parsed.every(item => item && (item.role === 'user' || item.role === 'assistant') && typeof item.text === 'string')) {
          setMessages(parsed);
        }
      }
    } catch (storageError) {
      console.warn('OUTS assistant session history could not be restored:', storageError);
    }
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(messages.slice(-30))); }
    catch (storageError) { console.warn('OUTS assistant session history could not be saved:', storageError); }
  }, [messages]);

  async function send(event?: FormEvent, value = input) {
    event?.preventDefault();
    const question = value.trim();
    if (!question || busy) return;
    setInput('');
    setError('');
    setMessages(current => [...current, { role: 'user', text: question }]);
    setBusy(true);
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: question, context: pathname }),
      });
      const data = await response.json() as { error?: string; answer?: string; results?: Result[]; suggestions?: Suggestion[] };
      if (!response.ok) throw new Error(data.error ?? 'The OUTS assistant is unavailable.');
      setMessages(current => [...current, {
        role: 'assistant',
        text: data.answer ?? 'I could not answer that. Try another question.',
        results: data.results ?? [],
        suggestions: data.suggestions ?? [],
      }]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The OUTS assistant is unavailable.');
    } finally { setBusy(false); }
  }

  return <div className="outs-assistant">
    {open && <section className="outs-assistant-panel" aria-label="OUTS assistant">
      <header><span><Sparkles size={16} /> OUTS assistant</span><button aria-label="Close assistant" onClick={() => setOpen(false)}><X size={18} /></button></header>
      <div className="outs-assistant-messages" aria-live="polite">
        {messages.map((message, index) => <article className={`outs-assistant-message ${message.role}`} key={index}>
          <p>{message.text}</p>
          {message.results?.map(result => <Link className="outs-assistant-result" href={result.href} key={result.id}>
            <span><b>{result.title}</b><small>{result.category} · {result.type} · {result.college}</small><small>{result.description}</small></span><strong>{result.price_label}</strong>
          </Link>)}
          {message.suggestions?.length ? <div className="outs-assistant-links">{message.suggestions.map(item => <Link href={item.href} key={item.href}>{item.label}</Link>)}</div> : null}
        </article>)}
        {busy && <p className="outs-assistant-loading">Checking campus listings…</p>}
        {error && <p className="rent-alert" role="alert">{error}</p>}
      </div>
      {messages.length === 1 && <div className="outs-assistant-starters">{starters.map(item => <button key={item} onClick={() => void send(undefined, item)}>{item}</button>)}</div>}
      <form className="outs-assistant-form" onSubmit={event => void send(event)}>
        <input aria-label="Ask the OUTS assistant" maxLength={500} value={input} onChange={event => setInput(event.target.value)} placeholder="Ask about OUTS or campus listings" />
        <button aria-label="Send question" disabled={busy || !input.trim()}><Send size={16} /></button>
      </form>
      <small className="outs-assistant-foot">Inventory is database-backed. Requests need owner approval; Reuse does not process payments.</small>
    </section>}
    <button className="outs-assistant-toggle" aria-expanded={open} aria-label={open ? 'Close OUTS assistant' : 'Open OUTS assistant'} onClick={() => setOpen(!open)}>
      {open ? <X size={20} /> : <><MessageCircle size={19} /><span>Ask OUTS</span></>}
    </button>
  </div>;
}
