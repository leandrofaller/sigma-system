import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { cookies, headers } from 'next/headers';
import { prisma } from './db';
import { authConfig } from '../auth.config';
import { getOrCreateDevice } from './device';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: { group: true },
        });

        if (!user || !user.isActive) return null;

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!passwordMatch) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() },
        });

        // ── Verificação de dispositivo (SUPER_ADMIN sempre passa) ─────────────
        let deviceAuthorized = true;
        if (user.role === 'SUPER_ADMIN') {
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            groupId: user.groupId,
            groupName: user.group?.name,
            phone: user.phone,
            deviceAuthorized: true,
          };
        }
        try {
          const cookieStore = await cookies();
          const deviceToken = cookieStore.get('sigma-device')?.value;

          if (deviceToken) {
            const headerStore = await headers();
            const ua = headerStore.get('user-agent') ?? '';
            const ip =
              headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ??
              headerStore.get('x-real-ip') ??
              '';

            const config = await prisma.systemConfig.findUnique({
              where: { key: 'device_auth_enabled' },
            });
            const enforcementEnabled = config?.value === true;

            const status = await getOrCreateDevice(
              deviceToken,
              user.id,
              ua,
              ip,
              enforcementEnabled,
            );

            if (status === 'REVOKED') return null;
            deviceAuthorized = status === 'AUTHORIZED';
          }
        } catch {
          // Falha silenciosa na verificação de dispositivo não bloqueia o login
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          groupId: user.groupId,
          groupName: user.group?.name,
          phone: user.phone,
          deviceAuthorized,
        };
      },
    }),
  ],
});
