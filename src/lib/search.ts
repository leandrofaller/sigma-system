/**
 * Utilitários de busca — case-insensitive, accent-insensitive, trimmed e normalizada.
 *
 * Camada Client-side (JS):
 *   - normalizeSearch / containsNormalized / startsWithNormalized
 *     Usados nos componentes React para filtrar dados já carregados.
 *
 * Camada Banco (PostgreSQL):
 *   - unaccentParam
 *     Normaliza o termo de busca antes de enviar ao banco.
 *     O banco usa immutable_unaccent() + ILIKE nas queries raw.
 */

// ── Client-side helpers ──────────────────────────────────────────

/**
 * Remove acentos, colapsa espaços e faz trim.
 * Retorna em UPPERCASE para comparação case-insensitive.
 */
export function normalizeSearch(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Verifica se `source` contém `query` de forma case-insensitive e accent-insensitive.
 */
export function containsNormalized(
  source: string | null | undefined,
  query: string | null | undefined
): boolean {
  const nq = normalizeSearch(query);
  if (!nq) return true;
  return normalizeSearch(source).includes(nq);
}

/**
 * Verifica se `source` começa com `query` de forma case-insensitive e accent-insensitive.
 */
export function startsWithNormalized(
  source: string | null | undefined,
  query: string | null | undefined
): boolean {
  const nq = normalizeSearch(query);
  if (!nq) return true;
  return normalizeSearch(source).startsWith(nq);
}

// ── Database helpers (PostgreSQL) ────────────────────────────────

/**
 * Normaliza o parâmetro de busca para uso com immutable_unaccent() no banco.
 * Remove acentos, colapsa espaços, faz trim. NÃO altera case (ILIKE cuida disso).
 */
export function unaccentParam(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
