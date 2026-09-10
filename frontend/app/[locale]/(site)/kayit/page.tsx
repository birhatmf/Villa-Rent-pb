'use client';

import Link from '@/components/site/LocaleLink';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { Suspense, useState } from 'react';
import { useTranslations } from 'next-intl';
import AuthShell, { AuthLink, fieldCls } from '@/components/site/AuthShell';
import { register } from '@/lib/authApi';
import { safeInternalPath } from '@/lib/navigation';

export default function KayitPage() {
  return (
    <Suspense>
      <KayitForm />
    </Suspense>
  );
}

function KayitForm() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', passwordConfirm: '' });
  const [kvkk, setKvkk] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.passwordConfirm) {
      setError(t('passwordMismatch'));
      return;
    }
    setBusy(true);
    try {
      await register({
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        kvkkAccepted: kvkk,
        marketingOptIn: marketing,
      });
      router.replace(safeInternalPath(params.get('next'), '/hesabim'));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('registerError'));
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow={t('membership')}
      title={t('registerTitle')}
      subtitle={t('registerSubtitle')}
      image="https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1400&q=80"
      footer={
        <>
          {t('hasAccount')} <AuthLink href={params.get('next') ? `/giris?next=${encodeURIComponent(params.get('next')!)}` : '/giris'}>{t('loginLink')}</AuthLink>
        </>
      }
    >
      <form onSubmit={onSubmit} className="mt-10">
        <div className="space-y-6">
          <label className="block">
            <span className="eyebrow text-muted">{t('name')}</span>
            <input
              required
              autoFocus
              autoComplete="name"
              value={form.name}
              onChange={set('name')}
              className={fieldCls}
            />
          </label>

          <label className="block">
            <span className="eyebrow text-muted">{t('email')}</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={set('email')}
              className={fieldCls}
            />
          </label>

          <label className="block">
            <span className="eyebrow text-muted">{t('phone')}</span>
            <input
              type="tel"
              required
              autoComplete="tel"
              placeholder="0555 000 00 00"
              value={form.phone}
              onChange={set('phone')}
              className={`${fieldCls} placeholder:text-muted/60`}
            />
            <span className="mt-1.5 block text-[0.78rem] text-muted/80">
              {t('phoneHint')}
            </span>
          </label>

          <label className="block">
            <span className="eyebrow text-muted">{t('password')}</span>
            <input
              type="password"
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
              className={fieldCls}
            />
            <span className="mt-1.5 block text-[0.78rem] text-muted/80">{t('passwordHint')}</span>
          </label>

          <label className="block">
            <span className="eyebrow text-muted">{t('passwordConfirm')}</span>
            <input
              type="password"
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              value={form.passwordConfirm}
              onChange={set('passwordConfirm')}
              className={fieldCls}
            />
          </label>
        </div>

        <div className="mt-8 space-y-3.5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              required
              checked={kvkk}
              onChange={(e) => setKvkk(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-olive"
            />
            <span className="text-[0.88rem] leading-relaxed text-ink-soft">
              <Link href="/kvkk" target="_blank" className="underline underline-offset-2 hover:text-gold">
                {t('privacyStart')}
              </Link>
              {` ${t('privacyAnd')} `}
              <Link href="/gizlilik" target="_blank" className="underline underline-offset-2 hover:text-gold">
                {t('privacyPolicy')}
              </Link>
              {` ${t('privacyEnd')}`}
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-olive"
            />
            <span className="text-[0.88rem] leading-relaxed text-ink-soft">
              {t('marketing')}
            </span>
          </label>
        </div>

        {error && (
          <p role="alert" className="mt-6 border-l-2 border-red-400 pl-3 text-[0.88rem] text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-9 w-full rounded-full bg-ink py-3.5 text-[0.92rem] text-canvas transition-colors hover:bg-olive disabled:opacity-50"
        >
          {busy ? t('creating') : t('register')}
        </button>
      </form>
    </AuthShell>
  );
}
