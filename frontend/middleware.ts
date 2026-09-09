import { NextResponse, type NextRequest } from 'next/server';
import { decodeSession, TOKEN_COOKIE, USER_COOKIE } from '@/lib/session';

/**
 * Yalnızca yönlendirme içindir. `mv_user` çerezi kullanıcı tarafından
 * düzenlenebilir — asıl yetki her zaman backend'de RolesGuard ile verilir.
 * Rolü kurcalayan biri en fazla boş bir admin kabuğu görür, her API çağrısı 403 döner.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasToken = req.cookies.has(TOKEN_COOKIE);
  const session = decodeSession(req.cookies.get(USER_COOKIE)?.value);

  const redirect = (to: string) => NextResponse.redirect(new URL(to, req.url));

  // Girişliyken giriş/kayıt ekranlarında oyalanma.
  if (pathname === '/giris' || pathname === '/kayit') {
    if (!hasToken) return NextResponse.next();
    if (session?.role === 'ADMIN') return redirect('/admin');
    if (session?.role === 'HOST') return redirect('/hesabim/ev-sahibi');
    return redirect('/hesabim');
  }

  if (pathname === '/admin/login') {
    if (!hasToken) return NextResponse.next();
    return redirect(session?.role === 'ADMIN' ? '/admin' : '/');
  }

  if (pathname === '/hesabim' || pathname.startsWith('/hesabim/')) {
    if (!hasToken) {
      const url = new URL('/giris', req.url);
      url.searchParams.set('next', pathname + search);
      return NextResponse.redirect(url);
    }
    const ownerRoute = pathname.startsWith('/hesabim/villalarim') || pathname.startsWith('/hesabim/ev-sahibi');
    if (ownerRoute && session?.role !== 'HOST') {
      return redirect(session?.role === 'ADMIN' ? '/admin' : '/hesabim');
    }

    const customerRoute = pathname === '/hesabim' || pathname.startsWith('/hesabim/seyahatlerim') || pathname.startsWith('/hesabim/yorumlarim');
    if (customerRoute && session?.role === 'HOST') return redirect('/hesabim/ev-sahibi');
    if (customerRoute && session?.role === 'ADMIN') return redirect('/admin');

    return NextResponse.next();
  }

  if (pathname === '/ev-sahibi' && session?.role === 'HOST') return redirect('/hesabim/ev-sahibi');
  if (pathname === '/ev-sahibi' && session?.role === 'ADMIN') return redirect('/admin');

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    if (!hasToken) {
      const url = new URL('/admin/login', req.url);
      url.searchParams.set('next', pathname + search);
      return NextResponse.redirect(url);
    }
    // Girişli ama yönetici değil: admin login'e yollamak kafa karıştırır.
    if (session && session.role !== 'ADMIN') return redirect('/');
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*', '/hesabim/:path*', '/giris', '/kayit', '/ev-sahibi'] };
