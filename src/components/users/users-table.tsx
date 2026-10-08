"use client"

import { useState, useTransition } from "react"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ConfirmAction } from "@/components/ui/confirm-dialog"
import { EmptyState, RoleBadge, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { updateMember } from "@/lib/actions/users"
import { ROLE_LABELS, SCHOOL_MEMBER_ROLES, isSchoolMemberRole } from "@/lib/auth/permissions"
import { formatDate, fullName } from "@/lib/utils"
import type { AppRole, ProfileStatus } from "@/types/domain"

export type UserRow = {
  id: string
  email: string
  first_name: string
  last_name: string
  role: AppRole
  status: ProfileStatus
  created_at: string
  school?: { name: string; code: string } | null
}

type Props = {
  users: UserRow[]
  currentProfileId: string
  /** "school": school admin (member roles only). "platform": super admin (status of any school user). */
  mode: "school" | "platform"
}

function submit(profileId: string, values: { role?: AppRole; status: ProfileStatus }) {
  const fd = new FormData()
  if (values.role) fd.set("role", values.role)
  fd.set("status", values.status)
  return updateMember(profileId, null, fd)
}

function RowActions({ user, mode, onError }: { user: UserRow; mode: Props["mode"]; onError: (e: string | null) => void }) {
  const [pending, startTransition] = useTransition()
  const member = isSchoolMemberRole(user.role)
  const run = (values: { role?: AppRole; status: ProfileStatus }) =>
    startTransition(async () => {
      onError(null)
      const r = await submit(user.id, values)
      if (!r.ok) onError(r.error)
    })

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {member && mode === "school" && (
        <select
          aria-label={`Role for ${fullName(user)}`}
          className="h-8 rounded-md border border-border bg-surface px-2 text-sm"
          value={user.role}
          disabled={pending}
          onChange={(e) => run({ role: e.target.value as AppRole, status: user.status })}
        >
          {SCHOOL_MEMBER_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      )}
      {user.status === "pending" && (
        <Button size="sm" disabled={pending} onClick={() => run({ status: "active" })}>
          Approve
        </Button>
      )}
      {user.status === "active" ? (
        <ConfirmAction
          destructive
          trigger="Deactivate"
          title={`Deactivate ${fullName(user)}?`}
          description="They will lose access immediately. You can reactivate the account later."
          confirmLabel="Deactivate"
          onConfirm={() => submit(user.id, { status: "inactive" })}
        />
      ) : user.status === "inactive" ? (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run({ status: "active" })}>
          Reactivate
        </Button>
      ) : null}
    </div>
  )
}

export function UsersTable({ users, currentProfileId, mode }: Props) {
  const [error, setError] = useState<string | null>(null)
  if (users.length === 0) {
    return <EmptyState title="No users found" description="Users will appear here once they register or are added." />
  }

  const canManage = (u: UserRow) =>
    u.id !== currentProfileId &&
    u.role !== "super_admin" &&
    (mode === "platform" || isSchoolMemberRole(u.role))

  return (
    <>
      {error && (
        <Alert tone="error" className="m-4">
          {error}
        </Alert>
      )}
      <Table label="Users">
        <thead>
          <tr>
            <Th>Name</Th>
            {mode === "platform" && <Th>School</Th>}
            <Th>Role</Th>
            <Th>Status</Th>
            <Th>Joined</Th>
            <Th className="text-right">
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <Td>
                <p className="font-medium">{fullName(u)}</p>
                <p className="text-xs text-muted">{u.email}</p>
              </Td>
              {mode === "platform" && <Td>{u.school?.name ?? <span className="text-muted">Platform</span>}</Td>}
              <Td>
                <RoleBadge role={u.role} />
              </Td>
              <Td>
                <StatusBadge status={u.status} />
              </Td>
              <Td className="text-muted">{formatDate(u.created_at)}</Td>
              <Td>{canManage(u) ? <RowActions user={u} mode={mode} onError={setError} /> : null}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  )
}
