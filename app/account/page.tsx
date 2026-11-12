'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, KeyRound, LogOut, Save, ShieldAlert, Upload, UserRound } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

type Profile = {
  full_name: string | null;
  college: string | null;
  course: string | null;
  year_of_study: string | null;
  bio: string | null;
  skills: string[] | null;
  avatar_path: string | null;
};

const avatarBucket = 'outs-avatars';

export default function AccountPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [name, setName] = useState('');
  const [college, setCollege] = useState('');
  const [course, setCourse] = useState('');
  const [yearOfStudy, setYearOfStudy] = useState('');
  const [bio, setBio] = useState('');
  const [skills, setSkills] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !currentUser) {
        router.replace('/auth?mode=login&next=%2Faccount');
        return;
      }
      setUser(currentUser);
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('full_name,college,course,year_of_study,bio,skills,avatar_path')
        .eq('id', currentUser.id)
        .single();
      if (!active) return;
      if (profileError) {
        setError(`Could not load your profile: ${profileError.message}`);
      } else {
        const loadedProfile = data as Profile;
        setName(loadedProfile.full_name ?? '');
        setCollege(loadedProfile.college ?? '');
        setCourse(loadedProfile.course ?? '');
        setYearOfStudy(String(loadedProfile.year_of_study ?? ''));
        setBio(loadedProfile.bio ?? '');
        setSkills((loadedProfile.skills ?? []).join(', '));
        if (loadedProfile.avatar_path) {
          const { data: signedImage, error: imageError } = await supabase.storage
            .from(avatarBucket)
            .createSignedUrl(loadedProfile.avatar_path, 3600);
          if (!active) return;
          if (imageError) setError(`Could not load your profile picture: ${imageError.message}`);
          else setAvatarUrl(signedImage.signedUrl);
        }
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [router, supabase]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError('');
    setNotice('');
    const updatedProfile = {
      full_name: name.trim(),
      college: college.trim(),
      course: course.trim(),
      year_of_study: yearOfStudy.trim() || null,
      bio: bio.trim(),
      skills: skills.split(',').map((skill) => skill.trim()).filter(Boolean),
    };
    const { error: updateError } = await supabase.from('profiles').update(updatedProfile).eq('id', user.id);
    if (updateError) setError(`Could not save your profile: ${updateError.message}`);
    else {
      setNotice('Your profile has been updated.');
    }
    setBusy(false);
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !user) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Profile pictures must be 5 MB or smaller.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    const path = `${user.id}/avatar`;
    const { error: uploadError } = await supabase.storage.from(avatarBucket).upload(path, file, {
      upsert: true,
      contentType: file.type,
    });
    if (uploadError) {
      setError(`Could not upload your profile picture: ${uploadError.message}`);
      setBusy(false);
      return;
    }
    const { error: updateError } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', user.id);
    if (updateError) {
      setError(`The picture uploaded, but your profile could not be updated: ${updateError.message}`);
      setBusy(false);
      return;
    }
    const { data: signedImage, error: imageError } = await supabase.storage.from(avatarBucket).createSignedUrl(path, 3600);
    if (imageError) setError(`Your picture was saved, but its preview could not be loaded: ${imageError.message}`);
    else {
      setAvatarUrl(signedImage.signedUrl);
      setNotice('Your profile picture has been updated.');
    }
    setBusy(false);
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    if (!user?.email || !currentPassword) {
      setError('Enter your current password to verify this change.');
      setBusy(false);
      return;
    }
    const { error: verificationError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (verificationError) {
      setError(`Current password verification failed: ${verificationError.message}`);
      setBusy(false);
      return;
    }
    const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
    if (passwordError) setError(`Could not change your password: ${passwordError.message}`);
    else {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setNotice('Your password has been changed.');
    }
    setBusy(false);
  }

  async function logoutEverywhere() {
    setBusy(true);
    setError('');
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
    if (signOutError) {
      setError(`Could not sign out all sessions: ${signOutError.message}`);
      setBusy(false);
      return;
    }
    router.replace('/');
    router.refresh();
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deleteConfirmation !== 'DELETE' || !deletePassword) {
      setError('Enter your password and type DELETE exactly to confirm.');
      return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/account', {
        method: 'DELETE', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: deletePassword, confirmation: deleteConfirmation }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) { setError(result.error ?? 'Account deletion could not be completed.'); setBusy(false); return; }
      await supabase.auth.signOut({ scope: 'global' });
      router.replace('/'); router.refresh();
    } catch {
      setError('Account deletion could not be completed. Please contact support before retrying.');
      setBusy(false);
    }
  }

  if (loading) return <main className="app-loading">Loading your account…</main>;

  return (
    <main className="form-page account-page">
      <Link href="/dashboard" className="back-link"><ArrowLeft size={16} /> Back to dashboard</Link>
      <header className="list-heading">
        <p className="eyebrow">ACCOUNT MANAGEMENT</p>
        <h1>Your account</h1>
        <p className="muted">Manage your profile, sign-in security, and account access.</p>
      </header>
      {error && <p className="notice account-error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      <section className="form-card account-card" aria-labelledby="profile-heading">
        <div className="account-section-title"><UserRound /><div><h2 id="profile-heading">Student profile</h2><p className="muted">This information helps other students recognize your profile.</p></div></div>
        <div className="avatar-editor">
          <div className="profile-avatar" aria-label="Profile picture">
            {avatarUrl ? <div role="img" aria-label="Your profile picture" style={{ backgroundImage: `url("${avatarUrl}")` }} /> : <UserRound aria-hidden="true" />}
          </div>
          <label className="btn btn-light avatar-upload">
            <Upload size={16} /> {busy ? 'Please wait…' : 'Update picture'}
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={uploadAvatar} />
          </label>
          <small>JPG, PNG, or WebP · up to 5 MB</small>
        </div>
        <form className="task-form" onSubmit={saveProfile}>
          <label>Full name<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>College / institute<input maxLength={160} value={college} onChange={(event) => setCollege(event.target.value)} /></label>
          <label>Course<input maxLength={120} value={course} onChange={(event) => setCourse(event.target.value)} placeholder="B.Tech Computer Science" /></label>
          <label>Year of study<input maxLength={40} value={yearOfStudy} onChange={(event) => setYearOfStudy(event.target.value)} placeholder="Second year" /></label>
          <label>Skills, separated by commas<input maxLength={500} value={skills} onChange={(event) => setSkills(event.target.value)} placeholder="Python, design, tutoring" /></label>
          <label>Bio<textarea rows={4} maxLength={1000} value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Tell your campus community about yourself." /></label>
          <label>Email address<input value={user?.email ?? ''} readOnly aria-readonly="true" /></label>
          <button className="btn btn-dark" disabled={busy}><Save size={16} /> Save profile</button>
        </form>
      </section>

      <section className="form-card account-card" aria-labelledby="password-heading">
        <div className="account-section-title"><KeyRound /><div><h2 id="password-heading">Change password</h2><p className="muted">Use at least 8 characters. Password changes apply to your OUTS sign-in.</p></div></div>
        <form className="task-form" onSubmit={changePassword}>
          <label>Current password<input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
          <label>New password<input type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
          <label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
          <button className="btn btn-dark" disabled={busy}>Update password</button>
        </form>
      </section>

      <section className="form-card account-card" aria-labelledby="sessions-heading">
        <div className="account-section-title"><LogOut /><div><h2 id="sessions-heading">Sessions</h2><p className="muted">Sign out on this device and revoke other active sessions.</p></div></div>
        <button className="btn btn-light" type="button" disabled={busy} onClick={logoutEverywhere}>Log out of all sessions</button>
      </section>

      <section className="form-card account-card danger-card" aria-labelledby="delete-heading">
        <div className="account-section-title"><ShieldAlert /><div><h2 id="delete-heading">Delete account</h2><p className="muted">Accounts with task, learning, messaging, moderation, or financial history require a retention review. Those records are not cascade-deleted.</p></div></div>
        {!deleteOpen ? <button className="btn btn-danger" type="button" disabled={busy} onClick={() => setDeleteOpen(true)}>Continue to delete account</button> : <form className="task-form" onSubmit={deleteAccount}>
          <p className="notice account-error">This permanently removes your sign-in and profile if the account has no marketplace or audit history. Your profile picture will also be removed.</p>
          <label>Current password<input type="password" autoComplete="current-password" required value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} /></label>
          <label>Type DELETE to confirm<input required value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} /></label>
          <div className="account-actions"><button className="btn btn-danger" type="submit" disabled={busy}>{busy ? 'Deleting account…' : 'Delete my account'}</button><button className="btn btn-light" type="button" disabled={busy} onClick={() => { setDeleteOpen(false); setDeletePassword(''); setDeleteConfirmation(''); }}>Cancel</button></div>
        </form>}
      </section>
    </main>
  );
}
