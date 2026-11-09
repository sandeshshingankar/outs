'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, UploadCloud } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const categories = ['Assignments guidance', 'Coding & Development', 'Notes & Study Material',
  'Presentation & Design', 'Mini Projects', 'Research & Documentation', 'Tutoring', 'Other'];

export default function NewTask() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [budget, setBudget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadUser() {
      const { data, error } = await supabase.auth.getUser();
      if (!active) return;
      if (error || !data.user) { router.replace('/auth?next=/tasks/new'); return; }
      setUser(data.user);
    }
    void loadUser();
    return () => { active = false; };
  }, [router, supabase]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    if (title.trim().length < 5 || description.trim().length < 20 || !Number.isFinite(Number(budget)) || Number(budget) <= 0) {
      setError('Enter a title, description, and positive task budget.');
      return;
    }
    setBusy(true);
    setNotice('');
    setError('');
    const { data, error } = await supabase.from('tasks').insert({
      provider_id: user.id, title: title.trim(), description: description.trim(), category, budget: Number(budget),
      deadline_at: deadline ? new Date(deadline).toISOString() : null, status: 'open',
    }).select('id').single();
    if (error) { setNotice(error.message); setBusy(false); return; }
    router.push(`/tasks/${data.id}`);
  }

  return (
    <main className="form-page">
      <Link href="/dashboard" className="back-link"><ArrowLeft size={16} /> Back to dashboard</Link>
      <section className="form-card">
        <p className="eyebrow">CREATE AN OPPORTUNITY</p>
        <h1>Post a task</h1>
        <p className="muted">Explain what you need. Students can contact you and apply to help.</p>
        <form className="task-form" onSubmit={submit}>
          <label>Task title
            <input required minLength={5} maxLength={140} value={title}
              onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Need guidance with a React project" />
          </label>
          <label>Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>Description
            <textarea required minLength={20} maxLength={10000} rows={6} value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the task, expected outcome, skills needed and any important details…" />
          </label>
          <div className="form-two">
            <label>Budget (₹)
              <input type="number" min="1" step="1" required value={budget}
                onChange={(e) => setBudget(e.target.value)} placeholder="500" />
            </label>
            <label>Deadline (optional)
              <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
          </div>
          <div className="integrity-note">
            <UploadCloud />
            <p><b>Keep it ethical</b><br />
              Post requests for tutoring, mentoring, proofreading, formatting or legitimate collaboration.
              Do not request exam cheating, impersonation or plagiarised work.
            </p>
          </div>
          <button className="btn btn-dark auth-submit" disabled={busy || !user}>
            {busy ? 'Publishing…' : 'Publish task'}
          </button>
          {notice && <p className="notice" role="status">{notice}</p>}
          {error && <p className="notice account-error" role="alert">{error}</p>}
        </form>
      </section>
    </main>
  );
}
