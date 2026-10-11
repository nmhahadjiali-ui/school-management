import type { Metadata } from "next"
import { WelcomeSplash } from "@/components/layout/welcome-splash"
import { requireActiveUser } from "@/lib/auth/session"
import { safeRedirectPath } from "@/lib/utils"

export const metadata: Metadata = { title: "Welcome" }

/** Shown right after signing in: the school's logo and name, then the requested page (default: dashboard). */
export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const ctx = await requireActiveUser()
  const { next } = await searchParams
  const isPlatform = ctx.profile.role === "super_admin"
  const brand = ctx.settings?.primary_color
  return (
    <div style={brand ? ({ "--brand": brand } as React.CSSProperties) : undefined}>
      <WelcomeSplash
        name={isPlatform ? "Platform Administration" : (ctx.school?.name ?? "School Management")}
        logoUrl={isPlatform ? null : (ctx.school?.logo_url ?? null)}
        firstName={ctx.profile.first_name ?? ""}
        next={safeRedirectPath(typeof next === "string" ? next : null)}
      />
    </div>
  )
}
