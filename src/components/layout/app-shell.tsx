"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import {
  Award,
  Backpack,
  Bell,
  Megaphone,
  CheckSquare,
  Clock,
  NotebookPen,
  Scale,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  HeartHandshake,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Presentation,
  LogOut,
  Menu,
  School,
  Settings,
  UserCircle,
  Users,
  X,
} from "lucide-react"
import { signOut } from "@/lib/actions/auth"
import type { NavIcon, NavItem } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import { ToastProvider } from "@/components/ui/toast"
import { NotificationBell, type BellItem } from "@/components/layout/notification-bell"

const ICONS: Record<NavIcon, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  schools: Building2,
  school: School,
  users: Users,
  settings: Settings,
  profile: UserCircle,
  calendar: CalendarDays,
  layers: Layers,
  grid: LayoutGrid,
  book: BookOpen,
  student: Backpack,
  teacher: Presentation,
  family: HeartHandshake,
  enroll: ClipboardList,
  assign: ClipboardCheck,
  classes: LayoutGrid,
  clock: Clock,
  check: CheckSquare,
  award: Award,
  scale: Scale,
  homework: NotebookPen,
  bell: Bell,
  megaphone: Megaphone,
}

export type ShellProps = {
  nav: NavItem[]
  /** "Platform Administration" for super admins, otherwise the school name. */
  orgName: string
  orgLogoUrl: string | null
  userName: string
  roleLabel: string
  /** Unread in-app notifications (badge on the Notifications link). */
  unread?: number
  /** Bell data; null when notifications are off for this user/school. */
  bell?: { unread: number; recent: BellItem[] } | null
  children: React.ReactNode
}

export function AppShell({ nav, orgName, orgLogoUrl, userName, roleLabel, unread = 0, bell = null, children }: ShellProps) {
  const pathname = usePathname()
  // The drawer remembers the path it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const setOpen = (value: boolean) => setOpenOn(value ? pathname : null)

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-4">
        {orgLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary school-provided URL
          <img src={orgLogoUrl} alt="" className="size-9 rounded-md object-contain" />
        ) : (
          <span className="flex size-9 items-center justify-center rounded-md bg-brand text-white">
            <GraduationCap className="size-5" aria-hidden />
          </span>
        )}
        <p className="line-clamp-2 text-sm font-semibold leading-tight">{orgName}</p>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map((item, i) => {
          const Icon = ICONS[item.icon]
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          const heading = item.group && item.group !== nav[i - 1]?.group ? item.group : null
          return (
            <div key={item.href}>
              {heading && (
                <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{heading}</p>
              )}
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                active ? "bg-brand/10 text-brand" : "text-slate-600 hover:bg-slate-100 hover:text-foreground"
              )}
            >
              <Icon className="size-4" aria-hidden />
              {item.label}
              {item.icon === "bell" && unread > 0 && (
                <span className="ml-auto rounded-full bg-brand px-1.5 text-xs font-semibold text-white" aria-label={`${unread} unread`}>
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            </div>
          )
        })}
      </nav>
      <div className="border-t border-border p-3">
        <div className="px-3 pb-2">
          <p className="truncate text-sm font-medium">{userName}</p>
          <p className="text-xs text-muted">{roleLabel}</p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-foreground"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </form>
      </div>
    </div>
  )

  return (
    <ToastProvider>
    <div className="min-h-dvh lg:pl-64">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-surface lg:block">{sidebar}</aside>

      {/* Mobile top bar + drawer */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md p-1.5 hover:bg-slate-100"
          aria-label="Open navigation"
          aria-expanded={open}
        >
          <Menu className="size-5" />
        </button>
        <p className="flex-1 truncate text-sm font-semibold">{orgName}</p>
        {bell && <NotificationBell unread={bell.unread} recent={bell.recent} />}
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface shadow-xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1.5 hover:bg-slate-100"
              aria-label="Close navigation"
            >
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {bell && (
        <div className="hidden justify-end px-8 pt-4 lg:flex">
          <NotificationBell unread={bell.unread} recent={bell.recent} />
        </div>
      )}
      <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:pt-2 lg:pb-8">
        {children}
      </main>
    </div>
    </ToastProvider>
  )
}
