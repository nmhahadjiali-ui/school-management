"use client"

import { useId, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Trash2 } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { deleteSetupRecord, type SetupKind } from "@/lib/actions/setup-delete"

/**
 * "Delete" button for school setup records (school admins only). Opens a
 * dialog that explains the deletion is permanent and asks for the admin's
 * password; the server re-checks everything and refuses records in use.
 */
export function DeleteWithPassword({
  kind,
  id,
  name,
  thing,
  redirectTo,
  size = "sm",
}: {
  kind: SetupKind
  id: string
  name: string
  /** Lower-case noun for the dialog text, e.g. "section". */
  thing: string
  /** Where to go after deleting (detail pages); lists just refresh. */
  redirectTo?: string
  size?: "sm" | "md"
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const router = useRouter()
  const toast = useToast()
  const titleId = useId()
  const passwordId = useId()

  const close = () => {
    setPassword("")
    ref.current?.close()
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      setError(null)
      const result = await deleteSetupRecord(kind, id, password)
      if (!result.ok) {
        setError(result.error)
        setPassword("")
        return
      }
      close()
      if (result.message) toast?.(result.message)
      if (redirectTo) router.push(redirectTo)
      else router.refresh()
    })
  }

  return (
    <>
      <Button
        variant="secondary"
        size={size}
        className="text-red-700"
        onClick={() => {
          setError(null)
          setPassword("")
          ref.current?.showModal()
        }}
      >
        <Trash2 className="size-4" aria-hidden /> Delete
      </Button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClose={() => setPassword("")}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-0 text-foreground shadow-xl"
      >
        <form onSubmit={submit}>
          <div className="space-y-3 p-5">
            <h2 id={titleId} className="text-lg font-semibold">
              Delete {thing} “{name}”?
            </h2>
            <p className="text-sm text-muted">
              This permanently deletes the {thing} and cannot be undone. A {thing} that is already in use can&apos;t be deleted.
            </p>
            {error && <Alert tone="error">{error}</Alert>}
            <div className="space-y-1">
              <label htmlFor={passwordId} className="text-sm font-medium">
                Enter your password to confirm
              </label>
              <input
                id={passwordId}
                type="password"
                autoComplete="current-password"
                required
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border bg-slate-50 px-5 py-3">
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={pending || password.length === 0}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Delete permanently
            </Button>
          </div>
        </form>
      </dialog>
    </>
  )
}
