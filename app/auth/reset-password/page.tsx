'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const supabase=useMemo(()=>createClient(),[]);
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [busy,setBusy]=useState(false);
  const [ready,setReady]=useState(false);
  const [notice,setNotice]=useState('Checking your secure reset link…');
  const [error,setError]=useState(false);

  useEffect(()=>{
    let active=true;
    const recoveryRedirect=new URLSearchParams(window.location.search).get('flow')==='recovery';
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      if(!active)return;
      if(event==='PASSWORD_RECOVERY'&&session){setReady(true);setError(false);setNotice('Choose a new password for your account.');}
      else if(recoveryRedirect&&session){setReady(true);setError(false);setNotice('Choose a new password for your account.');}
    });
    void supabase.auth.getSession().then(({data:{session},error:sessionError})=>{
      if(!active)return;
      if(recoveryRedirect&&session){setReady(true);setError(false);setNotice('Choose a new password for your account.');}
      else if(sessionError){setError(true);setNotice(`Could not validate the reset link: ${sessionError.message}`);}
      else if(!recoveryRedirect){setError(true);setNotice('This page requires a password reset link. Request a new link to continue.');}
      else if(!session){setError(true);setNotice('This password reset link is invalid or expired. Request a new one to continue.');}
    });
    return()=>{active=false;subscription.unsubscribe();};
  },[supabase]);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError(false);
    if(!ready){setError(true);setNotice('Open a valid password reset link before choosing a new password.');return;}
    if(password.length<8){setError(true);setNotice('Use a password with at least 8 characters.');return;}
    if(password!==confirm){setError(true);setNotice('The passwords do not match.');return;}
    setBusy(true);
    const {error:updateError}=await supabase.auth.updateUser({password});
    if(updateError){setError(true);setNotice(`Password update failed: ${updateError.message}`);setBusy(false);return;}
    await supabase.auth.signOut({scope:'global'});
    setReady(false);setPassword('');setConfirm('');setNotice('Your password was updated successfully. You can now sign in with your new password.');
  }

  return <main className="auth-wrap"><Link href="/auth" className="back-link"><ArrowLeft size={16}/> Back to login</Link><section className="auth-card"><div className="auth-icon"><KeyRound/></div><p className="eyebrow">ACCOUNT SECURITY</p><h1>Choose a new password</h1><p className="muted">The reset link is single-use and expires according to your Supabase Auth settings.</p>{ready&&<form onSubmit={submit} className="auth-form"><label>New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><button className="btn btn-dark auth-submit" disabled={busy}>{busy?'Updating…':'Update password'}</button></form>}<p className={error?'notice account-error':'notice'} role={error?'alert':'status'}>{notice}</p>{error&&<Link className="text-link" href="/auth">Request another reset link</Link>}</section></main>;
}
