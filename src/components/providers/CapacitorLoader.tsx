'use client';

import { useEffect } from 'react';

export function CapacitorLoader() {
  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.userAgent.includes('SYGMA-MOBILE')) {
      // Evita injetar mais de uma vez
      if (document.getElementById('capacitor-bridge')) {
        return;
      }

      const script = document.createElement('script');
      script.id = 'capacitor-bridge';
      script.src = '/capacitor.js';
      script.async = true;
      document.body.appendChild(script);
      console.log('[CapacitorLoader] Script capacitor.js injetado com sucesso.');
    }
  }, []);

  return null;
}
