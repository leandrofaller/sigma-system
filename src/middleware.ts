import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import type { NextRequest } from 'next/server';

const { auth } = NextAuth(authConfig);

const publicRoutes = ['/', '/login', '/rastreamento', '/sobre', '/contato'];
const apiPublicRoutes = ['/api/auth', '/api/health', '/api/access-requests'];

// Resolve o host público real quando a app roda atrás de um reverse proxy (Coolify/nginx).
// O proxy injeta x-forwarded-host com o domínio/IP que o cliente usou;
// sem isso, nextUrl.host seria o endereço interno do container.
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

const MOBILE_UA_REGEX = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isPublicRoute = publicRoutes.includes(nextUrl.pathname);
  const isApiPublicRoute = apiPublicRoutes.some((route) =>
    nextUrl.pathname.startsWith(route)
  );

  if (isApiPublicRoute) return;

  if (nextUrl.pathname.startsWith('/api/')) {
    if (!isLoggedIn) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    return;
  }

  if (!isLoggedIn && !isPublicRoute) {
    return Response.redirect(buildRedirect(req, '/login'));
  }

  if (isLoggedIn && nextUrl.pathname === '/login') {
    return Response.redirect(buildRedirect(req, '/dashboard'));
  }

  // Redireciona /missoes para versão mobile quando acessado de celular,
  // a menos que o usuário tenha forçado desktop com ?desktop=1.
  if (isLoggedIn && nextUrl.pathname === '/missoes' && nextUrl.searchParams.get('desktop') !== '1') {
    const ua = req.headers.get('user-agent') || '';
    if (MOBILE_UA_REGEX.test(ua)) {
      return Response.redirect(buildRedirect(req, '/missoes/mobile'));
    }
  }
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)',],
};
