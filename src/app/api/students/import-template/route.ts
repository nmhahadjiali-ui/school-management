import { NextResponse } from "next/server"
import { schoolAdmin } from "@/lib/actions/helpers"
import { studentImportTemplate } from "@/lib/students/import"

/** GET /api/students/import-template: the Excel template for student imports (school admins). */
export async function GET() {
  if (!(await schoolAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  return new NextResponse(await studentImportTemplate(), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="student-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  })
}
