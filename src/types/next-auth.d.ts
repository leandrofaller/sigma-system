import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      groupId?: string | null;
      groupName?: string | null;
      phone?: string | null;
      deviceAuthorized?: boolean;
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    role: string;
    groupId?: string | null;
    groupName?: string | null;
    phone?: string | null;
    deviceAuthorized?: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: string;
    groupId?: string | null;
    groupName?: string | null;
    phone?: string | null;
    deviceAuthorized?: boolean;
  }
}
