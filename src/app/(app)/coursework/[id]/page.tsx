import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Paperclip } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { ConfirmAction } from "@/components/ui/confirm-dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { DescriptionList } from "@/components/data/list"
import { CourseworkFields } from "@/components/academics/fields"
import { CourseworkAttachment, SubmissionForm } from "@/components/academics/coursework-client"
import { reviewSubmission, setCourseworkStatus, updateCoursework } from "@/lib/actions/operations"
import { requireActiveUser } from "@/lib/auth/session"
import { formatDateTime, isPast, isoToZonedInput } from "@/lib/dates"
import { uuidSchema } from "@/lib/validations"
import { getCoursework, mySubmission, submissionsFor } from "@/services/operations"

export const metadata: Metadata = { title: "Assignment" }

const fileLink = (path: string, name: string | null) => (
  <a href={`/api/files?path=${encodeURIComponent(path)}`} className="inline-flex items-center gap-1 text-brand hover:underline">
    <Paperclip className="size-4" aria-hidden /> {name ?? "Download"}
  </a>
)

/** Visible to whoever RLS allows (teacher, admins, the class's students and their parents); 404 otherwise. */
export default async function CourseworkDetailPage({ params, searchParams }: PageProps<"/coursework/[id]">) {
  const ctx = await requireActiveUser()
  const { id } = await params
  const { created } = await searchParams
  if (!uuidSchema.safeParse(id).success || !ctx.features.includes("coursework")) notFound()
  const { data: a } = await getCoursework(id)
  if (!a) notFound()

  const tz = ctx.school?.timezone
  const isOwner = ctx.record?.type === "teacher" && ctx.record.id === a.teacher_id
  const canManage = isOwner || (ctx.profile.role === "school_admin" && ctx.profile.school_id === a.school_id)
  const studentId = ctx.record?.type === "student" ? ctx.record.id : null
  const [subs, mine] = await Promise.all([
    canManage || ctx.profile.role === "parent" ? submissionsFor(a.id) : Promise.resolve({ data: null }),
    studentId ? mySubmission(a.id, studentId) : Promise.resolve({ data: null }),
  ])
  const overdue = isPast(a.due_at)

  return (
    <>
      <PageHeader
        eyebrow={`${a.subject.name} · ${a.section.grade_level.name} – ${a.section.name}`}
        title={a.title}
        description={<StatusBadge status={a.status} />}
        actions={
          canManage ? (
            <>
              <FormDialog trigger="Edit" variant="secondary" title="Edit assignment" action={updateCoursework.bind(null, a.id)}>
                <CourseworkFields value={a} dueLocal={isoToZonedInput(a.due_at, tz)} />
              </FormDialog>
              {a.status === "archived" ? (
                <ConfirmAction size="md" trigger="Restore" title="Publish this assignment again?" description="Students will see it again." confirmLabel="Publish" onConfirm={setCourseworkStatus.bind(null, a.id, "published")} />
              ) : (
                <ConfirmAction destructive size="md" trigger="Archive" title="Archive this assignment?" description="Students no longer see it. Submissions are kept." confirmLabel="Archive" onConfirm={setCourseworkStatus.bind(null, a.id, "archived")} />
              )}
            </>
          ) : null
        }
      />
      {created && <Alert tone="success" className="mb-6">Assignment created{a.status === "published" ? " and the class was notified" : ""}. You can attach a file below.</Alert>}
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Instructions" />
            <CardBody className="space-y-4">
              {a.description ? <p className="whitespace-pre-wrap text-sm">{a.description}</p> : <p className="text-sm text-muted">No instructions.</p>}
              {a.attachment_path && <p className="text-sm">{fileLink(a.attachment_path, a.attachment_name)}</p>}
              {canManage && (
                <CourseworkAttachment id={a.id} folder={`${a.school_id}/assignments/${a.id}`} current={a.attachment_path ? { path: a.attachment_path, name: a.attachment_name ?? "file" } : null} />
              )}
            </CardBody>
          </Card>

          {studentId && (
            <Card>
              <CardHeader title="Your submission" description={mine.data ? <>Submitted {formatDateTime(mine.data.submitted_at, tz)} · <StatusBadge status={mine.data.status} /></> : overdue ? "Past due — late submissions are marked as late." : undefined} />
              <CardBody className="space-y-3">
                {mine.data?.file_path && <p className="text-sm">{fileLink(mine.data.file_path, mine.data.file_name)}</p>}
                <SubmissionForm assignmentId={a.id} folder={`${a.school_id}/submissions/${a.id}/${studentId}`} existing={mine.data} locked={mine.data?.status === "reviewed"} />
              </CardBody>
            </Card>
          )}

          {subs.data && (
            <Card>
              <CardHeader title={ctx.profile.role === "parent" ? "Your child's submission" : "Submissions"} description={canManage ? `${subs.data.length} received` : undefined} />
              {subs.data.length === 0 ? (
                <EmptyState title="No submissions yet" />
              ) : (
                <Table label="Submissions">
                  <thead>
                    <tr>
                      <Th>Student</Th>
                      <Th>Submitted</Th>
                      <Th>Work</Th>
                      <Th>Status</Th>
                      {canManage && <Th className="text-right"><span className="sr-only">Actions</span></Th>}
                    </tr>
                  </thead>
                  <tbody>
                    {subs.data.map((s) => (
                      <tr key={s.id}>
                        <Td><Link href={`/students/${s.student.id}`} className="font-medium text-brand hover:underline">{s.student.last_name}, {s.student.first_name}</Link></Td>
                        <Td className="whitespace-nowrap text-muted">{formatDateTime(s.submitted_at, tz)}</Td>
                        <Td className="max-w-md">
                          {s.content && <p className="line-clamp-3 whitespace-pre-wrap">{s.content}</p>}
                          {s.file_path && fileLink(s.file_path, s.file_name)}
                        </Td>
                        <Td><StatusBadge status={s.status} /></Td>
                        {canManage && (
                          <Td className="text-right">
                            {s.status !== "reviewed" && <ConfirmAction trigger="Mark reviewed" title="Mark this submission as reviewed?" description="The student can no longer change it." confirmLabel="Mark reviewed" onConfirm={reviewSubmission.bind(null, s.id)} />}
                          </Td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          )}
        </div>
        <Card className="self-start">
          <CardHeader title="Details" />
          <CardBody>
            <DescriptionList
              items={[
                ["Class", `${a.section.grade_level.name} – ${a.section.name}`],
                ["Subject", a.subject.name],
                ["Teacher", `${a.teacher.first_name} ${a.teacher.last_name}`],
                ["Due", a.due_at ? <span key="d" className={overdue ? "text-red-700" : ""}>{formatDateTime(a.due_at, tz)}</span> : "No due date"],
                ["Posted", formatDateTime(a.created_at, tz)],
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </>
  )
}
