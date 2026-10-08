import { requirePermission } from "@/lib/auth/session"

/**
 * Gate for every /platform page. Checks run in layouts (outside the segment's
 * loading boundary) so denials are real HTTP redirects, not streamed ones.
 * Pages still check their specific permission.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("platform.dashboard")
  return children
}
