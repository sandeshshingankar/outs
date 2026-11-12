'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, UploadCloud } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const categories = ['Assignment guidance','PPT assistance','Notes and study resources','Practical guidance','Documentation and formatting','Coding and debugging','Website development','App development','Research guidance','Mentoring','Other'];
const allowedTypes = ['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

export default function NewTask() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [user,setUser] = useState<User|null>(null);
  const [title,setTitle] = useState('');
  const [description,setDescription] = useState('');
  const [category,setCategory] = useState(categories[0]);
  const [budget,setBudget] = useState('');
  const [deadline,setDeadline] = useState('');
  const [attachments,setAttachments] = useState<File[]>([]);
  const [draftId,setDraftId] = useState('');
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('');
  const [error,setError] = useState('');

  useEffect(()=>{
    let active=true;
    void (async()=>{const {data,error:authError}=await supabase.auth.getUser();if(!active)return;if(authError||!data.user){router.replace('/auth?mode=login&next=%2Ftasks%2Fnew');return;}setUser(data.user);})();
    return ()=>{active=false;};
  },[router,supabase]);

  function selectAttachments(event:ChangeEvent<HTMLInputElement>){
    const files=Array.from(event.target.files??[]);event.target.value='';
    if(files.length>5){setError('Choose up to five attachments.');return;}
    if(files.some(file=>!allowedTypes.includes(file.type)||file.size>10*1024*1024)){setError('Attachments must be PDF, JPG, PNG, WebP or DOCX files up to 10 MB each.');return;}
    setAttachments(files);setError('');
  }

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!user)return;
    const amount=Number(budget);
    if(title.trim().length<5||description.trim().length<20||!Number.isFinite(amount)||amount<=0){setError('Enter a title, description, and positive task budget.');return;}
    if(deadline&&new Date(deadline).getTime()<=Date.now()){setError('Choose a future deadline.');return;}
    setBusy(true);setError('');setNotice('');
    const id=crypto.randomUUID();
    const {error:insertError}=await supabase.from('tasks').insert({id,provider_id:user.id,title:title.trim(),description:description.trim(),category,budget:amount,deadline_at:deadline?new Date(deadline).toISOString():null,attachment_paths:[],status:'draft',payment_required:true,payment_status:'pending'});
    if(insertError){setError(`Could not save task draft: ${insertError.message}`);setBusy(false);return;}
    const paths:string[]=[];
    for(const file of attachments){
      const name=file.name.replace(/[^A-Za-z0-9_.-]/g,'_').slice(-140);
      const path=`${user.id}/${id}/${crypto.randomUUID()}-${name}`;
      const {error:uploadError}=await supabase.storage.from('outs-task-attachments').upload(path,file,{contentType:file.type,upsert:false});
      if(uploadError){if(paths.length)await supabase.storage.from('outs-task-attachments').remove(paths);await supabase.from('tasks').delete().eq('id',id).eq('provider_id',user.id);setError(`Draft was not saved because an attachment failed: ${uploadError.message}`);setBusy(false);return;}
      paths.push(path);
    }
    if(paths.length){const {error:pathError}=await supabase.rpc('set_task_attachments',{p_task_id:id,p_paths:paths});if(pathError){await supabase.storage.from('outs-task-attachments').remove(paths);await supabase.from('tasks').delete().eq('id',id).eq('provider_id',user.id);setError(`Could not link task attachments: ${pathError.message}`);setBusy(false);return;}}
    setDraftId(id);setNotice('Unpublished draft saved. It will not appear in the marketplace until a compliant task payment and provider settlement flow is configured.');setBusy(false);
  }

  const taskBudget=Number(budget)||0;
  const buyerFee=Math.round(taskBudget*100)/100*0.01;
  return <main className="form-page">
    <Link href="/dashboard" className="back-link"><ArrowLeft size={16}/> Back to dashboard</Link>
    <section className="form-card"><p className="eyebrow">CREATE AN OPPORTUNITY</p><h1>Post a task</h1><p className="muted">Describe the help you need. Tasks remain unpublished until task payment settlement is configured.</p>
      <form className="task-form" onSubmit={submit}>
        <label>Task title<input required minLength={5} maxLength={140} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Need guidance with a React project"/></label>
        <label>Category<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(item=><option key={item}>{item}</option>)}</select></label>
        <label>Description<textarea required minLength={20} maxLength={10000} rows={6} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe the task, expected outcome, skills needed and any important details."/></label>
        <div className="form-two"><label>Budget (₹)<input type="number" min="1" step="1" required value={budget} onChange={e=>setBudget(e.target.value)} placeholder="500"/></label><label>Deadline (optional)<input type="datetime-local" value={deadline} onChange={e=>setDeadline(e.target.value)}/></label></div>
        <label>Attachments (optional)<input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={selectAttachments}/></label>
        {attachments.length>0&&<small>{attachments.length} file(s): {attachments.map(file=>file.name).join(', ')}</small>}
        <div className="notice task-payment-breakdown"><b>Payment estimate</b><br/>Task budget: ₹{taskBudget.toLocaleString('en-IN')}<br/>Buyer-side OUTS fee (1%): ₹{buyerFee.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}<br/><b>Total payable: ₹{(taskBudget+buyerFee).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</b><br/><small>The provider-side 1% fee is not collected here. OUTS does not hold funds in escrow or automatically pay providers. Task checkout stays disabled until Razorpay Route, linked-account onboarding, and settlement are implemented and tested.</small></div>
        <div className="integrity-note"><UploadCloud/><p><b>Keep it ethical</b><br/>Post requests for tutoring, mentoring, proofreading, formatting or legitimate collaboration. Do not request exam cheating, impersonation or plagiarised work.</p></div>
        <button className="btn btn-dark auth-submit" disabled={busy||!user||Boolean(draftId)}>{busy?'Saving draft…':draftId?'Draft saved (unpublished)':'Save unpublished draft'}</button>
        {notice&&<p className="notice" role="status">{notice}</p>}{error&&<p className="notice account-error" role="alert">{error}</p>}
        {draftId&&<Link className="btn btn-light" href={`/tasks/${draftId}`}>View task draft</Link>}
      </form>
    </section>
  </main>;
}
