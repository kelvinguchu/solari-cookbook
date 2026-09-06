export interface CookieHeaderResult {
  header?: string
  removedNames: string[]
}

export function withoutNamedCookies(
  header: string | undefined,
  cookieNames: readonly string[],
): CookieHeaderResult {
  if (!header || cookieNames.length === 0) {
    return { removedNames: [] }
  }
  const selected = new Set(cookieNames)
  const removed = new Set<string>()
  const retained = header.split(";").flatMap((segment) => {
    const cookie = segment.trim()
    const separator = cookie.indexOf("=")
    const name = separator < 0 ? cookie : cookie.slice(0, separator)
    if (selected.has(name)) {
      removed.add(name)
      return []
    }
    return cookie ? [cookie] : []
  })
  if (removed.size === 0) {
    return { removedNames: [] }
  }
  return {
    ...(retained.length > 0 ? { header: retained.join("; ") } : {}),
    removedNames: [...removed],
  }
}
