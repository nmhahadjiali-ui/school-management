import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { ConfirmAction } from "@/components/ui/confirm-dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Field } from "@/components/ui/form"
import { StatusBadge } from "@/components/ui/misc"
import { DescriptionList } from "@/components/data/list"
import { inviteAccount, linkAccount, revokeInvitation, unlinkAccount } from "@/lib/actions/people"
import { formatDate } from "@/lib/utils"
import { invitationState, listRecordInvitations } from "@/services/invitations"
import { linkableAccounts, linkedAccount, type RecordType } from "@/services/people"

const ROLE_WORD: Record<RecordType, string> = { teacher: "teacher", student: "student", guardian: "parent" }

/**
 * Login account for a teacher/student/guardian record (school admins only).
 * Linked -> show it (and allow unlinking). Not linked -> invite by email, or
 * link an account that registered with the school code.
 */
export async function AccountPanel({
  type,
  record,
}: {
  type: RecordType
  record: { id: string; school_id: string; user_id: string | null; email: string | null }
}) {
  const [account, invitations, candidates] = await Promise.all([
    linkedAccount(record.user_id),
    listRecordInvitations(type, record.id),
    record.user_id ? Promise.resolve({ data: [] as { user_id: string; email: string; first_name: string; last_name: string; status: string }[] }) : linkableAccounts(record.school_id, type),
  ])
  const latest = invitations.data?.[0]
  const latestState = latest ? invitationState(latest) : null
  const openInvite = latestState === "pending" ? latest : null

  return (
    <Card>
      <CardHeader title="Account" description="App access for this person." />
      <CardBody className="space-y-4">
        {account.data ? (
          <>
            <DescriptionList
              items={[
                ["Login email", account.data.email],
                ["Account status", <StatusBadge key="s" status={account.data.status} />],
                ...(latest?.accepted_at ? ([["Invitation accepted", formatDate(latest.accepted_at)]] as [string, React.ReactNode][]) : []),
              ]}
            />
            {openInvite && <p className="text-sm text-muted">Invitation sent {formatDate(openInvite.created_at)} — waiting for the person to set a password.</p>}
            <div className="flex flex-wrap gap-2">
              {openInvite && (
                <ConfirmAction destructive trigger="Revoke invitation" title="Revoke this invitation?" description="The link in the email stops working and the unused account is removed. You can invite again later." confirmLabel="Revoke" onConfirm={revokeInvitation.bind(null, openInvite.id)} />
              )}
              {!openInvite && (
                <ConfirmAction destructive trigger="Unlink account" title="Unlink this login account?" description="The person keeps their login but loses access to this record's information. The account is not deleted." confirmLabel="Unlink" onConfirm={unlinkAccount.bind(null, type, record.id)} />
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">
              No login account.
              {latestState && latestState !== "accepted" && <> Last invitation: <StatusBadge status={latestState} /></>}
            </p>
            <div className="flex flex-wrap gap-2">
              {record.email ? (
                <ConfirmAction
                  trigger="Send invitation"
                  title="Send an invitation?"
                  description={`An email with a one-time link (valid for 24 hours) will be sent to ${record.email}. The ${ROLE_WORD[type]} sets their own password; it is never shared with you.`}
                  confirmLabel="Send invitation"
                  onConfirm={inviteAccount.bind(null, type, record.id)}
                />
              ) : (
                <p className="text-sm text-muted">Add an email address to send an invitation.</p>
              )}
              {(candidates.data ?? []).length > 0 && (
                <FormDialog trigger="Link existing account" variant="secondary" size="sm" title="Link an existing account" description={`Accounts with the ${ROLE_WORD[type]} role in your school that are not linked yet.`} action={linkAccount.bind(null, type, record.id)} submitLabel="Link account">
                  <Field
                    as="select"
                    name="user_id"
                    label="Account"
                    required
                    options={[
                      { value: "", label: "Choose…" },
                      ...(candidates.data ?? []).map((c) => ({ value: c.user_id, label: `${c.last_name}, ${c.first_name} — ${c.email}${c.status === "pending" ? " (pending approval)" : ""}` })),
                    ]}
                  />
                </FormDialog>
              )}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  )
}
