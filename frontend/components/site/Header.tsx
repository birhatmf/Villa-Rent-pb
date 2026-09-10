'use client';

import NextLink from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { logout } from '@/lib/authApi';
import type { Branding } from '@/lib/branding';
import { CURRENCIES, type DisplayCurrency } from '@/lib/currency';
import { readSession, type SessionUser } from '@/lib/session';
import BrandMark from './BrandMark';
import { useCurrency } from './CurrencyProvider';

const NAV = [
  { label: 'villas', href: '/villalar' },
  { label: 'regions', href: '/bolgeler' },
  { label: 'concepts', href: '/konseptler' },
  { label: 'about', href: '/hakkimizda' },
  { label: 'contact', href: '/iletisim' },
] as const;

export default function Header({ branding }: { branding: Branding }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('Header');
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<SessionUser | null>(null);

  // Yalnızca ana sayfada tam ekran hero var; diğer sayfalarda başlık hep opak.
  const overHero = pathname === '/';

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setSession(readSession());
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
  }, [open]);

  const opaque = !overHero || solid || open;
  const light = !opaque;

  async function onLogout() {
    await logout().catch(() => {});
    setSession(null);
    setOpen(false);
    router.replace('/');
    router.refresh();
  }

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500 ${
        opaque ? 'border-b border-line bg-canvas/92 backdrop-blur-md' : 'border-b border-transparent'
      }`}
    >
      <div className="mx-auto flex h-20 max-w-[1320px] items-center justify-between gap-8 px-6 lg:px-10">
        <Link
          href="/"
          className={`font-display text-[1.45rem] leading-none tracking-tight transition-colors duration-500 ${
            light ? 'text-white' : 'text-ink'
          }`}
        >
          <BrandMark
            branding={branding}
            onDark={light}
            className={`max-h-10 max-w-[190px] text-[1.45rem] ${light ? 'text-white' : 'text-ink'}`}
          />
        </Link>

        <nav className="hidden items-center gap-9 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative text-[0.9rem] transition-colors duration-500 ${
                light ? 'text-white/85 hover:text-white' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {t(item.label)}
              <span
                className={`absolute -bottom-1.5 left-0 h-px w-0 transition-[width] duration-300 group-hover:w-full ${
                  light ? 'bg-white' : 'bg-gold'
                }`}
              />
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {session ? (
            <AccountMenu session={session} light={light} onLogout={onLogout} />
          ) : (
            <>
              <Link
                href="/giris"
                className={`hidden text-[0.9rem] transition-colors duration-500 md:block ${
                  light ? 'text-white/85 hover:text-white' : 'text-ink-soft hover:text-ink'
                }`}
              >
                {t('login')}
              </Link>
              <Link
                href="/kayit"
                className={`hidden rounded-full border px-5 py-2.5 text-[0.85rem] transition-colors duration-500 md:inline-block ${
                  light
                    ? 'border-white/40 text-white hover:bg-white hover:text-ink'
                    : 'border-ink/20 text-ink hover:border-ink hover:bg-ink hover:text-canvas'
                }`}
              >
                {t('register')}
              </Link>
            </>
          )}

          <LocaleCurrencyControls light={light} />

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? t('closeMenu') : t('openMenu')}
            aria-expanded={open}
            className={`flex h-10 w-10 flex-col items-center justify-center gap-[5px] lg:hidden ${
              light ? 'text-white' : 'text-ink'
            }`}
          >
            <span
              className={`block h-px w-5 bg-current transition-transform duration-300 ${
                open ? 'translate-y-[3px] rotate-45' : ''
              }`}
            />
            <span
              className={`block h-px w-5 bg-current transition-transform duration-300 ${
                open ? '-translate-y-[3px] -rotate-45' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {open && (
        <nav className="flex flex-col gap-1 border-t border-line bg-canvas px-6 pb-8 pt-4 lg:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="border-b border-line/70 py-4 font-display text-2xl text-ink"
            >
              {t(item.label)}
            </Link>
          ))}

          {session ? (
            <>
              {session.role === 'GUEST' && (
                <>
                  <MobileMenuLink href="/hesabim" close={() => setOpen(false)}>{t('account')}</MobileMenuLink>
                  <MobileMenuLink href="/hesabim/seyahatlerim" close={() => setOpen(false)}>{t('trips')}</MobileMenuLink>
                  <MobileMenuLink href="/hesabim/yorumlarim" close={() => setOpen(false)}>{t('reviews')}</MobileMenuLink>
                </>
              )}
              <Link
                href="/hesabim/profil"
                onClick={() => setOpen(false)}
                className="border-b border-line/70 py-4 font-display text-2xl text-ink"
              >
                {t('profile')}
              </Link>
              {session.role === 'HOST' && (
                <NextLink
                  href="/hesabim/ev-sahibi/rezervasyonlar"
                  onClick={() => setOpen(false)}
                  className="border-b border-line/70 py-4 font-display text-2xl text-ink"
                >
                  {t('hostPanel')}
                </NextLink>
              )}
              {session.role === 'ADMIN' && (
                <NextLink
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="border-b border-line/70 py-4 font-display text-2xl text-ink"
                >
                  {t('adminPanel')}
                </NextLink>
              )}
              <button
                onClick={onLogout}
                className="mt-5 rounded-full border border-ink/20 px-6 py-3.5 text-center text-sm text-ink"
              >
                {t('logout')}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/giris"
                onClick={() => setOpen(false)}
                className="border-b border-line/70 py-4 font-display text-2xl text-ink"
              >
                {t('login')}
              </Link>
              <Link
                href="/kayit"
                onClick={() => setOpen(false)}
                className="mt-5 rounded-full bg-ink px-6 py-3.5 text-center text-sm text-canvas"
              >
                {t('register')}
              </Link>
            </>
          )}
          <div className="mt-5">
            <LocaleCurrencyControls mobile />
          </div>
        </nav>
      )}
    </header>
  );
}

function AccountMenu({
  session,
  light,
  onLogout,
}: {
  session: SessionUser;
  light: boolean;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('Header');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const first = session.name.split(' ')[0];

  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex items-center gap-2.5 rounded-full border py-2 pl-2 pr-4 text-[0.85rem] transition-colors duration-500 ${
          light
            ? 'border-white/40 text-white hover:bg-white/10'
            : 'border-ink/20 text-ink hover:border-ink'
        }`}
      >
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full text-[0.75rem] ${
            light ? 'bg-white/20 text-white' : 'bg-sand-deep text-ink'
          }`}
        >
          {first.charAt(0).toLocaleUpperCase('tr-TR')}
        </span>
        {first}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+0.6rem)] w-52 overflow-hidden rounded-xl border border-line bg-surface py-1.5 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.3)]">
          {session.role === 'GUEST' && (
            <>
              <MenuLink href="/hesabim" onClick={() => setOpen(false)}>{t('account')}</MenuLink>
              <MenuLink href="/hesabim/seyahatlerim" onClick={() => setOpen(false)}>{t('trips')}</MenuLink>
              <MenuLink href="/hesabim/yorumlarim" onClick={() => setOpen(false)}>{t('reviews')}</MenuLink>
            </>
          )}
          <MenuLink href="/hesabim/profil" onClick={() => setOpen(false)}>
            {t('profile')}
          </MenuLink>
          {session.role === 'HOST' && (
            <MenuLink href="/hesabim/ev-sahibi/rezervasyonlar" onClick={() => setOpen(false)} external>
              {t('hostPanel')}
            </MenuLink>
          )}
          {session.role === 'ADMIN' && (
            <MenuLink href="/admin" onClick={() => setOpen(false)} external>
              {t('adminPanel')}
            </MenuLink>
          )}
          <div className="my-1.5 h-px bg-line" />
          <button
            onClick={onLogout}
            className="block w-full px-4 py-2.5 text-left text-[0.88rem] text-muted transition-colors hover:bg-sand hover:text-ink"
          >
            {t('logout')}
          </button>
        </div>
      )}
    </div>
  );
}

function MobileMenuLink({ href, close, children }: { href: string; close: () => void; children: React.ReactNode }) {
  return <Link href={href} onClick={close} className="border-b border-line/70 py-4 font-display text-2xl text-ink">{children}</Link>;
}

function MenuLink({
  href,
  onClick,
  children,
  external = false,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
  external?: boolean;
}) {
  const Component = external ? NextLink : Link;
  return (
    <Component
      href={href}
      onClick={onClick}
      className="block px-4 py-2.5 text-[0.88rem] text-ink-soft transition-colors hover:bg-sand hover:text-ink"
    >
      {children}
    </Component>
  );
}

function LocaleCurrencyControls({ light = false, mobile = false }: { light?: boolean; mobile?: boolean }) {
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations('Header');
  const { currency, setCurrency } = useCurrency();
  const [shownLocale, setShownLocale] = useState(locale);
  const [isPending, startTransition] = useTransition();
  const color = mobile ? 'border-line bg-surface text-ink' : light
    ? 'border-white/35 bg-black/10 text-white'
    : 'border-ink/15 bg-surface text-ink';
  const switchColor = mobile ? 'border-line bg-sand/70' : light
    ? 'border-white/40 bg-black/20'
    : 'border-ink/15 bg-sand/70';

  useEffect(() => {
    setShownLocale(locale);
    document.documentElement.lang = locale;
  }, [locale]);

  function changeLocale(nextLocale: string) {
    if (nextLocale === shownLocale) return;
    setShownLocale(nextLocale);
    document.cookie = `mv_locale=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    const query = searchParams.toString();
    startTransition(() => {
      router.replace(`${pathname}${query ? `?${query}` : ''}`, { locale: nextLocale });
    });
  }

  return (
    <div className={`flex items-center gap-1.5 ${mobile ? 'w-full' : 'hidden lg:flex'}`}>
      <button
        type="button"
        role="switch"
        aria-checked={shownLocale === 'en'}
        aria-label={`${t('language')}: ${shownLocale === 'tr' ? 'Türkçe' : 'English'}`}
        aria-busy={isPending}
        title={shownLocale === 'tr' ? 'Switch to English' : 'Türkçeye geç'}
        disabled={isPending}
        onClick={() => changeLocale(shownLocale === 'tr' ? 'en' : 'tr')}
        className={`relative grid h-9 w-[74px] shrink-0 grid-cols-2 items-center rounded-full border p-1 outline-none backdrop-blur-md transition-colors focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:cursor-wait ${switchColor}`}
      >
        <span
          aria-hidden="true"
          className={`absolute left-1 top-1 h-7 w-8 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.22)] transition-transform duration-300 ease-out motion-reduce:transition-none ${shownLocale === 'en' ? 'translate-x-[32px]' : ''}`}
        />
        <span aria-hidden="true" className={`relative z-10 text-base transition-opacity ${shownLocale === 'tr' ? 'opacity-100' : 'opacity-45'}`}>🇹🇷</span>
        <span aria-hidden="true" className={`relative z-10 text-base transition-opacity ${shownLocale === 'en' ? 'opacity-100' : 'opacity-45'}`}>🇬🇧</span>
      </button>

      <label className="sr-only" htmlFor={mobile ? 'mobile-currency' : 'desktop-currency'}>{t('currency')}</label>
      <select
        id={mobile ? 'mobile-currency' : 'desktop-currency'}
        value={currency}
        onChange={(event) => setCurrency(event.target.value as DisplayCurrency)}
        className={`h-9 cursor-pointer rounded-full border px-2.5 text-[0.72rem] font-medium outline-none backdrop-blur-md ${color}`}
      >
        {CURRENCIES.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </div>
  );
}
