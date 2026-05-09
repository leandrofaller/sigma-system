import type { NextAuthConfig } from 'next-auth';

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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.groupId = (user as any).groupId;
        token.groupName = (user as any).groupName;
        token.phone = (user as any).phone;
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
      }
      return session;
    },
  },
  providers: [], // Providers com Node.js ficam apenas em lib/auth.ts
};
