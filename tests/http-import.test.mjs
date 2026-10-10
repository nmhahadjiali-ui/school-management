// Student and teacher import from Excel / CSV (POST /api/import/:entity). TEST_APP_URL.
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import ExcelJS from "exceljs"
import { APP_URL, RUN, buildTenants, http, insert, service, sessionCookie } from "./helpers.mjs"

const skip = APP_URL ? false : "TEST_APP_URL not set (start the app to run HTTP tests)"
let t, cookie

before(async () => {
  if (skip) return
  t = await buildTenants()
  cookie = Object.fromEntries(await Promise.all(["adminA", "adminB", "teacherA"].map(async (k) => [k, await sessionCookie(t.users[k].email)])))
})

async function xlsx(rows) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Students")
  for (const r of rows) ws.addRow(r)
  return new Blob([await wb.xlsx.writeBuffer()])
}

async function upload(who, blob, name, mode = "preview", entity = "students") {
  const body = new FormData()
  body.set("file", blob, name)
  body.set("mode", mode)
  const res = await fetch(`${APP_URL}/api/import/${entity}`, { method: "POST", body, headers: { cookie: cookie[who] } })
  return { status: res.status, json: await res.json() }
}

const num = (s) => `${RUN}-${s}`

describe("student import", { skip }, () => {
  test("template downloads for school admins only", async () => {
    const res = await http("/api/import/students/template", cookie.adminA)
    assert.equal(res.status, 200)
    assert.match(res.headers.get("content-type"), /spreadsheetml/)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await res.arrayBuffer())
    assert.equal(wb.getWorksheet("Students").getRow(1).getCell(2).value, "First name")
    assert.equal((await http("/api/import/students/template", cookie.teacherA)).status, 403)
  })

  test("preview checks every row; import adds only the valid ones", async () => {
    await insert("students", { school_id: t.schoolA.id, student_number: num("TAKEN"), first_name: "Old", last_name: "Student" })
    const file = await xlsx([
      ["Student No.", "First Name", "Middle Name", "Surname", "Birthdate", "Sex", "Email", "Notes"],
      [num("1"), "Juan", "Santos", "Dela Cruz", new Date(Date.UTC(2015, 2, 14)), "M", "juan@example.com", "x"],
      [num("2"), "Maria", "", "Reyes", "3/5/2016", "Female", "", ""],
      [num("3"), "Bad", "", "Email", "", "", "not-an-email", ""],
      [num("2"), "Dup", "", "Number", "", "", "", ""],
      [num("TAKEN"), "Taken", "", "Number", "", "", "", ""],
      [num("6"), "", "", "NoFirst", "", "", "", ""],
      [num("7"), "Future", "", "Born", "2999-01-01", "", "", ""],
      [num("8"), "Odd", "", "Gender", "", "Q", "", ""],
      [],
    ])
    const p = await upload("adminA", file, "students.xlsx")
    assert.equal(p.status, 200, JSON.stringify(p.json))
    assert.equal(p.json.rows.length, 8, "blank rows are ignored")
    assert.equal(p.json.valid, 2)
    assert.deepEqual(p.json.ignoredColumns, ["Notes"])
    const errs = Object.fromEntries(p.json.rows.map((r) => [r.values.last_name, r.errors.join(" | ")]))
    assert.equal(errs["Dela Cruz"], "")
    assert.equal(p.json.rows[0].values.date_of_birth, "2015-03-14")
    assert.equal(p.json.rows[1].values.date_of_birth, "2016-03-05")
    assert.match(errs.Email, /valid email/)
    assert.match(errs.Number, /also appears on row 3|already used/)
    assert.match(errs.NoFirst, /First name is required/)
    assert.match(errs.Born, /future/)
    assert.match(errs.Gender, /Gender/)

    const before = await service.from("students").select("id", { count: "exact", head: true }).eq("school_id", t.schoolA.id)
    const imp = await upload("adminA", file, "students.xlsx", "import")
    assert.equal(imp.status, 200, JSON.stringify(imp.json))
    assert.deepEqual(imp.json, { imported: 2, skipped: 6 })
    const after = await service.from("students").select("id", { count: "exact", head: true }).eq("school_id", t.schoolA.id)
    assert.equal(after.count - before.count, 2)
    const { data: juan } = await service.from("students").select("school_id, first_name, middle_name, last_name, date_of_birth, gender, email, status").eq("student_number", num("1")).single()
    assert.deepEqual(juan, { school_id: t.schoolA.id, first_name: "Juan", middle_name: "Santos", last_name: "Dela Cruz", date_of_birth: "2015-03-14", gender: "male", email: "juan@example.com", status: "active" })

    // Importing the same file again adds nobody: the numbers are now taken.
    const again = await upload("adminA", file, "students.xlsx")
    assert.equal(again.json.valid, 0)
  })

  test("CSV works (BOM, quoted commas)", async () => {
    const csv = `﻿Student number,First name,Last name,Address\r\n${num("C1")},Ana,"Lim, Jr",“Purok 1, Marawi”\r\n`
    const p = await upload("adminA", new Blob([csv]), "list.csv")
    assert.equal(p.json.valid, 1, JSON.stringify(p.json))
    assert.equal(p.json.rows[0].values.last_name, "Lim, Jr")
  })

  test("missing columns, wrong file types and empty files are explained", async () => {
    const noLast = await upload("adminA", await xlsx([["Student number", "First name"], ["1", "A"]]), "a.xlsx")
    assert.equal(noLast.status, 400)
    assert.match(noLast.json.error, /Missing column: Last name/)
    const xls = await upload("adminA", new Blob(["x"]), "old.xls")
    assert.match(xls.json.error, /\.xls files are not supported/)
    const junk = await upload("adminA", new Blob(["not really excel"]), "fake.xlsx")
    assert.match(junk.json.error, /could not be read/)
    const empty = await upload("adminA", await xlsx([["First name", "Last name", "Student number"]]), "e.xlsx")
    assert.match(empty.json.error, /no students/)
  })

  test("blank numbers get automatic numbers when that is on", async () => {
    await service.from("school_settings").update({ student_number_auto: true, student_number_format: `IMP${RUN}-`, student_number_next: 1 }).eq("school_id", t.schoolB.id)
    const file = await xlsx([["First name", "Last name"], ["One", "Auto"], ["Two", "Auto"]])
    const p = await upload("adminB", file, "auto.xlsx")
    assert.equal(p.json.valid, 2, JSON.stringify(p.json))
    await upload("adminB", file, "auto.xlsx", "import")
    const { data } = await service.from("students").select("student_number").eq("school_id", t.schoolB.id).eq("last_name", "Auto").order("student_number")
    assert.deepEqual(data.map((s) => s.student_number), [`IMP${RUN}-1`, `IMP${RUN}-2`])
  })

  test("without automatic numbers, a missing number column or blank numbers are refused", async () => {
    const r = await upload("adminA", await xlsx([["First name", "Last name"], ["A", "B"]]), "n.xlsx")
    assert.match(r.json.error, /Missing columns?: Student number/)
  })

  test("teachers cannot import; admins import only into their own school", async () => {
    const file = await xlsx([["Student number", "First name", "Last name"], [num("T1"), "Not", "Allowed"]])
    assert.equal((await upload("teacherA", file, "t.xlsx", "import")).status, 403)
    assert.equal((await service.from("students").select("id").eq("student_number", num("T1"))).data.length, 0)
    await upload("adminB", file, "t.xlsx", "import")
    const { data } = await service.from("students").select("school_id").eq("student_number", num("T1")).single()
    assert.equal(data.school_id, t.schoolB.id)
  })

  test("teachers: import with optional, case-insensitive unique employee numbers", async () => {
    const tpl = await http("/api/import/teachers/template", cookie.adminA)
    assert.equal(tpl.status, 200)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await tpl.arrayBuffer())
    assert.equal(wb.getWorksheet("Teachers").getRow(1).getCell(1).value, "Employee number")

    await insert("teachers", { school_id: t.schoolA.id, employee_number: `E${RUN}-TAKEN`, first_name: "Old", last_name: "Teacher" })
    const file = await xlsx([
      ["Emp No", "First name", "Last name", "Email", "Subject", "Status"],
      [`E${RUN}-1`, "Amina", "Macarambon", "AMINA.${RUN}@Example.com", "Mathematics", "Active"],
      ["", "No", "Number", "", "Science", ""],
      [`e${RUN}-1`, "Same", "Number", "", "", ""],
      [`e${RUN}-taken`, "Taken", "Already", "", "", ""],
      [`E${RUN}-5`, "Gone", "Away", "", "", "Retired"],
      [`E${RUN}-6`, "Bad", "Status", "", "", "Fired"],
    ].map((r) => r.map((c) => (typeof c === "string" ? c.replace("${RUN}", RUN) : c))))
    const p = await upload("adminA", file, "teachers.xlsx", "preview", "teachers")
    assert.equal(p.status, 200, JSON.stringify(p.json))
    const errs = Object.fromEntries(p.json.rows.map((r) => [r.values.last_name, r.errors.join(" | ")]))
    assert.equal(errs.Macarambon, "")
    assert.equal(errs.Number, `Employee number e${RUN}-1 also appears on row 2`)
    assert.match(errs.Already, /already used in your school/)
    assert.equal(errs.Away, "")
    assert.match(errs.Status, /Status is not valid/)
    assert.equal(p.json.valid, 3)

    const imp = await upload("adminA", file, "teachers.xlsx", "import", "teachers")
    assert.deepEqual(imp.json, { imported: 3, skipped: 3 })
    const { data } = await service.from("teachers").select("employee_number, email, specialization, status").eq("school_id", t.schoolA.id).in("last_name", ["Macarambon", "Number", "Away"]).order("last_name")
    assert.deepEqual(data, [
      { employee_number: `E${RUN}-5`, email: null, specialization: null, status: "retired" },
      { employee_number: `E${RUN}-1`, email: `amina.${RUN}@example.com`.toLowerCase(), specialization: "Mathematics", status: "active" },
      { employee_number: null, email: null, specialization: "Science", status: "active" },
    ])
  })

  test("teachers: blank employee numbers get automatic numbers when that is on", async () => {
    await service.from("school_settings").update({ employee_number_auto: true, employee_number_format: `T${RUN}-{##}`, employee_number_next: 3 }).eq("school_id", t.schoolB.id)
    const file = await xlsx([["First name", "Last name"], ["One", "AutoT"], ["Two", "AutoT"]])
    const imp = await upload("adminB", file, "auto.xlsx", "import", "teachers")
    assert.equal(imp.json.imported, 2, JSON.stringify(imp.json))
    const { data } = await service.from("teachers").select("employee_number").eq("school_id", t.schoolB.id).eq("last_name", "AutoT").order("employee_number")
    assert.deepEqual(data.map((x) => x.employee_number), [`T${RUN}-03`, `T${RUN}-04`])
    assert.equal((await upload("teacherA", file, "x.xlsx", "import", "teachers")).status, 403)
    assert.equal((await http("/api/import/guardians/template", cookie.adminA)).status, 404)
  })
})
