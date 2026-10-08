"use client"

import { useTransition } from "react"
import { Check, EyeOff, Mail } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { dismiss, setRead } from "@/lib/actions/communication"

/** Per-notification actions: mark read/unread, dismiss. */
export function NotificationActions({ id, read }: { id: string; read: boolean }) {
  const [pending, start] = useTransition()
  const toast = useToast()
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) toast?.(r.error ?? "Something went wrong.", "error")
    })
  const btn = "rounded-md p-1.5 text-muted hover:bg-slate-100 hover:text-foreground disabled:opacity-50"
  return (
    <div className="flex shrink-0 gap-1">
      <button type="button" disabled={pending} className={btn} onClick={() => run(() => setRead([id], !read))} aria-label={read ? "Mark as unread" : "Mark as read"} title={read ? "Mark as unread" : "Mark as read"}>
        {read ? <Mail className="size-4" /> : <Check className="size-4" />}
      </button>
      <button type="button" disabled={pending} className={btn} onClick={() => run(() => dismiss([id]))} aria-label="Dismiss" title="Dismiss">
        <EyeOff className="size-4" />
      </button>
    </div>
  )
}
