import { requireFinance } from "@/lib/finance/access"

/** Gate for the finance area: finance roles, or school admins with finance access. */
export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  await requireFinance("view")
  return children
}
