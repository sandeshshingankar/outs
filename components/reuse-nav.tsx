import Link from 'next/link';

export default function ReuseNav() {
  return (
    <header className="rent-nav">
      <Link href="/reuse" className="brand"><span className="brand-mark">O</span><span>OUTS<span className="brand-dot">.</span> Reuse</span></Link>
      <nav aria-label="Reuse navigation">
        <Link href="/reuse">Explore</Link>
        <Link href="/reuse/new">List an item</Link>
        <Link href="/reuse/my">My activity</Link>
        <Link href="/rent">Rent</Link>
        <Link href="/messages">Messages</Link>
        <Link href="/dashboard">Workspace</Link>
      </nav>
    </header>
  );
}
