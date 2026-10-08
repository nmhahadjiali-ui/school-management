import { LinkButton } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg space-y-3 py-16 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-sm text-muted">
        This page does not exist, or you do not have access to it.
      </p>
      <LinkButton href="/dashboard" variant="secondary">
        Back to dashboard
      </LinkButton>
    </div>
  )
}
