"use client"

import { createContext, useCallback, useContext, useState } from "react"
import { AlertCircle, CheckCircle2, X } from "lucide-react"
import { cn } from "@/lib/utils"

type Toast = { id: number; tone: "success" | "error"; message: string }
type ToastFn = (message: string, tone?: Toast["tone"]) => void

const ToastContext = createContext<ToastFn | null>(null)

/** Success/error notifications for the signed-in app. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const toast = useCallback<ToastFn>(
    (message, tone = "success") => {
      const id = Date.now() + Math.random()
      setToasts((t) => [...t.slice(-3), { id, tone, message }])
      setTimeout(() => dismiss(id), 4500)
    },
    [dismiss]
  )

  return (
    <ToastContext value={toast}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto">
        {toasts.map((t) => {
          const Icon = t.tone === "success" ? CheckCircle2 : AlertCircle
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-md border bg-surface px-3 py-2.5 text-sm shadow-lg",
                t.tone === "success" ? "border-green-200" : "border-red-200"
              )}
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", t.tone === "success" ? "text-green-600" : "text-red-600")} aria-hidden />
              <p className="flex-1">{t.message}</p>
              <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-muted hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext>
  )
}

/** Returns the toast function, or null outside the signed-in app (e.g. auth pages). */
export function useToast() {
  return useContext(ToastContext)
}
