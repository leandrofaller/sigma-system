'use client';

import { useSession } from 'next-auth/react';
import { IndexingProvider } from '@/contexts/IndexingContext';
import { VisitanteIndexingProvider } from '@/contexts/VisitanteIndexingContext';
import { ServidorIndexingProvider } from '@/contexts/ServidorIndexingContext';
import { AntelopeIndexingProvider } from '@/contexts/AntelopeIndexingContext';
import { IndexingStatusFloat } from '@/components/apenados/IndexingStatusFloat';
import { VisitanteIndexingStatusFloat } from '@/components/visitantes/VisitanteIndexingStatusFloat';
import { ServidorIndexingStatusFloat } from '@/components/servidores/ServidorIndexingStatusFloat';
import type { ReactNode } from 'react';

export function IndexingWrapper({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const isSuperAdmin = (session?.user as any)?.role === 'SUPER_ADMIN';

  return (
    <IndexingProvider>
      <VisitanteIndexingProvider>
        <ServidorIndexingProvider>
          <AntelopeIndexingProvider>
            {children}
            {isSuperAdmin && (
              <>
                <IndexingStatusFloat />
                <VisitanteIndexingStatusFloat />
                <ServidorIndexingStatusFloat />
              </>
            )}
          </AntelopeIndexingProvider>
        </ServidorIndexingProvider>
      </VisitanteIndexingProvider>
    </IndexingProvider>
  );
}

