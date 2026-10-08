import type { Metadata } from "next"
import { Card } from "@/components/ui/card"
import { EmptyState, PageHeader } from "@/components/ui/misc"
import { FEATURE_LABELS, requireFeature } from "@/lib/features"

export const metadata: Metadata = { title: "Module" }

/**
 * Entry point for optional modules. Returns 404 unless the feature is enabled
 * for the caller's school. Real modules will replace this placeholder.
 */
export default async function ModulePage({ params }: PageProps<"/modules/[feature]">) {
  const { feature } = await params
  await requireFeature(feature)
  return (
    <>
      <PageHeader eyebrow="Module" title={FEATURE_LABELS[feature] ?? feature} />
      <Card>
        <EmptyState
          title="Coming soon"
          description="This module is enabled for your school and will be available in a future release."
        />
      </Card>
    </>
  )
}
