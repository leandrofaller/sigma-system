import type { NextAuthConfig } from 'next-auth';

if (!process.env.NEXTAUTH_SECRET) {
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
    throw new Error('[auth] NEXTAUTH_SECRET é obrigatória em produção. Defina a variável de ambiente antes de iniciar o servidor.');
  } else {
    console.warn('[auth] ATENÇÃO: NEXTAUTH_SECRET ausente. Defina em .env.local antes de ir para produção.');
  }
}

// Configuração Edge-compatible (sem imports Node.js: bcrypt, prisma, etc.)
export const authConfig: NextAuthConfig = {
  trustHost: true,
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.groupId = (user as any).groupId;
        token.groupName = (user as any).groupName;
        token.phone = (user as any).phone;
        token.deviceAuthorized = (user as any).deviceAuthorized ?? true;
        token.geoStatus = (user as any).geoStatus || 'pending';
      }
      if (trigger === 'update' && session) {
        if (typeof session.deviceAuthorized === 'boolean') {
          token.deviceAuthorized = session.deviceAuthorized;
        }
        if (typeof session.geoStatus === 'string') {
          token.geoStatus = session.geoStatus;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.groupId = token.groupId as string;
        session.user.groupName = token.groupName as string;
        session.user.phone = token.phone as string;
        session.user.deviceAuthorized = token.deviceAuthorized as boolean;
        session.user.geoStatus = token.geoStatus as string;
      }
      return session;
    },
  },
  providers: [], // Providers com Node.js ficam apenas em lib/auth.ts
};
