import Link from "next/link"
import { EmptyState, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { LinkButton } from "@/components/ui/button"
import { formatDate } from "@/lib/utils"
import type { SchoolWithUserCount } from "@/services/schools"

export function SchoolsTable({ schools }: { schools: SchoolWithUserCount[] }) {
  if (schools.length === 0) {
    return (
      <EmptyState
        title="No schools yet"
        description="Create the first school to start onboarding administrators and users."
        action={<LinkButton href="/platform/schools/new">Create a school</LinkButton>}
      />
    )
  }
  return (
    <Table label="Schools">
      <thead>
        <tr>
          <Th>School</Th>
          <Th>Code</Th>
          <Th>Status</Th>
          <Th className="text-right">Users</Th>
          <Th>Created</Th>
        </tr>
      </thead>
      <tbody>
        {schools.map((s) => (
          <tr key={s.id} className="hover:bg-slate-50">
            <Td>
              <Link href={`/platform/schools/${s.id}`} className="font-medium text-brand hover:underline">
                {s.name}
              </Link>
            </Td>
            <Td className="font-mono text-xs">{s.code}</Td>
            <Td>
              <StatusBadge status={s.status} />
            </Td>
            <Td className="text-right tabular-nums">{s.user_count}</Td>
            <Td className="text-muted">{formatDate(s.created_at)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}
