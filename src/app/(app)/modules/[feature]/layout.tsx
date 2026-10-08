import { requireFeature } from "@/lib/features"

/** 404s unless the feature is enabled for the caller's school (checked in the database). */
export default async function ModuleLayout({ children, params }: LayoutProps<"/modules/[feature]">) {
  const { feature } = await params
  await requireFeature(feature)
  return children
}
