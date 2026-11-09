'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, GraduationCap } from 'lucide-react';
type Mode = 'signup' | 'login' | 'forgot';
export default function AuthPage(){
 const [mode,setMode]=useState<Mode>('signup'),[name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[college,setCollege]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');const router=useRouter();
 function destination(){const requested=new URLSearchParams(window.location.search).get('next');if(!requested?.startsWith('/'))return '/dashboard';const target=new URL(requested,window.location.origin);return target.origin===window.location.origin?`${target.pathname}${target.search}${target.hash}`:'/dashboard';}
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setNotice('');const supabase=createClient();
  try{
   if(mode==='forgot'){const normalizedEmail=email.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)){setNotice('Enter a valid email address.');return;}const {error}=await supabase.auth.resetPasswordForEmail(normalizedEmail,{redirectTo:`${window.location.origin}/auth/reset-password?flow=recovery`});setNotice(error?`Could not request a reset: ${error.message}`:'If an account exists for this email, a password reset link has been sent.');return;}
   if(mode==='signup'){
    const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name:name.trim(),college_name:college.trim()}}});
    if(error){setNotice(error.message);return;}
    if(data.user&&data.session){const {error:profileError}=await supabase.from('profiles').upsert({id:data.user.id,full_name:name.trim(),college:college.trim()},{onConflict:'id'});if(profileError){setNotice(`Account created, but profile setup failed: ${profileError.message}`);return;}router.replace(destination());router.refresh();}
    else if(data.user)setNotice('Account created. Check your email to confirm, then log in. Your profile will be initialized after confirmation.');
    return;
   }
   const {data,error}=await supabase.auth.signInWithPassword({email,password});
   if(error){setNotice(error.message);return;}
   const {data:existingProfile,error:lookupError}=await supabase.from('profiles').select('id').eq('id',data.user.id).maybeSingle();
   if(lookupError){setNotice(`Signed in, but your profile could not be checked: ${lookupError.message}`);return;}
   if(!existingProfile){const {error:profileError}=await supabase.from('profiles').insert({id:data.user.id,full_name:String(data.user.user_metadata.full_name??''),college:String(data.user.user_metadata.college_name??'')});if(profileError){setNotice(`Signed in, but your profile could not be initialized: ${profileError.message}`);return;}}
   router.replace(destination());router.refresh();
  }catch(requestError){setNotice(requestError instanceof Error?requestError.message:'Authentication request failed. Please try again.');}
  finally{setBusy(false);}
 }
 return <main className="auth-wrap"><Link href="/" className="back-link"><ArrowLeft size={16}/> Back to OUTS</Link><section className="auth-card"><div className="auth-brand"><span className="brand-mark">O</span><span>OUTS<span className="brand-dot">.</span></span></div><div className="auth-icon"><GraduationCap/></div><p className="eyebrow">YOUR CAMPUS. YOUR COMMUNITY.</p><h1>{mode==='signup'?'Create your student account':mode==='forgot'?'Reset your password':'Welcome back'}</h1><p className="muted">{mode==='forgot'?'Enter your registered email and we will send a secure reset link.':mode==='signup'?'One account to learn, collaborate and earn.':'Log in to continue with your campus community.'}</p><form onSubmit={submit} className="auth-form">{mode==='signup'&&<><label>Full name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"/></label><label>College / Institute<input required value={college} onChange={e=>setCollege(e.target.value)} placeholder="Your college name"/></label></>}<label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>{mode!=='forgot'&&<label>Password<input type="password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters"/></label>}<button className="btn btn-dark auth-submit" disabled={busy}>{busy?'Please wait…':mode==='signup'?'Create account':mode==='forgot'?'Send reset link':'Log in'}</button></form>{notice&&<p className="notice" role="status">{notice}</p>}{mode==='login'&&<p className="auth-switch"><button onClick={()=>{setMode('forgot');setNotice('')}}>Forgot password?</button></p>}<p className="auth-switch">{mode==='forgot'?'Remembered your password?':mode==='signup'?'Already have an account?':'New to OUTS?'} <button onClick={()=>{setMode(mode==='signup'?'login':'signup');setNotice('')}}>{mode==='signup'?'Log in':'Create account'}</button></p><p className="policy-note">OUTS supports tutoring, mentoring and legitimate collaboration. Do not request or provide academic cheating, impersonation or plagiarised submissions.</p></section></main>;
}
