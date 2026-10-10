import { NextResponse } from "next/server"
import { schoolAdmin } from "@/lib/actions/helpers"
import { importTemplate } from "@/lib/import/records"

/** GET /api/import/students/template | /api/import/teachers/template: the Excel template (school admins). */
export async function GET(_request: Request, { params }: RouteContext<"/api/import/[entity]/template">) {
  const { entity } = await params
  if (entity !== "students" && entity !== "teachers") return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (!(await schoolAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  return new NextResponse(await importTemplate(entity), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${entity.slice(0, -1)}-import-template.xlsx"`,
      "Cache-Control": "no-store",
    },
  })
}
