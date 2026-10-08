"use client"

import { useId, useRef, useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Form, SubmitButton } from "@/components/ui/form"
import type { ActionResult } from "@/lib/action-result"

/**
 * A button that opens a modal form bound to a Server Action. Closes and toasts
 * on success; field errors stay in the dialog. The form remounts on each open
 * so it always starts from the current values.
 */
export function FormDialog({
  trigger,
  title,
  description,
  action,
  submitLabel = "Save",
  variant = "primary",
  size = "md",
  children,
}: {
  trigger: React.ReactNode
  title: string
  description?: string
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>
  submitLabel?: string
  variant?: "primary" | "secondary" | "ghost"
  size?: "sm" | "md"
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [openCount, setOpenCount] = useState(0)
  const titleId = useId()

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => {
          setOpenCount((n) => n + 1)
          ref.current?.showModal()
        }}
      >
        {trigger}
      </Button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-border bg-surface p-0 text-left text-foreground shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="rounded-md p-1 hover:bg-slate-100">
            <X className="size-5" />
          </button>
        </div>
        <div className="px-5 py-4">
          {openCount > 0 && (
            <Form key={openCount} action={action} onSuccess={() => ref.current?.close()}>
              {children}
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button variant="secondary" onClick={() => ref.current?.close()}>
                  Cancel
                </Button>
                <SubmitButton>{submitLabel}</SubmitButton>
              </div>
            </Form>
          )}
        </div>
      </dialog>
    </>
  )
}
