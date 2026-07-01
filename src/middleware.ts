import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const { auth } = NextAuth(authConfig);

const publicRoutes = ['/', '/login', '/rastreamento', '/sobre', '/contato', '/device-pending'];
const apiPublicRoutes = [
  '/api/auth',
  '/api/health',
  '/api/access-requests',
  '/api/device/status',
  '/api/device/location',
  '/api/geolocation/capture',
  '/api/geolocation/deny-permission'
];

const DEVICE_COOKIE = 'sigma-device';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

function buildRedirect(req: NextRequest, path: string): URL {
  const proto =
    req.headers.get('x-forwarded-proto')?.split(',')[0].trim() ||
    req.nextUrl.protocol.replace(':', '');
  const host =
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    req.nextUrl.host;
  return new URL(path, `${proto}://${host}`);
}

function attachDeviceCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set(DEVICE_COOKIE, token, {
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}

const MOBILE_UA_REGEX = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isPublicRoute = publicRoutes.includes(nextUrl.pathname);
  const isApiPublicRoute = apiPublicRoutes.some((route) =>
    nextUrl.pathname.startsWith(route),
  );
  const isGeoPage = nextUrl.pathname === '/geolocation-permission';

  const existingToken = req.cookies.get(DEVICE_COOKIE)?.value;
  const newToken = existingToken ?? crypto.randomUUID();
  const needsCookie = !existingToken;

  if (isApiPublicRoute) return;

  // Redireciona acessos de celular na raiz '/' para login (se deslogado) ou dashboard (se logado)
  if (nextUrl.pathname === '/') {
    const ua = req.headers.get('user-agent') || '';
    if (MOBILE_UA_REGEX.test(ua)) {
      if (isLoggedIn) {
        return NextResponse.redirect(buildRedirect(req, '/dashboard'));
      } else {
        const res = NextResponse.redirect(buildRedirect(req, '/login'));
        return needsCookie ? attachDeviceCookie(res, newToken) : res;
      }
    }
  }

  if (nextUrl.pathname.startsWith('/api/')) {
    if (!isLoggedIn) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const user = (req.auth as any)?.user;

    // 1. Verificar se o dispositivo é autorizado
    if (user?.deviceAuthorized === false) {
      return Response.json({ error: 'Dispositivo não autorizado' }, { status: 403 });
    }

    // 2. Verificar geolocalização (obrigatória para não-admins)
    const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
    if (!isAdmin) {
      const geoStatus = user?.geoStatus || 'pending';
      if (geoStatus !== 'authorized' && geoStatus !== 'admin-approved') {
        return Response.json({ error: 'Necessário autorizar geolocalização ou acesso em área restrita' }, { status: 403 });
      }
    }

    return;
  }

  // Verificar geolocalização (obrigatória antes de acessar dashboard)
  if (isLoggedIn && !isPublicRoute && !isGeoPage && !nextUrl.pathname.startsWith('/api')) {
    const user = (req.auth as any)?.user as any;
    const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

    // Bypass para ADMIN/SUPER_ADMIN (opcional - remover se quiser forçar mesmo para admin)
    if (!isAdmin) {
      const geoStatus = user?.geoStatus || 'pending';
      if (geoStatus !== 'authorized' && geoStatus !== 'admin-approved') {
        const res = NextResponse.redirect(buildRedirect(req, '/geolocation-permission'));
        return needsCookie ? attachDeviceCookie(res, newToken) : res;
      }
    }
  }

  // Dispositivo não autorizado — redireciona para página de espera
  if (isLoggedIn && (req.auth as any)?.user?.deviceAuthorized === false) {
    if (!nextUrl.pathname.startsWith('/device-pending')) {
      const res = NextResponse.redirect(buildRedirect(req, '/device-pending'));
      return needsCookie ? attachDeviceCookie(res, newToken) : res;
    }
    // Permite acesso à página de espera — seta cookie se necessário
    if (needsCookie) {
      const res = NextResponse.next();
      return attachDeviceCookie(res, newToken);
    }
    return;
  }

  if (!isLoggedIn && !isPublicRoute) {
    const res = NextResponse.redirect(buildRedirect(req, '/login'));
    return needsCookie ? attachDeviceCookie(res, newToken) : res;
  }

  if (isLoggedIn && nextUrl.pathname === '/login') {
    return NextResponse.redirect(buildRedirect(req, '/dashboard'));
  }



  // Seta cookie de dispositivo em visitantes novos (pass-through com cookie)
  if (needsCookie) {
    const res = NextResponse.next();
    return attachDeviceCookie(res, newToken);
  }
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logos/|models/).*)',],
};
