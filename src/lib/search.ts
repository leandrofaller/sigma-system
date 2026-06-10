export function normalizeSearchText(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function containsNormalizedText(
  source: string | null | undefined,
  query: string | null | undefined
): boolean {
  const normalizedQuery = normalizeSearchText(query).toUpperCase();
  if (!normalizedQuery) return true;
  return normalizeSearchText(source).toUpperCase().includes(normalizedQuery);
}

export function startsWithNormalizedText(
  source: string | null | undefined,
  query: string | null | undefined
): boolean {
  const normalizedQuery = normalizeSearchText(query).toUpperCase();
  if (!normalizedQuery) return true;
  return normalizeSearchText(source).toUpperCase().startsWith(normalizedQuery);
}
