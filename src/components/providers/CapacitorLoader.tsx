'use client';

import { useEffect } from 'react';
import { maybeReloadOnChunkError } from '@/lib/chunk-reload';

// Bootstrap do cliente.
// 1) A ponte nativa do Capacitor é injetada AUTOMATICAMENTE pelo WebView quando se usa
//    server.url — não precisamos carregar /capacitor.js à mão. O antigo
//    <script src="/capacitor.js"> apontava para um arquivo inexistente (404) e foi
//    removido.
// 2) Auto-reload pós-deploy: um chunk com hash antigo some após o redeploy e o import
//    dinâmico falha (ChunkLoadError) → tela preta. Estes listeners pegam o erro fora
//    do error boundary do React (ex.: import dinâmico em handler) e recarregam 1x.
export function CapacitorLoader() {
  useEffect(() => {
    const onError = (e: ErrorEvent) =>
      maybeReloadOnChunkError((e as ErrorEvent & { error?: unknown }).error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => maybeReloadOnChunkError(e.reason);

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
