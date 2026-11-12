import Link from 'next/link';

export default function RentNav() {
  return <header className="rent-nav"><Link href="/rent" className="brand"><span className="brand-mark">O</span><span>OUTS<span className="brand-dot">.</span> Rent</span></Link><nav aria-label="Rent navigation"><Link href="/rent">Explore</Link><Link href="/rent/assistant">AI assistant</Link><Link href="/rent/requests">Requests</Link><Link href="/rent/list">List an item</Link><Link href="/rent/requests/new">Request an item</Link><Link href="/rent/my">My Rent</Link><Link href="/dashboard">Workspace</Link></nav></header>;
}
