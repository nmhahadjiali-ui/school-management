import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { dbFail, schoolAdmin } from "@/lib/actions/helpers"
import { previewEnrollmentImport, type EnrollmentContext } from "@/lib/import/enrollments"
import { IMPORT_MAX_BYTES, ImportFileError } from "@/lib/import/records"
import { createClient } from "@/lib/supabase/server"
import { uuidSchema } from "@/lib/validations"

/** Today in the school's time zone (YYYY-MM-DD). */
function schoolToday(timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

/**
 * POST /api/import/enrollments (multipart: file, year, mode=preview|import).
 * School admins, own school only. Enrolls existing students in one academic
 * year; "import" re-checks every row and inserts the valid ones in one
 * statement (all or none). The database re-checks year, section and capacity.
 */
export async function POST(request: Request) {
  const ctx = await schoolAdmin()
  if (!ctx) return NextResponse.json({ error: "You do not have permission to do that." }, { status: 403 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 })
  }
  const file = form.get("file")
  const yearId = String(form.get("year") ?? "")
  const mode = form.get("mode") === "import" ? "import" : "preview"
  if (!uuidSchema.safeParse(yearId).success) return NextResponse.json({ error: "Choose an academic year." }, { status: 400 })
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 })
  if (file.size > IMPORT_MAX_BYTES) return NextResponse.json({ error: "The file is larger than 2 MB." }, { status: 400 })
  if (!/\.(xlsx|csv)$/i.test(file.name)) {
    return NextResponse.json(
      { error: /\.xls$/i.test(file.name) ? "Old .xls files are not supported. In Excel, use File > Save As > Excel Workbook (.xlsx)." : "Use an Excel (.xlsx) or CSV file." },
      { status: 400 }
    )
  }

  const supabase = await createClient()
  const { data: year } = await supabase.from("academic_years").select("id, name, start_date, end_date, status").eq("id", yearId).eq("school_id", ctx.schoolId).maybeSingle()
  if (!year) return NextResponse.json({ error: "The academic year was not found." }, { status: 400 })
  if (year.status === "archived") return NextResponse.json({ error: `${year.name} is archived; enrollments can no longer be added.` }, { status: 400 })

  const [students, enrolled, grades, sections] = await Promise.all([
    supabase.from("students").select("id, student_number, first_name, last_name, status").eq("school_id", ctx.schoolId).limit(50000),
    supabase.from("student_enrollments").select("student_id, section_id").eq("school_id", ctx.schoolId).eq("academic_year_id", yearId).eq("enrollment_status", "enrolled").limit(50000),
    supabase.from("grade_levels").select("id, name, code, status").eq("school_id", ctx.schoolId),
    supabase.from("sections").select("id, name, code, grade_level_id, status, capacity").eq("school_id", ctx.schoolId).eq("academic_year_id", yearId),
  ])
  const failed = students.error ?? enrolled.error ?? grades.error ?? sections.error
  if (failed) return NextResponse.json(dbFail(failed, "import/enrollments"), { status: 500 })

  const perSection = new Map<string, number>()
  for (const e of enrolled.data ?? []) if (e.section_id) perSection.set(e.section_id, (perSection.get(e.section_id) ?? 0) + 1)
  const context: EnrollmentContext = {
    year,
    today: schoolToday(ctx.school?.timezone ?? "UTC"),
    students: new Map((students.data ?? []).map((s) => [s.student_number, s])),
    enrolled: new Set((enrolled.data ?? []).map((e) => e.student_id)),
    grades: grades.data ?? [],
    sections: (sections.data ?? []).map((s) => ({ ...s, enrolled: perSection.get(s.id) ?? 0 })),
  }

  let preview
  try {
    preview = await previewEnrollmentImport(await file.arrayBuffer(), file.name, context)
  } catch (e) {
    if (e instanceof ImportFileError) return NextResponse.json({ error: e.message }, { status: 400 })
    console.error("[import/enrollments]", e)
    return NextResponse.json({ error: "The file could not be read. Save it as Excel (.xlsx) or CSV and try again." }, { status: 400 })
  }
  const { inserts, ...shown } = preview
  if (mode === "preview") return NextResponse.json(shown)

  const rows = inserts.filter((r) => r !== null)
  if (rows.length === 0) return NextResponse.json({ error: "There are no valid rows to import." }, { status: 400 })
  const { error } = await supabase
    .from("student_enrollments")
    .insert(rows.map((r) => ({ ...r, school_id: ctx.schoolId, academic_year_id: yearId, enrollment_status: "enrolled" as const })))
  if (error) {
    const r = dbFail(error, "import/enrollments")
    return NextResponse.json({ error: r.ok ? "Import failed." : `Nothing was imported. ${r.error}` }, { status: 400 })
  }
  revalidatePath("/enrollments", "layout")
  revalidatePath("/students", "layout")
  revalidatePath("/sections", "layout")
  return NextResponse.json({ imported: rows.length, skipped: preview.invalid })
}
