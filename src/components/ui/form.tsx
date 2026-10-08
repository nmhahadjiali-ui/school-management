"use client"

import { createContext, startTransition, useActionState, useContext, useId, useRef } from "react"
import { Loader2 } from "lucide-react"
import type { ActionResult } from "@/lib/action-result"
import { Button } from "@/components/ui/button"
import { Alert } from "@/components/ui/alert"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

type FormAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>

const FormContext = createContext<{ state: ActionResult | null; pending: boolean }>({ state: null, pending: false })

/**
 * Form bound to a Server Action. Submits inside a transition (so typed values
 * are kept when validation fails), and exposes field errors to <Field>.
 * Success shows a toast inside the app (inline message on auth pages); errors
 * show inline. Thrown errors (e.g. network failures) reach the error boundary.
 */
export function Form({
  action,
  children,
  className,
  onSuccess,
}: {
  action: FormAction
  children: React.ReactNode
  className?: string
  onSuccess?: () => void
}) {
  const toast = useToast()
  const [state, formAction, pending] = useActionState(async (prev: ActionResult | null, fd: FormData) => {
    const result = await action(prev, fd)
    if (result?.ok) {
      if (toast && result.message) toast(result.message)
      onSuccess?.()
    }
    return result
  }, null)
  const ref = useRef<HTMLFormElement>(null)

  return (
    <FormContext value={{ state, pending }}>
      <form
        ref={ref}
        noValidate
        className={cn("space-y-4", className)}
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          startTransition(() => formAction(fd))
        }}
      >
        {state && !state.ok && <Alert tone="error">{state.error}</Alert>}
        {state?.ok && !toast && state.message && <Alert tone="success">{state.message}</Alert>}
        {children}
      </form>
    </FormContext>
  )
}

export function SubmitButton({ children, variant }: { children: React.ReactNode; variant?: "primary" | "danger" }) {
  const { pending } = useContext(FormContext)
  return (
    <Button type="submit" variant={variant} disabled={pending} aria-busy={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </Button>
  )
}

const inputClass =
  "block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 disabled:bg-slate-50 aria-[invalid=true]:border-red-500"

type FieldProps = {
  name: string
  label: string
  hint?: string
  className?: string
} & (
  | ({ as?: "input" } & React.ComponentProps<"input">)
  | ({ as: "select"; options: { value: string; label: string }[] } & React.ComponentProps<"select">)
  | ({ as: "textarea" } & React.ComponentProps<"textarea">)
)

/** Labelled input/select/textarea that shows its Server Action field errors. */
export function Field(props: FieldProps) {
  const { name, label, hint, className } = props
  const { state } = useContext(FormContext)
  const id = useId()
  const errors = state && !state.ok ? state.fieldErrors?.[name] : undefined
  const describedBy = errors ? `${id}-error` : hint ? `${id}-hint` : undefined
  const common = { id, name, "aria-invalid": errors ? true : undefined, "aria-describedby": describedBy }

  let control: React.ReactNode
  if (props.as === "select") {
    const { as: _as, options, name: _n, label: _l, hint: _h, className: _c, ...rest } = props
    control = (
      <select {...rest} {...common} className={inputClass}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  } else if (props.as === "textarea") {
    const { as: _as, name: _n, label: _l, hint: _h, className: _c, ...rest } = props
    control = <textarea rows={3} {...rest} {...common} className={inputClass} />
  } else {
    const { as: _as, name: _n, label: _l, hint: _h, className: _c, ...rest } = props
    control = <input {...rest} {...common} className={cn(inputClass, rest.type === "color" && "h-10 p-1")} />
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {"required" in props && props.required && <span className="text-red-600"> *</span>}
      </label>
      {control}
      {errors ? (
        <p id={`${id}-error`} className="text-sm text-red-600">
          {errors[0]}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/** Inline checkbox for boolean form fields (submits "on" when checked). */
export function CheckboxField({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked?: boolean; hint?: string }) {
  const id = useId()
  return (
    <div className="flex items-start gap-2">
      <input id={id} type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4 rounded border-border accent-[var(--brand)]" />
      <label htmlFor={id} className="text-sm">
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </label>
    </div>
  )
}

/** First Server Action field error for `name` in the enclosing <Form>. */
export function useFieldError(name: string) {
  const { state } = useContext(FormContext)
  return state && !state.ok ? state.fieldErrors?.[name]?.[0] : undefined
}
