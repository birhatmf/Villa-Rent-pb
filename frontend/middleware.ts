import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing, type AppLocale } from '@/i18n/routing';
import { decodeSession, TOKEN_COOKIE, USER_COOKIE } from '@/lib/session';

const handleI18n = createMiddleware(routing);

function routeInfo(pathname: string): { locale: AppLocale; pathname: string } {
  const segment = pathname.split('/')[1];
  const locale = routing.locales.includes(segment as AppLocale)
    ? (segment as AppLocale)
    : routing.defaultLocale;
  if (segment !== locale) return { locale, pathname };
  const stripped = pathname.slice(segment.length + 1) || '/';
  return { locale, pathname: stripped.startsWith('/') ? stripped : `/${stripped}` };
}

function localized(locale: AppLocale, pathname: string) {
  if (locale === routing.defaultLocale) return pathname;
  return `/${locale}${pathname === '/' ? '' : pathname}`;
}

function isOwnerTool(pathname: string) {
  return pathname.startsWith('/hesabim/ev-sahibi') || pathname.startsWith('/hesabim/villalarim');
}

/**
 * Yetki yönlendirmeleri backend güvenliğinin yerine geçmez. Burada yalnızca
 * kullanıcıyı doğru ekrana taşır, ardından public sayfalara locale uygularız.
 */
export function middleware(req: NextRequest) {
  const rawPathname = req.nextUrl.pathname;
  const { locale, pathname } = routeInfo(rawPathname);
  const { search } = req.nextUrl;
  const hasToken = req.cookies.has(TOKEN_COOKIE);
  const session = decodeSession(req.cookies.get(USER_COOKIE)?.value);
  const redirect = (to: string, localize = true) =>
    NextResponse.redirect(new URL(localize ? localized(locale, to) : to, req.url));

  if (pathname === '/giris' || pathname === '/kayit') {
    if (hasToken) {
      if (session?.role === 'ADMIN') return redirect('/admin', false);
      if (session?.role === 'HOST') return redirect('/hesabim/ev-sahibi', false);
      return redirect('/hesabim');
    }
  }

  if (pathname === '/admin/login') {
    if (!hasToken) return NextResponse.next();
    return redirect(session?.role === 'ADMIN' ? '/admin' : '/', session?.role !== 'ADMIN');
  }

  if (pathname === '/hesabim' || pathname.startsWith('/hesabim/')) {
    if (!hasToken) {
      const url = new URL(localized(locale, '/giris'), req.url);
      url.searchParams.set('next', pathname + search);
      return NextResponse.redirect(url);
    }

    if (isOwnerTool(pathname) && session?.role !== 'HOST') {
      return redirect(session?.role === 'ADMIN' ? '/admin' : '/hesabim', session?.role !== 'ADMIN');
    }

    const customerRoute = pathname === '/hesabim'
      || pathname.startsWith('/hesabim/seyahatlerim')
      || pathname.startsWith('/hesabim/yorumlarim');
    if (customerRoute && session?.role === 'HOST') return redirect('/hesabim/ev-sahibi', false);
    if (customerRoute && session?.role === 'ADMIN') return redirect('/admin', false);
  }

  if (pathname === '/ev-sahibi' && session?.role === 'HOST') return redirect('/hesabim/ev-sahibi', false);
  if (pathname === '/ev-sahibi' && session?.role === 'ADMIN') return redirect('/admin', false);

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    if (!hasToken) {
      const url = new URL('/admin/login', req.url);
      url.searchParams.set('next', rawPathname + search);
      return NextResponse.redirect(url);
    }
    if (session && session.role !== 'ADMIN') return redirect('/', false);
    return NextResponse.next();
  }

  if (isOwnerTool(pathname)) return NextResponse.next();
  return handleI18n(req);
}

export const config = {
  matcher: ['/((?!api|_next|uploads|.*\\..*).*)'],
};
