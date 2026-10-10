"use client"

import { useOptimistic, useState, useTransition } from "react"
import { ConfirmAction } from "@/components/ui/confirm-dialog"
import { Alert } from "@/components/ui/alert"
import { setSchoolFeature, setSchoolStatus } from "@/lib/actions/schools"
import { groupFeatures } from "@/lib/feature-groups"
import type { FeatureAvailability, SchoolFeatureRow } from "@/services/features"
import type { SchoolStatus } from "@/types/domain"

export function SchoolStatusControl({ schoolId, name, status }: { schoolId: string; name: string; status: SchoolStatus }) {
  return status === "active" ? (
    <ConfirmAction
      destructive
      trigger="Deactivate school"
      title={`Deactivate ${name}?`}
      description="All users of this school will immediately lose access. No data is deleted, and you can reactivate the school at any time."
      confirmLabel="Deactivate"
      onConfirm={() => setSchoolStatus(schoolId, "inactive")}
    />
  ) : (
    <ConfirmAction
      trigger="Activate school"
      title={`Activate ${name}?`}
      description="Active users of this school will be able to sign in again."
      confirmLabel="Activate"
      onConfirm={() => setSchoolStatus(schoolId, "active")}
    />
  )
}

const NOTE: Partial<Record<FeatureAvailability, string>> = {
  coming_soon: "Not built yet; it can be enabled once it is released.",
  included: "Always part of the system; this switch has no effect.",
}

/** Per-school feature switches (super admin). */
export function FeatureToggles({ schoolId, features, testMode = [] }: { schoolId: string; features: SchoolFeatureRow[]; testMode?: string[] }) {
  const [optimistic, setOptimistic] = useOptimistic(features, (rows, change: { key: string; enabled: boolean }) =>
    rows.map((r) => (r.key === change.key ? { ...r, enabled: change.enabled } : r))
  )
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div>
      {error && (
        <Alert tone="error" className="m-4">
          {error}
        </Alert>
      )}
      {groupFeatures(optimistic, testMode).map((group) => (
        <section key={group.key} aria-labelledby={`features-${group.key}`} className="border-t border-border first:border-t-0">
          <div className="bg-slate-50 px-5 py-2">
            <h3 id={`features-${group.key}`} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {group.title} <span className="font-normal normal-case">({group.rows.length})</span>
            </h3>
            <p className="text-xs text-muted">{group.description}</p>
          </div>
      <ul className="divide-y divide-border">
        {group.rows.map((f) => {
          const locked = f.availability !== "available"
          const on = f.enabled && f.availability !== "coming_soon"
          return (
          <li key={f.key} className="flex items-center justify-between gap-4 px-5 py-3">
            <div>
              <p className="text-sm font-medium" id={`feature-${f.key}`}>
                {f.name}
              </p>
              {f.description && <p className="text-xs text-muted">{f.description}</p>}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-labelledby={`feature-${f.key}`}
              disabled={locked}
              title={locked ? NOTE[f.availability] : undefined}
              onClick={() =>
                startTransition(async () => {
                  setError(null)
                  setOptimistic({ key: f.key, enabled: !f.enabled })
                  const result = await setSchoolFeature(schoolId, f.key, !f.enabled)
                  if (!result.ok) setError(result.error)
                })
              }
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${on ? "bg-brand" : "bg-slate-300"}`}
            >
              <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </li>
          )
        })}
      </ul>
        </section>
      ))}
    </div>
  )
}
