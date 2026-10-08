"use client"

import { useId, useRef, useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert } from "@/components/ui/alert"
import { useToast } from "@/components/ui/toast"
import type { ActionResult } from "@/lib/action-result"

/**
 * Button that asks for confirmation (native <dialog>: focus trap + Esc to close)
 * before running a Server Action. Used for destructive/impactful actions.
 */
export function ConfirmAction({
  trigger,
  size = "sm",
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
}: {
  trigger: React.ReactNode
  size?: "sm" | "md"
  title: string
  description: React.ReactNode
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => Promise<ActionResult>
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const titleId = useId()

  return (
    <>
      <Button
        variant={destructive ? "secondary" : "primary"}
        size={size}
        className={destructive ? "text-red-700" : undefined}
        onClick={() => {
          setError(null)
          ref.current?.showModal()
        }}
      >
        {trigger}
      </Button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-0 text-foreground shadow-xl"
      >
        <div className="space-y-3 p-5">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <div className="text-sm text-muted">{description}</div>
          {error && <Alert tone="error">{error}</Alert>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border bg-slate-50 px-5 py-3">
          <Button variant="secondary" onClick={() => ref.current?.close()} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await onConfirm()
                if (result.ok) {
                  ref.current?.close()
                  if (result.message) toast?.(result.message)
                }
                else setError(result.error)
              })
            }
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </div>
      </dialog>
    </>
  )
}
