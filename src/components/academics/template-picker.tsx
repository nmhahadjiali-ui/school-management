"use client"

import { useId, useRef, useState, useTransition } from "react"
import { LayoutTemplate, Loader2 } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ConfirmAction } from "@/components/ui/confirm-dialog"
import { Badge } from "@/components/ui/misc"
import { useToast } from "@/components/ui/toast"
import type { ActionResult } from "@/lib/action-result"

export type TemplateOption = { key: string; name: string; builtIn: boolean; preview: string[] }

/**
 * "Use a template" button: lists built-in and saved templates with a preview
 * of what each one creates, and applies one with a single click.
 */
export function TemplatePicker({
  title,
  description,
  templates,
  applyWarning,
  onApply,
  onDelete,
}: {
  title: string
  description: string
  templates: TemplateOption[]
  /** Shown before applying when something is replaced. */
  applyWarning?: string
  onApply: (key: string) => Promise<ActionResult>
  onDelete: (id: string) => Promise<ActionResult>
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [pending, startTransition] = useTransition()
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [confirmKey, setConfirmKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  const apply = (key: string) => {
    if (applyWarning && confirmKey !== key) {
      setConfirmKey(key)
      return
    }
    setBusyKey(key)
    setError(null)
    startTransition(async () => {
      const result = await onApply(key)
      setBusyKey(null)
      setConfirmKey(null)
      if (result.ok) {
        ref.current?.close()
        if (result.message) toast?.(result.message)
      } else setError(result.error)
    })
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setError(null)
          setConfirmKey(null)
          ref.current?.showModal()
        }}
      >
        <LayoutTemplate className="size-4" aria-hidden /> Use a template
      </Button>
      <dialog ref={ref} aria-labelledby={titleId} className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-0 text-foreground shadow-xl">
        <div className="space-y-3 p-5">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <p className="text-sm text-muted">{description}</p>
          {error && <Alert tone="error">{error}</Alert>}
          <ul className="max-h-[60vh] space-y-3 overflow-y-auto">
            {templates.map((t) => (
              <li key={t.key} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {t.name} {t.builtIn ? <Badge>Built-in</Badge> : <Badge tone="blue">Saved</Badge>}
                  </p>
                  <div className="flex gap-2">
                    {!t.builtIn && (
                      <ConfirmAction destructive trigger="Delete" title={`Delete template “${t.name}”?`} description="Only the template is deleted. Periods and bands already created from it stay." confirmLabel="Delete" onConfirm={() => onDelete(t.key)} />
                    )}
                    <Button size="sm" variant={confirmKey === t.key ? "danger" : "primary"} disabled={pending} onClick={() => apply(t.key)}>
                      {busyKey === t.key && <Loader2 className="size-4 animate-spin" aria-hidden />}
                      {confirmKey === t.key ? "Yes, replace" : "Apply"}
                    </Button>
                  </div>
                </div>
                {confirmKey === t.key && applyWarning && <p className="mt-2 text-sm text-amber-800">{applyWarning}</p>}
                <ul className="mt-2 space-y-0.5 text-xs text-muted">
                  {t.preview.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end border-t border-border bg-slate-50 px-5 py-3">
          <Button variant="secondary" onClick={() => ref.current?.close()} disabled={pending}>
            Close
          </Button>
        </div>
      </dialog>
    </>
  )
}
