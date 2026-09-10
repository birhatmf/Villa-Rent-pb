'use client';

import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { Suspense, useState } from 'react';
import { useTranslations } from 'next-intl';
import AuthShell, { AuthLink, fieldCls } from '@/components/site/AuthShell';
import { login } from '@/lib/authApi';
import { safeInternalPath } from '@/lib/navigation';

export default function GirisPage() {
  return (
    <Suspense>
      <GirisForm />
    </Suspense>
  );
}

function GirisForm() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.replace(safeInternalPath(params.get('next'), '/hesabim'));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loginError'));
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow={t('welcome')}
      title={t('loginTitle')}
      subtitle={t('loginSubtitle')}
      image="https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?auto=format&fit=crop&w=1400&q=80"
      footer={
        <>
          {t('noAccount')} <AuthLink href={params.get('next') ? `/kayit?next=${encodeURIComponent(params.get('next')!)}` : '/kayit'}>{t('registerLink')}</AuthLink>
        </>
      }
    >
      <form onSubmit={onSubmit} className="mt-10">
        <div className="space-y-6">
          <label className="block">
            <span className="eyebrow text-muted">{t('email')}</span>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldCls}
            />
          </label>

          <label className="block">
            <span className="eyebrow text-muted">{t('password')}</span>
            <input
              type="password"
              required
              maxLength={72}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldCls}
            />
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
          className="mt-10 w-full rounded-full bg-ink py-3.5 text-[0.92rem] text-canvas transition-colors hover:bg-olive disabled:opacity-50"
        >
          {busy ? t('loggingIn') : t('login')}
        </button>
      </form>
    </AuthShell>
  );
}
