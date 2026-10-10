"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { denied, formToObject, invalid, type ActionResult } from "@/lib/action-result"
import { dbFail, schoolAdmin } from "@/lib/actions/helpers"
import { GRADE_PRESETS, itemsToPeriods, periodsToItems, presetBands, presetPeriods, type BandItem, type GradeItem, type PeriodItem } from "@/lib/grading-templates"
import { createClient } from "@/lib/supabase/server"
import { uuidSchema } from "@/lib/validations"

// One-click setup of grading periods, grading scales and grade levels from a
// built-in preset ("builtin:...") or one of the school's saved templates (uuid).

type Kind = "grading_periods" | "grading_scales" | "grade_levels"

const periodItems = z.array(
  z.object({
    name: z.string().trim().min(1).max(60),
    code: z.string().trim().regex(/^[A-Za-z0-9_-]{1,20}$/),
    sequence: z.number().int().min(1).max(20),
    start_offset: z.number().int().min(0).max(800),
    end_offset: z.number().int().min(0).max(800),
  })
).min(1).max(20)

const bandItems = z.array(
  z.object({
    name: z.string().trim().min(1).max(60),
    minimum_score: z.number().min(0).max(1000),
    maximum_score: z.number().min(0).max(1000),
    equivalent: z.string().trim().max(20).nullable(),
    description: z.string().trim().max(500).nullable(),
    is_passing: z.boolean(),
  })
).min(1).max(20)

const gradeItems = z.array(
  z.object({
    name: z.string().trim().min(1).max(60),
    code: z.string().trim().regex(/^[A-Za-z0-9_-]{1,20}$/),
    sort_order: z.number().int().min(-1000).max(1000),
  })
).min(1).max(20)

const templateName = z.object({ name: z.string().trim().min(1, "Name is required").max(80, "Name is too long") })

/** Database errors as one message (the template dialog has no fields to highlight). */
function failPlain(error: Parameters<typeof dbFail>[0], context: string): ActionResult {
  const r = dbFail(error, context)
  if (r.ok || !r.fieldErrors) return r
  return { ok: false, error: Object.values(r.fieldErrors).flat()[0] ?? r.error }
}

async function savedItems(kind: Kind, id: string, schoolId: string) {
  if (!uuidSchema.safeParse(id).success) return null
  const supabase = await createClient()
  const { data } = await supabase.from("setup_templates").select("items").eq("id", id).eq("school_id", schoolId).eq("kind", kind).maybeSingle()
  return data?.items ?? null
}

/** Add a template's periods to an academic year that has none yet. */
export async function applyGradingPeriodTemplate(yearId: string, key: string): Promise<ActionResult> {
  const ctx = await schoolAdmin()
  if (!ctx || !uuidSchema.safeParse(yearId).success) return denied()
  const supabase = await createClient()
  const { data: year } = await supabase.from("academic_years").select("id, name, start_date, end_date, status").eq("id", yearId).eq("school_id", ctx.schoolId).maybeSingle()
  if (!year) return { ok: false, error: "The academic year was not found." }
  if (year.status === "archived") return { ok: false, error: "This academic year is archived." }
  const { count } = await supabase.from("grading_periods").select("id", { count: "exact", head: true }).eq("academic_year_id", yearId)
  if (count) return { ok: false, error: `${year.name} already has grading periods. A template can only be applied to a year without periods; delete them first or add periods one by one.` }

  let rows = key.startsWith("builtin:") ? presetPeriods(key, year.start_date, year.end_date) : null
  if (!key.startsWith("builtin:")) {
    const items = periodItems.safeParse(await savedItems("grading_periods", key, ctx.schoolId))
    if (!items.success) return { ok: false, error: "The template was not found." }
    const result = itemsToPeriods(items.data as PeriodItem[], year.start_date, year.end_date)
    if ("error" in result) return { ok: false, error: result.error }
    rows = result.rows
  }
  if (!rows) return { ok: false, error: "The template was not found." }

  // One insert: all periods are added, or none.
  const { error } = await supabase.from("grading_periods").insert(rows.map((r) => ({ ...r, school_id: ctx.schoolId, academic_year_id: yearId })))
  if (error) return failPlain(error, "applyGradingPeriodTemplate")
  revalidatePath("/grading-periods", "layout")
  return { ok: true, message: `Added ${rows.length} grading periods to ${year.name}.` }
}

/** Replace the school's grading scale with a template's bands (all or nothing). */
export async function applyGradingScaleTemplate(key: string): Promise<ActionResult> {
  const ctx = await schoolAdmin()
  if (!ctx) return denied()
  const supabase = await createClient()
  let bands: BandItem[] | null = null
  if (key.startsWith("builtin:")) {
    const { data: settings } = await supabase.from("school_settings").select("grade_max_score").eq("school_id", ctx.schoolId).maybeSingle()
    bands = presetBands(key, Number(settings?.grade_max_score ?? 100))
  } else {
    const items = bandItems.safeParse(await savedItems("grading_scales", key, ctx.schoolId))
    if (items.success) bands = items.data as BandItem[]
  }
  if (!bands) return { ok: false, error: "The template was not found." }

  const { error } = await supabase.rpc("replace_grading_scale", { p_bands: bands })
  if (error) return failPlain(error, "applyGradingScaleTemplate")
  revalidatePath("/grading-scales", "layout")
  return { ok: true, message: `Grading scale replaced with ${bands.length} bands.` }
}

/** Add a template's grade levels; ones the school already has (same name or code) are kept as they are. */
export async function applyGradeLevelTemplate(key: string): Promise<ActionResult> {
  const ctx = await schoolAdmin()
  if (!ctx) return denied()
  let items: GradeItem[] | null = GRADE_PRESETS.find((p) => p.key === key)?.items ?? null
  if (!items && !key.startsWith("builtin:")) {
    const saved = gradeItems.safeParse(await savedItems("grade_levels", key, ctx.schoolId))
    if (saved.success) items = saved.data
  }
  if (!items) return { ok: false, error: "The template was not found." }

  const supabase = await createClient()
  const { data: existing } = await supabase.from("grade_levels").select("name, code").eq("school_id", ctx.schoolId)
  const names = new Set((existing ?? []).map((g) => g.name.toLowerCase()))
  const codes = new Set((existing ?? []).map((g) => g.code.toLowerCase()))
  const missing = items.filter((g) => !names.has(g.name.toLowerCase()) && !codes.has(g.code.toLowerCase()))
  if (missing.length === 0) return { ok: true, message: "Your school already has all of these grade levels." }

  // One insert: all missing grade levels are added, or none.
  const { error } = await supabase.from("grade_levels").insert(missing.map((g) => ({ ...g, school_id: ctx.schoolId })))
  if (error) return failPlain(error, "applyGradeLevelTemplate")
  revalidatePath("/grade-levels", "layout")
  const kept = items.length - missing.length
  const keptNote = kept ? `; ${kept} you already had ${kept === 1 ? "was" : "were"} kept` : ""
  return { ok: true, message: `Added ${missing.length} grade level${missing.length === 1 ? "" : "s"}${keptNote}.` }
}

/** Save the current periods of a year, the grading scale or the grade levels as a named template. */
export async function saveGradingTemplate(kind: Kind, yearId: string | null, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ctx = await schoolAdmin()
  if (!ctx) return denied()
  const parsed = templateName.safeParse(formToObject(fd))
  if (!parsed.success) return invalid(parsed.error)
  const supabase = await createClient()

  let items: PeriodItem[] | BandItem[] | GradeItem[]
  if (kind === "grading_periods") {
    if (!yearId || !uuidSchema.safeParse(yearId).success) return denied()
    const { data: year } = await supabase.from("academic_years").select("start_date").eq("id", yearId).eq("school_id", ctx.schoolId).maybeSingle()
    const { data: periods } = await supabase.from("grading_periods").select("name, code, sequence, start_date, end_date").eq("academic_year_id", yearId).eq("school_id", ctx.schoolId).order("sequence")
    if (!year || !periods?.length) return { ok: false, error: "There are no grading periods to save." }
    items = periodsToItems(periods, year.start_date)
  } else if (kind === "grading_scales") {
    const { data: scales } = await supabase.from("grading_scales").select("name, minimum_score, maximum_score, equivalent, description, is_passing").eq("school_id", ctx.schoolId).order("minimum_score", { ascending: false })
    if (!scales?.length) return { ok: false, error: "There are no grading bands to save." }
    items = scales.map((s) => ({ ...s, minimum_score: Number(s.minimum_score), maximum_score: Number(s.maximum_score) }))
  } else if (kind === "grade_levels") {
    const { data: grades } = await supabase.from("grade_levels").select("name, code, sort_order").eq("school_id", ctx.schoolId).eq("status", "active").order("sort_order")
    if (!grades?.length) return { ok: false, error: "There are no active grade levels to save." }
    if (grades.length > 20) return { ok: false, error: "A template can hold at most 20 grade levels." }
    items = grades
  } else {
    return denied()
  }

  const { error } = await supabase.from("setup_templates").insert({ school_id: ctx.schoolId, kind, name: parsed.data.name, items })
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: { name: ["A template with this name already exists"] } }
    return dbFail(error, "saveGradingTemplate")
  }
  revalidatePath({ grading_periods: "/grading-periods", grading_scales: "/grading-scales", grade_levels: "/grade-levels" }[kind], "layout")
  return { ok: true, message: `Template “${parsed.data.name}” saved.` }
}

export async function deleteGradingTemplate(id: string): Promise<ActionResult> {
  const ctx = await schoolAdmin()
  if (!ctx || !uuidSchema.safeParse(id).success) return denied()
  const supabase = await createClient()
  const { data, error } = await supabase.from("setup_templates").delete().eq("id", id).eq("school_id", ctx.schoolId).select("kind")
  if (error) return dbFail(error, "deleteGradingTemplate")
  if (!data?.length) return { ok: false, error: "The template was not found." }
  revalidatePath("/grading-periods", "layout")
  revalidatePath("/grading-scales", "layout")
  revalidatePath("/grade-levels", "layout")
  return { ok: true, message: "Template deleted." }
}
