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
  if (process.env.NEXTAUTH_URL) {
    return new URL(path, process.env.NEXTAUTH_URL);
  }

  const proto =
    req.headers.get('x-forwarded-proto')?.split(',')[0].trim() ||
    req.nextUrl.protocol.replace(':', '');
  const host =
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    req.nextUrl.host;
  return new URL(path, `${proto}://${host}`);
}

function isTailscaleIp(ip: string | undefined): boolean {
  if (!ip) return false;

  let checkIp = ip.toLowerCase().replace(/^\[|\]$/g, '').trim();

  // Trata IPv4 mapeado em IPv6 (ex: ::ffff:100.64.1.1)
  if (checkIp.startsWith('::ffff:')) {
    checkIp = checkIp.substring(7);
  }

  // Permitir loopback local para desenvolvimento
  if (
    checkIp === '127.0.0.1' ||
    checkIp === '::1' ||
    checkIp === 'localhost'
  ) {
    return true;
  }

  // Verifica IPv4 (Tailscale utiliza 100.64.0.0/10: de 100.64.0.0 a 100.127.255.255)
  const ipv4Parts = checkIp.split('.').map(Number);
  if (ipv4Parts.length === 4) {
    return (
      !isNaN(ipv4Parts[0]) &&
      ipv4Parts[0] === 100 &&
      ipv4Parts[1] >= 64 &&
      ipv4Parts[1] <= 127
    );
  }

  // Verifica IPv6 (Tailscale utiliza fd7a:115c:a1e0::/48)
  if (checkIp.startsWith('fd7a:115c:a1e0:')) {
    return true;
  }

  return false;
}

const MOBILE_UA_REGEX = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isPublicRoute = publicRoutes.includes(nextUrl.pathname);
  const isApiPublicRoute = apiPublicRoutes.some((route) =>
    nextUrl.pathname.startsWith(route)
  );

  // Restrição de acesso baseada no IP (Tailscale)
  if (process.env.TAILSCALE_RESTRICT_ACCESS === 'true') {
    const requiresTailscale = !isApiPublicRoute && (!isPublicRoute || nextUrl.pathname === '/login');

    if (requiresTailscale) {
      const forwardedFor = req.headers.get('x-forwarded-for');
      const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : (req as any).ip;

      if (!isTailscaleIp(clientIp)) {
        if (nextUrl.pathname.startsWith('/api/')) {
          return Response.json(
            { error: 'Acesso restrito à rede corporativa (Tailscale).' },
            { status: 403 }
          );
        }

        return new Response(
          `<html>
            <head>
              <title>403 - Acesso Restrito</title>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                  background-color: #f8fafc;
                  color: #1e293b;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  height: 100vh;
                  margin: 0;
                  padding: 1rem;
                  box-sizing: border-box;
                }
                .container {
                  text-align: center;
                  padding: 2.5rem 2rem;
                  background: white;
                  border-radius: 12px;
                  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05), 0 10px 15px -3px rgb(0 0 0 / 0.1);
                  max-width: 480px;
                  width: 100%;
                  border: 1px solid #e2e8f0;
                }
                h1 {
                  font-size: 1.5rem;
                  color: #0f172a;
                  margin-top: 0;
                  margin-bottom: 0.75rem;
                  font-weight: 700;
                }
                p {
                  color: #64748b;
                  line-height: 1.6;
                  margin-bottom: 1.5rem;
                  font-size: 0.95rem;
                }
                .badge {
                  background-color: #fee2e2;
                  color: #991b1b;
                  padding: 0.35rem 0.85rem;
                  border-radius: 9999px;
                  font-size: 0.75rem;
                  font-weight: 600;
                  text-transform: uppercase;
                  letter-spacing: 0.05em;
                  display: inline-block;
                  margin-bottom: 1.25rem;
                }
                .ip-box {
                  background: #f1f5f9;
                  padding: 0.75rem;
                  border-radius: 8px;
                  border: 1px solid #e2e8f0;
                  margin-top: 1rem;
                }
                .ip-label {
                  font-size: 0.75rem;
                  text-transform: uppercase;
                  color: #94a3b8;
                  font-weight: 600;
                  margin-bottom: 0.25rem;
                  letter-spacing: 0.05em;
                }
                .ip-value {
                  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                  color: #334155;
                  font-size: 0.9rem;
                  word-break: break-all;
                  font-weight: 500;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <span class="badge">Acesso Bloqueado</span>
                <h1>Restrição de Segurança VPN</h1>
                <p>Para acessar esta área corporativa do sistema, é necessário estar conectado à VPN privada (<strong>Tailscale</strong>).</p>
                <div class="ip-box">
                  <div class="ip-label">IP do Cliente Detectado</div>
                  <div class="ip-value">${clientIp || 'Não detectado'}</div>
                </div>
              </div>
            </body>
          </html>`,
          {
            status: 403,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
            },
          }
        );
      }
    }
  }

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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logos/).*)',],
};
