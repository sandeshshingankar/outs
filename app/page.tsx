'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, ArrowUpRight, BookOpen, BriefcaseBusiness, Code2, FileText, GraduationCap, Menu, MessageCircle, Presentation, Search, ShieldCheck, Sparkles, Wallet, X, Zap } from 'lucide-react';

const categories = [
  { name: 'Assignments', detail: 'Get help understanding topics', icon: FileText },
  { name: 'Coding & Development', detail: 'Build, debug and learn', icon: Code2 },
  { name: 'Notes & Study Material', detail: 'Learn from student-made notes', icon: BookOpen },
  { name: 'Presentations', detail: 'Make your next presentation shine', icon: Presentation },
  { name: 'Mini Projects', detail: 'Collaborate and build together', icon: BriefcaseBusiness },
  { name: 'Tutoring', detail: 'Learn directly from your peers', icon: GraduationCap },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('Find work');

  return (
    <main>
      <div className="announcement"><Sparkles size={14} /> Made for students, powered by students <span>Explore the OUTS community <ArrowUpRight size={13}/></span></div>
      <header className="nav wrap">
        <a className="brand" href="#top" aria-label="OUTS home"><span className="brand-mark">O</span><span>OUTS<span className="brand-dot">.</span></span></a>
        <nav className={menuOpen ? 'nav-links open' : 'nav-links'}>
          <a href="#explore" onClick={() => setMenuOpen(false)}>Explore work</a><a href="#how" onClick={() => setMenuOpen(false)}>How it works</a><a href="#learn" onClick={() => setMenuOpen(false)}>Peer learning</a><Link href="/partner" onClick={() => setMenuOpen(false)}>OUTS Partner</Link>
        </nav>
        <div className="nav-actions"><a className="login" href="/auth">Log in</a><a className="btn btn-dark btn-small" href="/auth">Join OUTS <ArrowUpRight size={15}/></a></div>
        <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">{menuOpen ? <X/> : <Menu/>}</button>
      </header>

      <section className="hero wrap" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot"/> THE STUDENT-POWERED MARKETPLACE</div>
          <h1>Your campus.<br/>Your skills. <em>Your income.</em></h1>
          <p className="hero-text">The place where students help students. Find a helping hand for your next task, or turn what you know into money.</p>
          <div className="hero-buttons"><a className="btn btn-dark" href="#explore">Explore opportunities <ArrowRight size={17}/></a><a className="btn btn-light" href="#how">See how it works</a></div>
          <div className="social-proof"><div className="earned-icon"><GraduationCap size={17}/></div><small>Built for student collaboration</small></div>
        </div>
        <div className="hero-art" aria-label="Illustration of students collaborating">
          <div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/>
          <div className="floating-card card-task"><div className="mini-icon purple"><FileText size={17}/></div><div><b>Student collaboration</b><small>Skills shared on campus</small></div><span className="live-dot"/></div>
          <div className="main-illustration"><div className="sun-shape"/><div className="blob blob-back"/><div className="desk"/><div className="person person-left"><div className="hair hair-left"/><div className="face face-left"/><div className="body body-left"/><div className="arm arm-left"/></div><div className="laptop"><div className="laptop-screen"><div className="screen-dot"/><div className="screen-line"/><div className="screen-line short"/><div className="screen-grid"><i/><i/><i/></div></div><div className="laptop-base"/></div><div className="person person-right"><div className="hair hair-right"/><div className="face face-right"/><div className="body body-right"/><div className="arm arm-right"/></div><div className="plant"><i/><i/><i/><b/></div></div>
          <div className="floating-card card-earned"><div className="earned-icon"><Wallet size={17}/></div><div><small>Student community</small><b>Skills shared</b></div><span className="earned-check"><ArrowUpRight size={13}/></span></div>
          <div className="floating-pill"><Zap size={14}/> Skills meet opportunity</div>
        </div>
      </section>

      <section className="trust-strip"><div className="wrap trust-inner"><span>ONE COMMUNITY. MANY POSSIBILITIES.</span><div><ShieldCheck/> Student-first <i/> <MessageCircle/> Real conversations <i/> <Wallet/> Fair rewards</div></div></section>

      <section className="section wrap" id="explore">
        <div className="section-heading"><div><div className="eyebrow">FIND YOUR NEXT MOVE</div><h2>What are you here <em>for?</em></h2><p>Whatever your college life needs, there is a student for that.</p></div><a className="text-link" href="/auth">View all categories <ArrowUpRight size={16}/></a></div>
        <div className="category-grid">{categories.map((item, index) => { const Icon = item.icon; return <a className="category-card" href="/auth" key={item.name}><div className={`category-icon tone-${index}`}><Icon size={21}/></div><div className="category-meta"><h3>{item.name}</h3><p>{item.detail}</p></div><ArrowUpRight className="category-arrow" size={17}/></a>; })}</div>
      </section>

      <section className="tasks-section" id="tasks"><div className="wrap section"><div className="section-heading"><div><div className="eyebrow">OPPORTUNITIES AROUND YOU</div><h2>A little help goes <em>a long way.</em></h2><p>Sign in to browse current student listings from OUTS.</p></div><a className="text-link" href="/auth">Browse marketplace <ArrowUpRight size={16}/></a></div>
        <div className="task-toolbar"><div className="tabs"><button className={activeTab === 'Find work' ? 'tab active' : 'tab'} onClick={() => setActiveTab('Find work')}>Find work</button><button className={activeTab === 'Offer a skill' ? 'tab active' : 'tab'} onClick={() => setActiveTab('Offer a skill')}>Offer a skill</button></div></div>
        {activeTab === 'Find work' ? <div className="offer-panel"><div className="offer-icon"><Search size={25}/></div><div><h3>Explore real tasks posted by students.</h3><p>Current marketplace listings are available to signed-in students.</p></div><a className="btn btn-dark btn-small" href="/auth?next=%2Ftasks">Browse tasks <ArrowRight size={15}/></a></div> : <div className="offer-panel"><div className="offer-icon"><GraduationCap size={25}/></div><div><h3>Turn what you know into an opportunity.</h3><p>Sign in to create your profile and publish teaching services for other students.</p></div><a className="btn btn-dark btn-small" href="/auth?next=%2Fdashboard">Join OUTS <ArrowRight size={15}/></a></div>}
      </div></section>

      <section className="section wrap how-section" id="how"><div className="center-heading"><div className="eyebrow">SIMPLE BY DESIGN</div><h2>Good things happen <em>when we help.</em></h2><p>Three steps to make your campus life work better.</p></div><div className="steps-grid"><div className="step-card"><span className="step-number">01</span><div className="step-icon"><Search/></div><h3>Find your fit</h3><p>Browse student tasks, discover a skill or find a peer tutor who gets your subject.</p></div><div className="step-card"><span className="step-number">02</span><div className="step-icon"><MessageCircle/></div><h3>Connect & agree</h3><p>Talk through the details, set expectations and agree on a fair price together.</p></div><div className="step-card"><span className="step-number">03</span><div className="step-icon"><Wallet/></div><h3>Get it done</h3><p>Complete the agreed work, share feedback and build your campus reputation.</p></div></div></section>

      <section className="learning-section" id="learn"><div className="wrap learning-inner"><div><div className="eyebrow">LEARN FROM YOUR OWN</div><h2>Today&apos;s classmate.<br/><em>Tomorrow&apos;s mentor.</em></h2><p>Learn coding, design, communication and more from students who have been right where you are.</p><a className="btn btn-dark" href="/auth">Explore peer learning <ArrowRight size={16}/></a></div><div className="learning-visual"><div className="learning-card"><div className="lesson-top"><span className="lesson-symbol"><Code2/></span><span className="lesson-live">PEER LEARNING</span></div><h3>Learn together on campus</h3><p>Find an active student teaching service that fits your goals.</p><div className="lesson-bottom"><span>Student-led learning</span><b>Explore <ArrowUpRight size={14}/></b></div></div><div className="sparkle s-one">✳</div><div className="sparkle s-two">✦</div></div></div></section>

      <section className="cta-section wrap" id="get-started"><div className="cta-box"><div className="cta-spark">✳</div><div className="eyebrow">YOUR CAMPUS, YOUR COMMUNITY</div><h2>Make your skills<br/> <em>count.</em></h2><p>Join a student community where asking for help and offering it are both wins.</p><div className="hero-buttons"><a className="btn btn-white" href="/auth">Get started with OUTS <ArrowRight size={16}/></a><a className="cta-login" href="/auth">Already a member? Log in</a></div><div className="cta-decoration">OUTS<span>.</span></div></div></section>

      <footer className="footer wrap"><a className="brand" href="#top"><span className="brand-mark">O</span><span>OUTS<span className="brand-dot">.</span></span></a><p>Built on the belief that students grow better together.</p><div><a href="#how">About</a><a href="#explore">Explore</a><a href="#learn">Peer learning</a><a href="mailto:hello@outs.example">Contact</a></div><small>© 2026 OUTS. Student-powered, community-driven.</small></footer>
    </main>
  );
}
