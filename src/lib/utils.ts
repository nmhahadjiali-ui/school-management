/** Join class names, skipping falsy values. */
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ")
}

type Named = { first_name: string; last_name: string; email?: string }

export function fullName(p: Named) {
  return `${p.first_name} ${p.last_name}`.trim() || p.email || "Unnamed user"
}

export function initials(p: Named) {
  const s = `${p.first_name.charAt(0)}${p.last_name.charAt(0)}`.trim()
  return (s || p.email?.charAt(0) || "?").toUpperCase()
}

export function formatDate(value: string | null | undefined, timeZone?: string) {
  if (!value) return "—"
  try {
    return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone }).format(new Date(value))
  } catch {
    return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value))
  }
}

/**
 * Only allow redirects to paths inside this app. Rejects protocol-relative
 * ("//evil.com") and backslash ("/\evil.com") forms, which browsers treat as
 * external URLs.
 */
export function safeRedirectPath(next: string | null | undefined, fallback = "/dashboard") {
  return next && /^\/(?![/\\])/.test(next) && !/[\r\n\t]/.test(next) ? next : fallback
}
