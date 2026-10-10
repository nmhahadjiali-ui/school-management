import { NextResponse } from "next/server"
import { schoolAdmin } from "@/lib/actions/helpers"
import { enrollmentImportTemplate } from "@/lib/import/enrollments"
import { createClient } from "@/lib/supabase/server"
import { uuidSchema } from "@/lib/validations"

/** GET /api/import/enrollments/template?year=<id>: the Excel template for enrollment imports (school admins). */
export async function GET(request: Request) {
  const ctx = await schoolAdmin()
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  const yearId = new URL(request.url).searchParams.get("year") ?? ""
  let yearName = "the selected academic year"
  if (uuidSchema.safeParse(yearId).success) {
    const supabase = await createClient()
    const { data } = await supabase.from("academic_years").select("name").eq("id", yearId).eq("school_id", ctx.schoolId).maybeSingle()
    if (data) yearName = data.name
  }
  return new NextResponse(await enrollmentImportTemplate(yearName), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="enrollment-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  })
}
