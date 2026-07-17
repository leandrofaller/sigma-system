// Auto-recuperação de "ChunkLoadError" pós-deploy.
//
// O Next.js nomeia os chunks JS/CSS com hash. A cada redeploy os hashes mudam, mas
// um cliente já aberto (especialmente o WebView do app mobile, que carrega o site
// remoto) ainda referencia os chunks ANTIGOS. O próximo import dinâmico busca um
// arquivo que não existe mais → ChunkLoadError → tela preta. Recarregar UMA vez
// resolve: o cliente pega o HTML e os chunks novos.

const RELOAD_KEY = 'sygma_chunk_reload_ts'
const COOLDOWN_MS = 15_000

export function isChunkLoadError(err: unknown): boolean {
  const name =
    err && typeof err === 'object' && 'name' in err ? String((err as { name?: unknown }).name) : ''
  const msg =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message?: unknown }).message)
      : String(err ?? '')
  return (
    name === 'ChunkLoadError' ||
    /ChunkLoadError|Loading chunk [\d]+ failed|Loading CSS chunk|dynamically imported module|Importing a module script failed|Failed to fetch dynamically imported/i.test(
      msg
    )
  )
}

/**
 * Se `err` for um erro de chunk, recarrega a página UMA vez (com cooldown para não
 * entrar em loop caso o deploy esteja genuinamente quebrado). Retorna true se disparou
 * o reload. No-op no servidor.
 */
export function maybeReloadOnChunkError(err: unknown): boolean {
  if (typeof window === 'undefined') return false
  if (!isChunkLoadError(err)) return false
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || '0')
    if (Date.now() - last < COOLDOWN_MS) return false // já recarregou há pouco: evita loop
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // sessionStorage indisponível (modo privado/WebView restrito) — ainda tenta 1 reload
  }
  window.location.reload()
  return true
}
