import { AppShell } from "@/components/layout/app-shell"
import { requireActiveUser } from "@/lib/auth/session"
import { ROLE_LABELS } from "@/lib/auth/permissions"
import { navForRole } from "@/lib/navigation"
import { fullName } from "@/lib/utils"
import { bellSummary } from "@/services/communication"
import { myFinanceLevel } from "@/lib/finance/access"
import { photoSrc } from "@/lib/images"

/** Every page in this group requires an active user (redirects otherwise). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireActiveUser()
  const { profile, school, settings } = ctx
  const isPlatform = profile.role === "super_admin"
  const bell = !isPlatform && ctx.features.includes("notifications") ? await bellSummary() : null
  const financeLevel = ctx.features.includes("billing") ? await myFinanceLevel() : "none"

  return (
    <div style={settings?.primary_color ? ({ "--brand": settings.primary_color } as React.CSSProperties) : undefined}>
      <AppShell
        nav={navForRole(profile.role, ctx.features, financeLevel)}
        unread={bell?.unread ?? 0}
        bell={bell}
        orgName={isPlatform ? "Platform Administration" : (school?.name ?? "")}
        orgLogoUrl={isPlatform ? null : (school?.logo_url ?? null)}
        userName={fullName(profile)}
        roleLabel={ROLE_LABELS[profile.role]}
        avatarSrc={photoSrc(profile.avatar_path, profile.avatar_url)}
      >
        {children}
      </AppShell>
    </div>
  )
}
