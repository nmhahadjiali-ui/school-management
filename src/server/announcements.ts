import "server-only"
import { createClient } from "@/lib/supabase/server"
import { listGradeLevels, listSectionOptions, myTeachingSections } from "@/services/academic"
import { loadLabel, teachingLoads } from "@/services/operations"
import type { AnnouncementRow } from "@/services/communication"
import type { UserContext } from "@/types/domain"

type Option = { value: string; label: string }
type TargetType = "school" | "grade_level" | "section" | "class" | "user"

/**
 * Audience choices for the editor. Admins: whole school, grades, sections,
 * classes, people. Teachers: only their own sections and classes (the
 * database enforces the same rule on save).
 */
export async function audienceOptions(ctx: UserContext) {
  const schoolId = ctx.profile.school_id!
  const year = ctx.current_academic_year
  const isAdmin = ctx.profile.role === "school_admin"
  const teacherId = ctx.record?.type === "teacher" ? ctx.record.id : null
  if (!year) return { allowed: (isAdmin ? ["school", "user"] : []) as TargetType[], grades: [] as Option[], sections: [] as Option[], classes: [] as Option[] }

  if (isAdmin) {
    const [grades, sections, loads] = await Promise.all([listGradeLevels(schoolId, { status: "active" }), listSectionOptions(schoolId, year.id), teachingLoads(schoolId, year.id)])
    return {
      allowed: ["school", "grade_level", "section", "class", "user"] as TargetType[],
      grades: (grades.data ?? []).map((g) => ({ value: g.id, label: g.name })),
      sections: ((sections.data ?? []) as { id: string; name: string; grade_level: { name: string } | null }[]).map((s) => ({ value: s.id, label: `${s.grade_level?.name ?? ""} – ${s.name}` })),
      classes: loads.data.map((l) => ({ value: l.id, label: `${loadLabel(l)} (${l.teacher.last_name})` })),
    }
  }
  const [sections, loads] = await Promise.all([myTeachingSections(teacherId!, year.id), teachingLoads(schoolId, year.id, teacherId!)])
  return {
    allowed: ["section", "class"] as TargetType[],
    grades: [] as Option[],
    sections: sections.data.map((s) => ({ value: s.id, label: `${s.grade_level.name} – ${s.name}` })),
    classes: loads.data.map((l) => ({ value: l.id, label: loadLabel(l) })),
  }
}

const ROLE_WORDS: Record<string, string> = { student: "students", parent: "parents", teacher: "teachers", school_admin: "admins" }

/** Human-readable audience, e.g. "Grade 6 – A (students, parents)". */
export async function describeTargets(rows: AnnouncementRow[]) {
  const ids = (t: string) => [...new Set(rows.flatMap((r) => r.targets.filter((x) => x.target_type === t).map((x) => x.target_id)))]
  const supabase = await createClient()
  const [grades, sections, loads, users] = await Promise.all([
    ids("grade_level").length ? supabase.from("grade_levels").select("id, name").in("id", ids("grade_level")) : { data: [] },
    ids("section").length ? supabase.from("sections").select("id, name, grade_level:grade_levels!sections_grade_level_fkey(name)").in("id", ids("section")) : { data: [] },
    ids("class").length
      ? supabase.from("teacher_subject_assignments").select("id, section:sections!tsa_section_fkey(name, grade_level:grade_levels!sections_grade_level_fkey(name)), subject:subjects!tsa_subject_fkey(name)").in("id", ids("class"))
      : { data: [] },
    ids("user").length ? supabase.from("profiles").select("user_id, first_name, last_name, email").in("user_id", ids("user")) : { data: [] },
  ])
  const names = new Map<string, string>()
  for (const g of (grades.data ?? []) as { id: string; name: string }[]) names.set(g.id, g.name)
  for (const s of (sections.data ?? []) as { id: string; name: string; grade_level: { name: string } }[]) names.set(s.id, `${s.grade_level.name} – ${s.name}`)
  for (const l of (loads.data ?? []) as { id: string; section: { name: string; grade_level: { name: string } }; subject: { name: string } }[]) names.set(l.id, `${l.subject.name}, ${l.section.grade_level.name} – ${l.section.name}`)
  for (const u of (users.data ?? []) as { user_id: string; first_name: string; last_name: string; email: string }[]) names.set(u.user_id, `${u.first_name} ${u.last_name}`.trim() || u.email)

  return new Map(
    rows.map((r) => [
      r.id,
      r.targets.map((t) => {
        const who = t.target_type === "school" ? "Entire school" : names.get(t.target_id) ?? "Hidden audience"
        return t.roles ? `${who} (${t.roles.map((x) => ROLE_WORDS[x] ?? x).join(", ")})` : who
      }),
    ])
  )
}

/** Whether the viewer may author announcements (admins; teachers if the school allows). */
export async function canAuthor(ctx: UserContext) {
  if (!ctx.features.includes("announcements")) return false
  if (ctx.profile.role === "school_admin") return true
  if (ctx.profile.role !== "teacher" || ctx.record?.type !== "teacher") return false
  const supabase = await createClient()
  const { data } = await supabase.from("school_settings").select("teachers_can_announce").eq("school_id", ctx.profile.school_id!).single()
  return Boolean(data?.teachers_can_announce)
}
