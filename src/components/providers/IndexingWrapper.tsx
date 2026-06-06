'use client';

import { IndexingProvider } from '@/contexts/IndexingContext';
import { IndexingStatusFloat } from '@/components/apenados/IndexingStatusFloat';
import type { ReactNode } from 'react';

export function IndexingWrapper({ children }: { children: ReactNode }) {
  return (
    <IndexingProvider>
      {children}
      <IndexingStatusFloat />
    </IndexingProvider>
  );
}
