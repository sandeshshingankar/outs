import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import OutsAssistant from '@/components/outs-assistant';
import './globals.css';

export const metadata: Metadata = {
  title: 'OUTS — Your campus. Your skills. Your income.',
  description: 'The student-powered marketplace to find help, share skills and earn on campus.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<footer className="site-footer"><div className="site-footer-brand"><Link href="/" className="brand"><span className="brand-mark">O</span><span>OUTS<span className="brand-dot">.</span></span></Link><p>A Product of CyphrWeb</p><p>Made by CyphrWeb Team</p></div><nav aria-label="Footer navigation"><Link href="/#explore">About OUTS <ArrowUpRight size={13}/></Link><Link href="/reuse">OUTS Reuse <ArrowUpRight size={13}/></Link><Link href="/rent">RentFlow <ArrowUpRight size={13}/></Link><Link href="/learn">Peer learning <ArrowUpRight size={13}/></Link><Link href="/auth?mode=signup">Join OUTS <ArrowUpRight size={13}/></Link></nav><small>© {new Date().getFullYear()} OUTS. All rights reserved.</small></footer><OutsAssistant /></body></html>;
}
