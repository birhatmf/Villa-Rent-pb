'use client';

import Link from '@/components/site/LocaleLink';
import { useRouter } from '@/i18n/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { changePassword, me, updateProfile, type AccountUser } from '@/lib/authApi';

export default function ProfilePage() {
  const t = useTranslations('Account');
  const router = useRouter();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [profile, setProfile] = useState({ name: '', phone: '' });
  const [password, setPassword] = useState({ current: '', next: '', confirm: '' });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    me().then((account) => {
      setUser(account);
      setProfile({ name: account.name, phone: account.phone ?? '' });
    }).catch(() => router.replace('/giris?next=/hesabim/profil'));
  }, [router]);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null); setMessage(null);
    try {
      const updated = await updateProfile({ name: profile.name, phone: profile.phone });
      setUser(updated);
      setMessage(t('profileSaved'));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('profileError'));
    } finally { setBusy(false); }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setError(null); setMessage(null);
    if (password.next !== password.confirm) {
      setError(t('passwordMismatch'));
      return;
    }
    setBusy(true);
    try {
      await changePassword(password.current, password.next);
      setPassword({ current: '', next: '', confirm: '' });
      setMessage(t('passwordSaved'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('passwordError'));
    } finally { setBusy(false); }
  }

  if (!user) return <div className="flex min-h-[60vh] items-center justify-center text-[0.9rem] text-muted">{t('loading')}</div>;

  const inputClass = 'mt-2 w-full border-b border-ink/25 bg-transparent pb-2 text-[0.98rem] text-ink outline-none focus:border-ink';

  return (
    <main className="mx-auto max-w-2xl px-6 pb-28 pt-36 lg:px-10">
      <p className="eyebrow text-gold">{t('title')}</p>
      <div className="mt-3 flex items-end justify-between gap-4">
        <h1 className="font-display text-[clamp(2.2rem,4vw,3.2rem)] font-light tracking-[-0.02em] text-ink">{t('profileTitle')}</h1>
        <Link href="/hesabim" className="shrink-0 text-[0.85rem] text-muted underline underline-offset-4 hover:text-ink">{t('back')}</Link>
      </div>

      {(message || error) && (
        <p role={error ? 'alert' : 'status'} className={`mt-8 border-l-2 pl-3 text-[0.88rem] ${error ? 'border-red-400 text-red-700' : 'border-olive text-olive'}`}>
          {error ?? message}
        </p>
      )}

      <form onSubmit={saveProfile} className="mt-12 space-y-7">
        <h2 className="border-b border-line pb-3 font-display text-xl font-light text-ink">{t('contactInfo')}</h2>
        <label className="block"><span className="eyebrow text-muted">{t('fullName')}</span><input required minLength={2} maxLength={80} value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} className={inputClass} /></label>
        <label className="block"><span className="eyebrow text-muted">{t('email')}</span><input disabled value={user.email} className={`${inputClass} opacity-60`} /></label>
        <label className="block"><span className="eyebrow text-muted">{t('phone')}</span><input maxLength={30} value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} className={inputClass} /></label>
        <button disabled={busy} className="rounded-full bg-ink px-7 py-3 text-[0.88rem] text-canvas hover:bg-olive disabled:opacity-40">{t('saveDetails')}</button>
      </form>

      <form onSubmit={savePassword} className="mt-16 space-y-7">
        <h2 className="border-b border-line pb-3 font-display text-xl font-light text-ink">{t('changePassword')}</h2>
        <label className="block"><span className="eyebrow text-muted">{t('currentPassword')}</span><input type="password" required minLength={6} maxLength={72} autoComplete="current-password" value={password.current} onChange={(event) => setPassword({ ...password, current: event.target.value })} className={inputClass} /></label>
        <label className="block"><span className="eyebrow text-muted">{t('newPassword')}</span><input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={password.next} onChange={(event) => setPassword({ ...password, next: event.target.value })} className={inputClass} /></label>
        <label className="block"><span className="eyebrow text-muted">{t('confirmPassword')}</span><input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={password.confirm} onChange={(event) => setPassword({ ...password, confirm: event.target.value })} className={inputClass} /></label>
        <button disabled={busy} className="rounded-full border border-ink/25 px-7 py-3 text-[0.88rem] text-ink hover:border-ink disabled:opacity-40">{t('changePassword')}</button>
      </form>
    </main>
  );
}
