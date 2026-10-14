"use client"

import { useState } from "react"
import { Check, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * A timetable day with an Edit / Done toggle in its top-right corner. Editing
 * controls inside are rendered by the server and shown only while editing,
 * via the `group-data-[editing=true]:` variant on the card.
 */
export function DayCard({ title, editable, children }: { title: string; editable: boolean; children: React.ReactNode }) {
  const [editing, setEditing] = useState(false)
  return (
    <section aria-label={title} data-editing={editing} className={cn("group flex flex-col rounded-lg border border-border", editing && "border-brand ring-1 ring-brand")}>
      <div className="flex items-center justify-between gap-2 border-b border-border bg-slate-50 py-1 pl-2.5 pr-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        {editable && (
          <Button size="sm" variant={editing ? "primary" : "ghost"} aria-pressed={editing} onClick={() => setEditing((e) => !e)}>
            {editing ? <Check className="size-4" aria-hidden /> : <Pencil className="size-4" aria-hidden />}
            {editing ? "Done" : "Edit"}
          </Button>
        )}
      </div>
      {children}
    </section>
  )
}
