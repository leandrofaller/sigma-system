'use client';

import { useSession } from 'next-auth/react';
import { IndexingProvider } from '@/contexts/IndexingContext';
import { VisitanteIndexingProvider } from '@/contexts/VisitanteIndexingContext';
import { IndexingStatusFloat } from '@/components/apenados/IndexingStatusFloat';
import { VisitanteIndexingStatusFloat } from '@/components/visitantes/VisitanteIndexingStatusFloat';
import type { ReactNode } from 'react';

export function IndexingWrapper({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const isSuperAdmin = (session?.user as any)?.role === 'SUPER_ADMIN';

  return (
    <IndexingProvider>
      <VisitanteIndexingProvider>
        {children}
        {isSuperAdmin && (
          <>
            <IndexingStatusFloat />
            <VisitanteIndexingStatusFloat />
          </>
        )}
      </VisitanteIndexingProvider>
    </IndexingProvider>
  );
}
