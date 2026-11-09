import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OUTS — Your campus. Your skills. Your income.',
  description: 'The student-powered marketplace to find help, share skills and earn on campus.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
