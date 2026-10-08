// Server-side list state (search, filters, sort, pagination) lives in the URL,
// so lists are shareable, back-button friendly, and only one page of rows is
// ever sent to the browser.

export type SearchParams = Record<string, string | string[] | undefined>

export type ListParams<S extends string = string> = {
  q: string
  page: number
  pageSize: number
  sort: S
  dir: "asc" | "desc"
  filters: Record<string, string>
}

export type Page<T> = { rows: T[]; total: number; page: number; pageSize: number }

export const PAGE_SIZE = 20

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""

/** Parse and whitelist list parameters. Unknown sort keys fall back to the default. */
export function parseListParams<S extends string>(
  sp: SearchParams,
  opts: { sorts: readonly S[]; defaultSort: S; defaultDir?: "asc" | "desc"; filters?: readonly string[] }
): ListParams<S> {
  const sort = (opts.sorts as readonly string[]).includes(first(sp.sort)) ? (first(sp.sort) as S) : opts.defaultSort
  const dir = first(sp.dir) === "desc" ? "desc" : first(sp.dir) === "asc" ? "asc" : (opts.defaultDir ?? "asc")
  const page = Math.max(1, Math.min(10_000, Number.parseInt(first(sp.page), 10) || 1))
  const filters: Record<string, string> = {}
  for (const f of opts.filters ?? []) {
    const v = first(sp[f]).trim()
    if (v) filters[f] = v.slice(0, 100)
  }
  return { q: first(sp.q).trim().slice(0, 100), page, pageSize: PAGE_SIZE, sort, dir, filters }
}

/** Rows to request for a page (inclusive range for Supabase .range()). */
export const pageRange = (p: { page: number; pageSize: number }) =>
  [(p.page - 1) * p.pageSize, p.page * p.pageSize - 1] as const

/** `%term%` for ILIKE, with LIKE wildcards in the user's input escaped. */
export const likePattern = (q: string) => `%${q.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`

/** Build a URL for the same list with some parameters changed (null removes). */
export function listHref(pathname: string, current: SearchParams, changes: Record<string, string | number | null>) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(current)) {
    const value = first(v)
    if (value) params.set(k, value)
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === "") params.delete(k)
    else params.set(k, String(v))
  }
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

/** Uuid-looking filter values only (filters are passed to .eq()). */
export const isUuid = (v: string | undefined): v is string =>
  !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

/**
 * PostgREST `or()` filter matching `q` in any of `columns`. The value is
 * double-quoted and escaped so user input (commas, parentheses, quotes) can
 * never change the filter expression itself.
 */
export function orIlike(columns: string[], q: string) {
  const value = `"${likePattern(q).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
  return columns.map((c) => `${c}.ilike.${value}`).join(",")
}
