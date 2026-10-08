"use client"

import { useState, useTransition } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { RecordPicker } from "@/components/data/record-picker"
import { saveAnnouncement } from "@/lib/actions/communication"
import type { ActionResult } from "@/lib/action-result"

type TargetType = "school" | "grade_level" | "section" | "class" | "user"
type Role = "school_admin" | "teacher" | "student" | "parent"
type Option = { value: string; label: string }
export type EditorTarget = { target_type: TargetType; target_id: string | null; roles: Role[] | null; label?: string }

const ROLE_LABELS: Record<Role, string> = { student: "Students", parent: "Parents", teacher: "Teachers", school_admin: "Administrators" }
const TYPE_LABELS: Record<TargetType, string> = { school: "Entire school", grade_level: "Grade level", section: "Section", class: "Class (subject)", user: "Specific person" }

const input = "block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm"

/**
 * Announcement editor with a flexible audience builder. Each row = WHO
 * (school / grade / section / class / person) optionally narrowed by ROLE.
 * The database re-validates every row (same school; teachers limited to their
 * own sections and classes).
 */
export function AnnouncementEditor({
  value,
  options,
  allowed,
  timezoneLabel,
}: {
  value?: { id: string; title: string; content: string; priority: string; publish_at: string; expires_at: string; status: string; targets: EditorTarget[] }
  options: { grades: Option[]; sections: Option[]; classes: Option[] }
  /** Target types this author may use (admins: all; teachers: section/class). */
  allowed: TargetType[]
  timezoneLabel: string
}) {
  const [title, setTitle] = useState(value?.title ?? "")
  const [content, setContent] = useState(value?.content ?? "")
  const [priority, setPriority] = useState(value?.priority ?? "normal")
  const [timing, setTiming] = useState<"now" | "schedule">(value?.publish_at ? "schedule" : "now")
  const [publishAt, setPublishAt] = useState(value?.publish_at ?? "")
  const [expiresAt, setExpiresAt] = useState(value?.expires_at ?? "")
  const [targets, setTargets] = useState<EditorTarget[]>(value?.targets.length ? value.targets : [{ target_type: allowed[0], target_id: null, roles: null }])
  const [result, setResult] = useState<ActionResult | null>(null)
  const [pending, start] = useTransition()
  const locked = value?.status === "published" || value?.status === "archived"
  const errors = result && !result.ok ? result.fieldErrors ?? {} : {}

  const update = (i: number, patch: Partial<EditorTarget>) => setTargets((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)))
  const toggleRole = (i: number, role: Role) => {
    const current = targets[i].roles ?? []
    const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role]
    update(i, { roles: next.length ? next : null })
  }
  const submit = (intent: "draft" | "publish") =>
    start(async () => {
      setResult(null)
      const r = await saveAnnouncement({
        id: value?.id ?? null,
        title,
        content,
        priority: priority as "low" | "normal" | "high" | "urgent",
        publish_at: timing === "schedule" ? publishAt || null : null,
        expires_at: expiresAt || null,
        targets: targets.map(({ target_type, target_id, roles }) => ({ target_type, target_id, roles })),
        intent,
      })
      setResult(r ?? null)
    })

  const idOptions = (t: TargetType) => (t === "grade_level" ? options.grades : t === "section" ? options.sections : options.classes)

  return (
    <div className="space-y-6">
      {result && !result.ok && <Alert tone="error">{result.error}</Alert>}
      <div className="space-y-1.5">
        <label htmlFor="a-title" className="block text-sm font-medium">Title <span className="text-red-600">*</span></label>
        <input id="a-title" className={input} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} aria-invalid={errors.title ? true : undefined} />
        {errors.title && <p className="text-sm text-red-600">{errors.title[0]}</p>}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="a-content" className="block text-sm font-medium">Message <span className="text-red-600">*</span></label>
        <textarea id="a-content" rows={8} className={input} value={content} maxLength={20000} onChange={(e) => setContent(e.target.value)} aria-invalid={errors.content ? true : undefined} />
        <p className="text-xs text-muted">Plain text. Line breaks are kept. The first 280 characters appear in notifications.</p>
        {errors.content && <p className="text-sm text-red-600">{errors.content[0]}</p>}
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Audience</legend>
        {locked && <p className="text-sm text-muted">The audience of a published announcement cannot be changed.</p>}
        {targets.map((t, i) => (
          <div key={i} className="space-y-3 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1 text-sm">
                <span className="block font-medium">Send to</span>
                <select className={input} value={t.target_type} disabled={locked} onChange={(e) => update(i, { target_type: e.target.value as TargetType, target_id: null, label: undefined })}>
                  {allowed.map((a) => <option key={a} value={a}>{TYPE_LABELS[a]}</option>)}
                </select>
              </label>
              {(t.target_type === "grade_level" || t.target_type === "section" || t.target_type === "class") && (
                <label className="min-w-56 flex-1 space-y-1 text-sm">
                  <span className="block font-medium">{TYPE_LABELS[t.target_type]}</span>
                  <select className={input} value={t.target_id ?? ""} disabled={locked} onChange={(e) => update(i, { target_id: e.target.value || null })}>
                    <option value="">Choose…</option>
                    {idOptions(t.target_type).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              )}
              {t.target_type === "user" && (
                <div className="min-w-64 flex-1">
                  {locked ? <p className="text-sm">{t.label ?? "Selected person"}</p> : (
                    <RecordPicker name={`person-${i}`} label="Person" entity="users" initial={t.target_id ? { id: t.target_id, label: t.label ?? "Selected person" } : null} onSelect={(o) => update(i, { target_id: o?.id ?? null, label: o?.label })} />
                  )}
                </div>
              )}
              {!locked && targets.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => setTargets((ts) => ts.filter((_, j) => j !== i))} aria-label="Remove this audience">
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
            {t.target_type !== "user" && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-muted">Only:</span>
                {(t.target_type === "school" ? (["student", "parent", "teacher", "school_admin"] as Role[]) : (["student", "parent", "teacher"] as Role[])).map((r) => (
                  <label key={r} className="inline-flex items-center gap-1.5">
                    <input type="checkbox" className="size-4 accent-[var(--brand)]" disabled={locked} checked={t.roles?.includes(r) ?? false} onChange={() => toggleRole(i, r)} />
                    {ROLE_LABELS[r]}
                  </label>
                ))}
                <span className="text-xs text-muted">{t.roles ? "" : "(none ticked = everyone)"}</span>
              </div>
            )}
          </div>
        ))}
        {errors.targets && <p className="text-sm text-red-600">{errors.targets[0]}</p>}
        {!locked && (
          <Button variant="secondary" size="sm" onClick={() => setTargets((ts) => [...ts, { target_type: allowed[0], target_id: null, roles: null }])}>
            <Plus className="size-4" aria-hidden /> Add another audience
          </Button>
        )}
      </fieldset>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="space-y-1.5 text-sm">
          <span className="block font-medium">Priority</span>
          <select className={input} value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent (always shown, even if muted)</option>
          </select>
        </label>
        {!locked && (
          <fieldset className="space-y-1.5 text-sm">
            <legend className="font-medium">When</legend>
            <label className="mr-4 inline-flex items-center gap-1.5"><input type="radio" name="timing" checked={timing === "now"} onChange={() => setTiming("now")} /> Publish now</label>
            <label className="inline-flex items-center gap-1.5"><input type="radio" name="timing" checked={timing === "schedule"} onChange={() => setTiming("schedule")} /> Schedule</label>
            {timing === "schedule" && <input type="datetime-local" className={input} value={publishAt} onChange={(e) => setPublishAt(e.target.value)} aria-label="Publish at" />}
            {errors.publish_at && <p className="text-sm text-red-600">{errors.publish_at[0]}</p>}
          </fieldset>
        )}
        <label className="space-y-1.5 text-sm">
          <span className="block font-medium">Expires (optional)</span>
          <input type="datetime-local" className={input} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          {errors.expires_at && <span className="block text-red-600">{errors.expires_at[0]}</span>}
        </label>
      </div>
      <p className="text-xs text-muted">Times are in the school&apos;s time zone ({timezoneLabel}). Scheduled announcements are published automatically by the server.</p>

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        {pending && <Loader2 className="size-5 animate-spin self-center text-muted" aria-label="Saving" />}
        <Button variant="secondary" disabled={pending} onClick={() => submit("draft")}>{locked ? "Save changes" : "Save draft"}</Button>
        {!locked && (
          <Button disabled={pending} onClick={() => submit("publish")}>
            {timing === "schedule" ? "Schedule" : "Publish now"}
          </Button>
        )}
      </div>
    </div>
  )
}
