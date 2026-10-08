import { AppShell } from "@/components/layout/app-shell"
import { requireActiveUser } from "@/lib/auth/session"
import { ROLE_LABELS } from "@/lib/auth/permissions"
import { navForRole } from "@/lib/navigation"
import { fullName } from "@/lib/utils"

/** Every page in this group requires an active user (redirects otherwise). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireActiveUser()
  const { profile, school, settings } = ctx
  const isPlatform = profile.role === "super_admin"

  return (
    <div style={settings?.primary_color ? ({ "--brand": settings.primary_color } as React.CSSProperties) : undefined}>
      <AppShell
        nav={navForRole(profile.role)}
        orgName={isPlatform ? "Platform Administration" : (school?.name ?? "")}
        orgLogoUrl={isPlatform ? null : (school?.logo_url ?? null)}
        userName={fullName(profile)}
        roleLabel={ROLE_LABELS[profile.role]}
      >
        {children}
      </AppShell>
    </div>
  )
}
