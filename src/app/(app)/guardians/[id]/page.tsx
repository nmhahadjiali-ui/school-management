import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { Pencil, Plus } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { LinkButton } from "@/components/ui/button"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { FormDialog } from "@/components/ui/form-dialog"
import { PageHeader, StatusBadge } from "@/components/ui/misc"
import { DescriptionList, TableSkeleton } from "@/components/data/list"
import { AccountPanel } from "@/components/school/account-panel"
import { ChildrenList } from "@/components/school/children-list"
import { GuardianLinkFields } from "@/components/school/fields"
import { linkGuardian } from "@/lib/actions/people"
import { requireActiveUser } from "@/lib/auth/session"
import { personName } from "@/lib/options"
import { uuidSchema } from "@/lib/validations"
import { getGuardian } from "@/services/people"

export const metadata: Metadata = { title: "Parent / guardian" }

/** Guardian profile: school admins (manage) and the parent themself (view). */
export default async function GuardianPage({ params, searchParams }: PageProps<"/guardians/[id]">) {
  const ctx = await requireActiveUser()
  const { id } = await params
  const { created } = await searchParams
  if (!uuidSchema.safeParse(id).success) notFound()
  const { data: guardian, error } = await getGuardian(id)
  if (error) throw new Error("Unable to load guardian")
  if (!guardian) notFound()
  const isAdmin = ctx.profile.role === "school_admin" && ctx.profile.school_id === guardian.school_id

  return (
    <>
      <PageHeader
        eyebrow="Parent / guardian"
        title={personName(guardian)}
        description={<StatusBadge status={guardian.status} />}
        actions={isAdmin ? <LinkButton href={`/guardians/${guardian.id}/edit`} variant="secondary"><Pencil className="size-4" aria-hidden /> Edit</LinkButton> : null}
      />
      {created && <Alert tone="success" className="mb-6">Record created. Next: link their children.</Alert>}
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader
            title="Children"
            action={
              isAdmin ? (
                <FormDialog trigger={<><Plus className="size-4" aria-hidden /> Link child</>} size="sm" title="Link a child" action={linkGuardian} submitLabel="Link">
                  <GuardianLinkFields guardianId={guardian.id} />
                </FormDialog>
              ) : null
            }
          />
          <Suspense fallback={<TableSkeleton rows={2} />}>
            <ChildrenList guardianId={guardian.id} />
          </Suspense>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Personal information" />
            <CardBody>
              <DescriptionList items={[["Full name", personName(guardian)], ["Occupation", guardian.occupation]]} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Contact information" />
            <CardBody>
              <DescriptionList items={[["Email", guardian.email], ["Phone", guardian.phone], ["Address", guardian.address]]} />
            </CardBody>
          </Card>
          {isAdmin && (
            <Suspense fallback={<Card><TableSkeleton rows={2} /></Card>}>
              <AccountPanel type="guardian" record={guardian} />
            </Suspense>
          )}
        </div>
      </div>
    </>
  )
}
