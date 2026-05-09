import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

const { auth } = NextAuth(authConfig);

const publicRoutes = ['/', '/login', '/rastreamento', '/sobre', '/contato'];
const apiPublicRoutes = ['/api/auth', '/api/health', '/api/access-requests'];

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
    return Response.redirect(new URL('/login', nextUrl));
  }

  if (isLoggedIn && nextUrl.pathname === '/login') {
    return Response.redirect(new URL('/dashboard', nextUrl));
  }
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)',],
};
