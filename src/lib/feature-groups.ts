// Grouping of catalog features by how far they are built, for the platform
// pages (alphabetical within each group).

export type FeatureGroupKey = "available" | "test_mode" | "included" | "coming_soon"

export const FEATURE_GROUPS: { key: FeatureGroupKey; title: string; description: string }[] = [
  { key: "available", title: "Available", description: "Built and working. The switch turns it on or off for this school." },
  { key: "test_mode", title: "Test mode", description: "Built, but messages or payments are only simulated until a provider is connected on the server." },
  { key: "included", title: "Always included", description: "Part of the system for every school; the switch has no effect." },
  { key: "coming_soon", title: "Coming soon", description: "Not built yet; it can be enabled once it is released." },
]

export function featureGroup(f: { key: string; availability: string }, testMode: Iterable<string>): FeatureGroupKey {
  if (f.availability === "coming_soon") return "coming_soon"
  if (f.availability === "included") return "included"
  return [...testMode].includes(f.key) ? "test_mode" : "available"
}

/** Non-empty groups in display order, each sorted by name. */
export function groupFeatures<T extends { key: string; name: string; availability: string }>(rows: T[], testMode: Iterable<string>) {
  const modes = [...testMode]
  return FEATURE_GROUPS.map((g) => ({
    ...g,
    rows: rows.filter((r) => featureGroup(r, modes) === g.key).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.rows.length > 0)
}
