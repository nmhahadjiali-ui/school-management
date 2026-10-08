import "server-only"
import { createClient } from "@/lib/supabase/server"
import type { Feature } from "@/types/domain"

export type SchoolFeatureRow = {
  key: string
  name: string
  description: string | null
  enabled: boolean
}

export async function listFeatureCatalog() {
  const supabase = await createClient()
  return supabase.from("features").select("*").order("name")
}

/** Catalog merged with one school's flags (RLS: super admin or that school's admin). */
export async function listSchoolFeatures(schoolId: string) {
  const supabase = await createClient()
  const [catalog, flags] = await Promise.all([
    supabase.from("features").select("*").order("name"),
    supabase.from("school_features").select("feature_key, enabled").eq("school_id", schoolId),
  ])
  const enabled = new Map((flags.data ?? []).map((f) => [f.feature_key, f.enabled]))
  const data: SchoolFeatureRow[] = ((catalog.data ?? []) as Feature[]).map((f) => ({
    key: f.key,
    name: f.name,
    description: f.description,
    enabled: enabled.get(f.key) ?? false,
  }))
  return { data, error: catalog.error ?? flags.error }
}

export async function setSchoolFeature(schoolId: string, featureKey: string, enabled: boolean) {
  const supabase = await createClient()
  return supabase
    .from("school_features")
    .upsert({ school_id: schoolId, feature_key: featureKey, enabled }, { onConflict: "school_id,feature_key" })
    .select("id")
    .single()
}

/** Server-side gate, evaluated by the database for the caller's own school. */
export async function hasFeature(featureKey: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("has_feature", { feature: featureKey })
  if (error) console.error("[hasFeature]", error.code, error.message)
  return data === true
}
