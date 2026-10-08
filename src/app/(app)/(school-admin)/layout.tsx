import { requirePermission } from "@/lib/auth/session"

/** Gate for school administration pages (/school, /users, /settings). See platform/layout.tsx. */
export default async function SchoolAdminLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("school.dashboard")
  return children
}
