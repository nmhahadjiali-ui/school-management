import Link from "next/link"
import { Badge, EmptyState } from "@/components/ui/misc"
import { myTeachingSections } from "@/services/academic"

/** The signed-in teacher's sections for a year (advised and/or taught). */
export async function MyClasses({ teacherId, yearId }: { teacherId: string; yearId: string }) {
  const { data, error } = await myTeachingSections(teacherId, yearId)
  if (error) console.error("[MyClasses]", error)
  if (!data.length) return <EmptyState title="No classes yet" description="Your school has not assigned you to a section this year." />
  return (
    <ul className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((s) => (
        <li key={s.id}>
          <Link href={`/sections/${s.id}`} className="block h-full rounded-lg border border-border p-4 hover:border-brand hover:bg-slate-50">
            <p className="font-semibold">{s.grade_level.name} – {s.name}</p>
            <p className="mt-1 text-sm text-muted">{s.enrolled} student{s.enrolled === 1 ? "" : "s"}{s.room ? ` · Room ${s.room}` : ""}</p>
            <p className="mt-3 flex flex-wrap gap-1">
              {s.isAdviser && <Badge tone="blue">Adviser</Badge>}
              {s.subjects.map((subject) => <Badge key={subject}>{subject}</Badge>)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  )
}
