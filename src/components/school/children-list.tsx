import Link from "next/link"
import { Badge, EmptyState, StatusBadge } from "@/components/ui/misc"
import { guardianChildren } from "@/services/people"

/** A guardian's children with their current placement (used by admins and by the parent). */
export async function ChildrenList({ guardianId }: { guardianId: string }) {
  const { data: links, error } = await guardianChildren(guardianId)
  if (error) console.error("[ChildrenList]", error.code, error.message)
  if (!links?.length) return <EmptyState title="No children linked" />
  return (
    <ul className="divide-y divide-border">
      {links.map((l) => {
        const open = l.student.enrollments.find((e) => e.academic_year.is_current) ?? l.student.enrollments[0]
        return (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
            <div>
              <Link href={`/students/${l.student.id}`} className="font-medium text-brand hover:underline">
                {l.student.first_name} {l.student.last_name}
              </Link>
              <span className="ml-2 text-muted capitalize">{l.relationship_type}</span>
              {l.is_primary && <span className="ml-2"><Badge tone="blue">Primary contact</Badge></span>}
              <p className="text-muted">
                {open ? `${open.academic_year.name} · ${open.grade_level.name}${open.section ? ` – ${open.section.name}` : ""}` : "Not currently enrolled"}
              </p>
            </div>
            <StatusBadge status={l.student.status} />
          </li>
        )
      })}
    </ul>
  )
}
