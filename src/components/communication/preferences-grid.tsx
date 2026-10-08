"use client"

import { useState, useTransition } from "react"
import { useToast } from "@/components/ui/toast"
import { savePreference } from "@/lib/actions/communication"

type Channel = "in_app" | "email" | "sms" | "push"
type Row = { key: string; name: string; description: string | null; mandatory: boolean; values: Record<Channel, boolean> }

const LABELS: Record<Channel, string> = { in_app: "In-app", email: "Email", sms: "SMS", push: "Mobile push" }

/** Types x channels. Only channels the school offers are shown; mandatory types keep in-app on. */
export function PreferencesGrid({ rows, channels }: { rows: Row[]; channels: Channel[] }) {
  const [state, setState] = useState(rows)
  const [pending, start] = useTransition()
  const toast = useToast()

  const toggle = (key: string, channel: Channel) => {
    const row = state.find((r) => r.key === key)!
    const values = { ...row.values, [channel]: !row.values[channel] }
    setState((s) => s.map((r) => (r.key === key ? { ...r, values } : r)))
    start(async () => {
      const result = await savePreference({
        notification_type: key,
        in_app_enabled: values.in_app,
        email_enabled: values.email,
        sms_enabled: values.sms,
        push_enabled: values.push,
      })
      if (!result.ok) {
        toast?.(result.error, "error")
        setState((s) => s.map((r) => (r.key === key ? row : r)))
      }
    })
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Notification preferences" aria-busy={pending}>
        <thead>
          <tr className="border-b border-border bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <th scope="col" className="px-4 py-2.5">Notification</th>
            {channels.map((c) => <th key={c} scope="col" className="px-4 py-2.5 text-center">{LABELS[c]}</th>)}
          </tr>
        </thead>
        <tbody>
          {state.map((r) => (
            <tr key={r.key} className="border-b border-border">
              <td className="px-4 py-3">
                <p className="font-medium">{r.name}{r.mandatory && <span className="ml-2 text-xs font-normal text-muted">(required)</span>}</p>
                {r.description && <p className="text-xs text-muted">{r.description}</p>}
              </td>
              {channels.map((c) => {
                const locked = r.mandatory
                return (
                  <td key={c} className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--brand)]"
                      aria-label={`${LABELS[c]} for ${r.name}`}
                      checked={locked && c === "in_app" ? true : r.values[c]}
                      disabled={locked}
                      onChange={() => toggle(r.key, c)}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
