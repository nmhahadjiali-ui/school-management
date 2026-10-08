import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Alert } from "@/components/ui/alert"
import { Card, CardHeader } from "@/components/ui/card"
import { Badge, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { requireAcademicActor } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { listGradingPeriods, teachingLoads } from "@/services/operations"

export const metadata: Metadata = { title: "Grades" }

/** Teacher grade hub: each of my classes × grading period, with progress. Admins review instead. */
export default async function GradesPage() {
  const actor = await requireAcademicActor("grades")
  if (actor.isAdmin) redirect("/grades/review")
  const year = actor.current_academic_year
  if (!year) return <Alert tone="info">Your school has not set a current academic year.</Alert>

  const [loads, { data: periods }] = await Promise.all([teachingLoads(actor.schoolId, year.id, actor.teacherId!), listGradingPeriods(actor.schoolId, year.id)])
  const supabase = await createClient()
  const { data: grades } = await supabase.from("grade_records").select("section_id, subject_id, grading_period_id, status").eq("teacher_id", actor.teacherId!).eq("academic_year_id", year.id)
  const tally = (sectionId: string, subjectId: string, periodId: string) => {
    const g = (grades ?? []).filter((x) => x.section_id === sectionId && x.subject_id === subjectId && x.grading_period_id === periodId)
    return { total: g.length, draft: g.filter((x) => x.status === "draft").length, pending: g.filter((x) => x.status === "submitted").length, done: g.filter((x) => x.status === "approved" || x.status === "locked").length }
  }

  return (
    <>
      <PageHeader title="Grades" description={`Enter and submit grades for your classes (${year.name}).`} />
      {!periods?.length && <Alert tone="info" className="mb-4">Your school has not set up grading periods for {year.name} yet.</Alert>}
      {loads.data.length === 0 ? (
        <Card><EmptyState title="No classes assigned" description="You are not assigned to teach any subject this year." /></Card>
      ) : (
        <div className="space-y-6">
          {(periods ?? []).map((p) => (
            <Card key={p.id}>
              <CardHeader title={p.name} description={<StatusBadge status={p.status} />} />
              <Table label={`${p.name} classes`}>
                <thead>
                  <tr>
                    <Th>Class</Th>
                    <Th>Progress</Th>
                    <Th className="text-right"><span className="sr-only">Open</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {loads.data.map((l) => {
                    const t = tally(l.section_id, l.subject_id, p.id)
                    return (
                      <tr key={l.id}>
                        <Td className="font-medium">{l.subject.name} <span className="font-normal text-muted">· {l.section.grade_level.name} – {l.section.name}</span></Td>
                        <Td className="space-x-1">
                          {t.total === 0 ? <span className="text-sm text-muted">Not started</span> : null}
                          {t.draft > 0 && <Badge tone="amber">{t.draft} draft</Badge>}
                          {t.pending > 0 && <Badge tone="blue">{t.pending} submitted</Badge>}
                          {t.done > 0 && <Badge tone="green">{t.done} approved</Badge>}
                        </Td>
                        <Td className="text-right">
                          <Link href={`/grades/entry?load=${l.id}&period=${p.id}`} className="text-sm font-medium text-brand hover:underline">
                            {p.status === "open" ? "Enter grades" : "View"}
                          </Link>
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
