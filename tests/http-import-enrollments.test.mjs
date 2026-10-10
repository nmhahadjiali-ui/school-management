// Enrollment import (POST /api/import/enrollments). TEST_APP_URL.
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import ExcelJS from "exceljs"
import { APP_URL, RUN, buildStructure, buildTenants, http, insert, service, sessionCookie } from "./helpers.mjs"

const skip = APP_URL ? false : "TEST_APP_URL not set (start the app to run HTTP tests)"
let t, A, B, cookie, S, cap

const n = (k) => `ENR${RUN}-${k}`

before(async () => {
  if (skip) return
  t = await buildTenants()
  ;({ A, B } = await buildStructure(t))
  cookie = Object.fromEntries(await Promise.all(["adminA", "adminB", "teacherA"].map(async (k) => [k, await sessionCookie(t.users[k].email)])))
  S = {}
  for (const k of ["1", "2", "3", "4", "5", "6", "7"]) S[k] = await insert("students", { school_id: t.schoolA.id, student_number: n(k), first_name: `F${k}`, last_name: `L${k}`, status: k === "5" ? "inactive" : "active" })
  cap = await insert("sections", { school_id: t.schoolA.id, academic_year_id: A.y2026.id, grade_level_id: A.g6.id, name: `CAP${RUN}`, code: `C${RUN}`, capacity: 1 })
  await insert("student_enrollments", { school_id: t.schoolA.id, academic_year_id: A.y2026.id, student_id: S["6"].id, grade_level_id: A.g6.id })
})

async function xlsx(rows) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Enrollments")
  for (const r of rows) ws.addRow(r)
  return new Blob([await wb.xlsx.writeBuffer()])
}

async function upload(who, blob, yearId, mode = "preview") {
  const body = new FormData()
  body.set("file", blob, "enrollments.xlsx")
  body.set("year", yearId)
  body.set("mode", mode)
  const res = await fetch(`${APP_URL}/api/import/enrollments`, { method: "POST", body, headers: { cookie: cookie[who] } })
  return { status: res.status, json: await res.json() }
}

describe("enrollment import", { skip }, () => {
  test("template downloads for school admins only", async () => {
    const res = await http(`/api/import/enrollments/template?year=${A.y2026.id}`, cookie.adminA)
    assert.equal(res.status, 200)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await res.arrayBuffer())
    assert.equal(wb.getWorksheet("Enrollments").getRow(1).getCell(3).value, "Grade level")
    assert.match(wb.getWorksheet("Instructions").getRow(1).getCell(1).value, /2026-2027/)
    assert.equal((await http(`/api/import/enrollments/template?year=${A.y2026.id}`, cookie.teacherA)).status, 403)
  })

  test("every row is checked against the school's records; import enrolls only the valid ones", async () => {
    const file = await xlsx([
      ["Student No.", "Student name", "Grade", "Section", "Date enrolled", "Remarks"],
      [n("1"), "L1, F1", "Grade 6", `CAP${RUN}`, "", ""],
      [n("2"), "", "g6", `c${RUN}`.toLowerCase(), "", ""],
      [n("3"), "", "G6", "", "6/15/2026", ""],
      [n("1"), "", "Grade 6", "", "", ""],
      ["NOPE-404", "", "Grade 6", "", "", ""],
      [n("4"), "", "Grade 99", "", "", ""],
      [n("5"), "", "Grade 6", "", "", ""],
      [n("6"), "", "Grade 6", "", "", ""],
      [n("7"), "", "Grade 6", "Z-none", "", ""],
    ])
    const p = await upload("adminA", file, A.y2026.id)
    assert.equal(p.status, 200, JSON.stringify(p.json))
    assert.deepEqual(p.json.ignoredColumns, ["Remarks"], "name columns are accepted, others ignored")
    const err = (row) => p.json.rows.find((r) => r.row === row).errors.join(" | ")
    assert.equal(err(2), "")
    assert.equal(p.json.rows[0].values.last_name, "L1", "name comes from the student record")
    assert.match(err(3), /over its capacity of 1/)
    assert.equal(err(4), "")
    assert.equal(p.json.rows[2].values.enrollment_date, "2026-06-15")
    assert.match(err(5), /also on row 2/)
    assert.match(err(6), /No student with number NOPE-404/)
    assert.match(err(7), /Grade level “Grade 99” was not found/)
    assert.match(err(8), /student is inactive/)
    assert.match(err(9), /Already enrolled/)
    assert.match(err(10), /has no section “Z-none”/)
    assert.equal(p.json.valid, 2)

    const imp = await upload("adminA", file, A.y2026.id, "import")
    assert.deepEqual(imp.json, { imported: 2, skipped: 7 })
    const { data } = await service.from("student_enrollments").select("student_id, grade_level_id, section_id, enrollment_date, enrollment_status").eq("academic_year_id", A.y2026.id).in("student_id", [S["1"].id, S["3"].id])
    const by = Object.fromEntries(data.map((e) => [e.student_id, e]))
    assert.equal(by[S["1"].id].section_id, cap.id)
    assert.equal(by[S["1"].id].grade_level_id, A.g6.id)
    assert.equal(by[S["3"].id].section_id, null)
    assert.equal(by[S["3"].id].enrollment_date, "2026-06-15")
    assert.ok(data.every((e) => e.enrollment_status === "enrolled"))

    // The same file again: nobody new (they are enrolled now).
    assert.equal((await upload("adminA", file, A.y2026.id)).json.valid, 0)
  })

  test("missing columns, archived years, other schools and teachers are refused", async () => {
    const noGrade = await upload("adminA", await xlsx([["Student number"], [n("2")]]), A.y2026.id)
    assert.match(noGrade.json.error, /Missing column: Grade level/)
    await service.from("academic_years").update({ status: "archived" }).eq("id", A.y2025.id)
    const archived = await upload("adminA", await xlsx([["Student number", "Grade level"], [n("2"), "Grade 5"]]), A.y2025.id)
    assert.match(archived.json.error, /archived/)
    const other = await upload("adminA", await xlsx([["Student number", "Grade level"], [n("2"), "Grade 6"]]), B.y2026.id)
    assert.match(other.json.error, /academic year was not found/)
    const teacher = await upload("teacherA", await xlsx([["Student number", "Grade level"], [n("2"), "Grade 6"]]), A.y2026.id, "import")
    assert.equal(teacher.status, 403)
    assert.equal((await service.from("student_enrollments").select("id").eq("student_id", S["2"].id)).data.length, 0)
  })
})
