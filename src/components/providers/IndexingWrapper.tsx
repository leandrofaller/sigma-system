'use client';

import { IndexingProvider } from '@/contexts/IndexingContext';
import { IndexingStatusFloat } from '@/components/apenados/IndexingStatusFloat';
import { AdvancedIndexingProvider } from '@/contexts/AdvancedIndexingContext';
import { AdvancedIndexingStatusFloat } from '@/components/apenados/AdvancedIndexingStatusFloat';
import type { ReactNode } from 'react';

export function IndexingWrapper({ children }: { children: ReactNode }) {
  return (
    <IndexingProvider>
      <AdvancedIndexingProvider>
        {children}
        <IndexingStatusFloat />
        <AdvancedIndexingStatusFloat />
      </AdvancedIndexingProvider>
    </IndexingProvider>
  );
}
