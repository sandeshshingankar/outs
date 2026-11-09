'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import SponsoredAds from '@/components/sponsored-ads';

type Task = {
  id: string;
  title: string;
  description: string;
  category: string;
  budget: number;
  deadline_at: string | null;
};

export default function Tasks() {
  const supabase = useMemo(() => createClient(), []);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadTasks() {
      const { data, error: taskError } = await supabase.from('tasks')
        .select('id,title,description,category,budget,deadline_at')
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      if (!active) return;
      if (taskError) setError(`Could not load tasks: ${taskError.message}`);
      else setTasks((data ?? []) as Task[]);
      setLoading(false);
    }
    void loadTasks();
    return () => { active = false; };
  }, [supabase]);

  const categories = [...new Set(tasks.map((task) => task.category))].sort();
  const filtered = tasks.filter((task) =>
    (category === 'All categories' || task.category === category)
    && `${task.title} ${task.description} ${task.category}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <main className="form-page">
      <Link href="/dashboard" className="back-link"><ArrowLeft size={16} /> Dashboard</Link>
      <div className="list-heading">
        <p className="eyebrow">OUTS MARKETPLACE</p>
        <h1>Explore opportunities</h1>
        <p className="muted">Find tasks where you can contribute and build your skills.</p>
        <label className="search-box wide"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks, categories or skills" /></label>
        <label className="filter-field">Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option>All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      {error && <p className="notice account-error" role="alert">{error}</p>}
      <SponsoredAds />
      {loading ? <p className="empty-state">Loading tasks…</p> : (
        <div className="market-grid">
          {filtered.map((task) => (
            <article className="task-card" key={task.id}>
              <span className="task-category">{task.category}</span>
              <h3>{task.title}</h3>
              <p>{task.description.slice(0, 130)}{task.description.length > 130 ? '…' : ''}</p>
              <div className="market-foot"><b>₹{Number(task.budget).toLocaleString('en-IN')}</b><Link href={`/tasks/${task.id}`}>View task →</Link></div>
            </article>
          ))}
          {!filtered.length && <div className="empty-state">{tasks.length ? 'No matching tasks found.' : 'No open tasks are available yet.'}</div>}
        </div>
      )}
    </main>
  );
}
