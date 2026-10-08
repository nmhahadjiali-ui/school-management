"use client"

import Link from "next/link"
import { useEffect, useId, useRef, useState } from "react"
import { Bell } from "lucide-react"
import { cn } from "@/lib/utils"

export type BellItem = { id: string; title: string; message: string; read_at: string | null; created_at: string; priority: string }

/** Unread badge + dropdown of recent notifications. Items open via /notifications/:id/open (marks read, then deep-links). */
export function NotificationBell({ unread, recent }: { unread: number; recent: BellItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", close)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", close)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100 hover:text-foreground"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-brand px-1 text-center text-[11px] font-semibold leading-5 text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div id={menuId} className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && <span className="text-xs text-muted">{unread} unread</span>}
          </div>
          {recent.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">You&apos;re all caught up.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {recent.map((n) => (
                <li key={n.id}>
                  <a href={`/notifications/${n.id}/open`} className={cn("block px-4 py-2.5 hover:bg-slate-50", !n.read_at && "bg-brand/5")}>
                    <p className={cn("text-sm", !n.read_at && "font-semibold")}>
                      {(n.priority === "urgent" || n.priority === "high") && <span className="mr-1 text-red-600" aria-label="Important">●</span>}
                      {n.title}
                    </p>
                    <p className="line-clamp-2 text-xs text-muted">{n.message}</p>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between border-t border-border px-4 py-2.5 text-sm">
            <Link href="/notifications" onClick={() => setOpen(false)} className="font-medium text-brand hover:underline">View all</Link>
            <Link href="/notifications/preferences" onClick={() => setOpen(false)} className="text-muted hover:text-foreground">Preferences</Link>
          </div>
        </div>
      )}
    </div>
  )
}
