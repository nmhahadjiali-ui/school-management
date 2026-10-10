import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { dbFail, schoolAdmin } from "@/lib/actions/helpers"
import { IMPORT_MAX_BYTES, IMPORT_SPECS, ImportFileError, importInsertValues, previewImport, type ImportEntity } from "@/lib/import/records"
import { createClient } from "@/lib/supabase/server"

/**
 * POST /api/import/students | /api/import/teachers (multipart: file, mode=preview|import).
 * School admins only, own school only (school from the session, RLS on insert).
 * "preview" checks every row; "import" re-checks and inserts the valid rows in
 * one statement (all of them or none). Blank numbers get automatic numbers.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/import/[entity]">) {
  const { entity } = await params
  if (entity !== "students" && entity !== "teachers") return NextResponse.json({ error: "not_found" }, { status: 404 })
  const spec = IMPORT_SPECS[entity as ImportEntity]
  const ctx = await schoolAdmin()
  if (!ctx) return NextResponse.json({ error: "You do not have permission to do that." }, { status: 403 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 })
  }
  const file = form.get("file")
  const mode = form.get("mode") === "import" ? "import" : "preview"
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 })
  if (file.size > IMPORT_MAX_BYTES) return NextResponse.json({ error: "The file is larger than 2 MB." }, { status: 400 })
  if (!/\.(xlsx|csv)$/i.test(file.name)) {
    return NextResponse.json(
      { error: /\.xls$/i.test(file.name) ? "Old .xls files are not supported. In Excel, use File > Save As > Excel Workbook (.xlsx)." : "Use an Excel (.xlsx) or CSV file." },
      { status: 400 }
    )
  }

  const supabase = await createClient()
  const { data: settings } = await supabase.from("school_settings").select("student_number_auto, employee_number_auto").eq("school_id", ctx.schoolId).maybeSingle()
  const existingNumbers = async (numbers: string[]) => {
    const taken = new Set<string>()
    if (entity === "teachers") {
      // Employee numbers are unique ignoring case: compare against all of them.
      const { data } = await supabase.from("teachers").select("employee_number").eq("school_id", ctx.schoolId).not("employee_number", "is", null).limit(20000)
      for (const t of data ?? []) if (t.employee_number) taken.add(t.employee_number)
      return taken
    }
    for (let i = 0; i < numbers.length; i += 200) {
      const { data } = await supabase.from("students").select("student_number").eq("school_id", ctx.schoolId).in("student_number", numbers.slice(i, i + 200))
      for (const s of data ?? []) taken.add(s.student_number)
    }
    return taken
  }

  let preview
  try {
    preview = await previewImport(entity, await file.arrayBuffer(), file.name, { autoNumbers: settings?.[spec.autoSetting] ?? false, existingNumbers })
  } catch (e) {
    if (e instanceof ImportFileError) return NextResponse.json({ error: e.message }, { status: 400 })
    console.error(`[import/${entity}]`, e)
    return NextResponse.json({ error: "The file could not be read. Save it as Excel (.xlsx) or CSV and try again." }, { status: 400 })
  }
  if (mode === "preview") return NextResponse.json(preview)

  const valid = preview.rows.filter((r) => r.errors.length === 0)
  if (valid.length === 0) return NextResponse.json({ error: "There are no valid rows to import." }, { status: 400 })
  const rows = valid.map((r) => ({ ...importInsertValues(entity, r.values), school_id: ctx.schoolId }))
  // Typed per table; the values were checked against the same schema as the forms.
  const { error } = await supabase.from(entity as "students").insert(rows as never)
  if (error) {
    const r = dbFail(error, `import/${entity}`)
    return NextResponse.json({ error: r.ok ? "Import failed." : `Nothing was imported. ${r.error}` }, { status: 400 })
  }
  revalidatePath(`/${entity}`, "layout")
  return NextResponse.json({ imported: valid.length, skipped: preview.invalid })
}
