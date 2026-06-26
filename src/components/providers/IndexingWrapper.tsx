'use client';

import { IndexingProvider } from '@/contexts/IndexingContext';
import { VisitanteIndexingProvider } from '@/contexts/VisitanteIndexingContext';
import { IndexingStatusFloat } from '@/components/apenados/IndexingStatusFloat';
import { VisitanteIndexingStatusFloat } from '@/components/visitantes/VisitanteIndexingStatusFloat';
import type { ReactNode } from 'react';

export function IndexingWrapper({ children }: { children: ReactNode }) {
  return (
    <IndexingProvider>
      <VisitanteIndexingProvider>
        {children}
        <IndexingStatusFloat />
        <VisitanteIndexingStatusFloat />
      </VisitanteIndexingProvider>
    </IndexingProvider>
  );
}
