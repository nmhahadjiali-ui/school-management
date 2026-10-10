// Numbering settings and blank numbers through the web app (TEST_APP_URL).
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { APP_URL, asForm, buildTenants, callAction, http, service, sessionCookie } from "./helpers.mjs"

const skip = APP_URL ? false : "TEST_APP_URL not set (start the app to run HTTP tests)"
let t, cookie

before(async () => {
  if (skip) return
  t = await buildTenants()
  cookie = { adminA: await sessionCookie(t.users.adminA.email), teacherA: await sessionCookie(t.users.teacherA.email) }
})

const save = (who, values) => callAction("updateNumberingSettings", [null, asForm(values)], cookie[who], "/settings")
const base = { student_number_auto: "on", student_number_format: "STU-{YYYY}-{#####}", student_number_next: "15", employee_number_format: "EMP-{####}", employee_number_next: "1" }

describe("numbering settings (web)", { skip }, () => {
  test("invalid formats are explained; teachers cannot save", async () => {
    const bad = (await save("adminA", { ...base, student_number_format: "STU-{####}-{##}" })).result
    assert.equal(bad.ok, false)
    assert.match(bad.fieldErrors.student_number_format[0], /at most once/)
    assert.equal((await save("teacherA", base)).result.ok, false)
  })

  test("admin turns on student numbering; a blank number is assigned on save", async () => {
    assert.equal((await save("adminA", base)).result.ok, true)
    const page = await (await http("/students/new", cookie.adminA)).text()
    const year = new Date().getFullYear()
    assert.ok(page.includes(`STU-${year}-00015`), "form shows the next number")

    const r = await callAction("createStudent", [null, asForm({ student_number: "", first_name: "Blank", last_name: "Number", status: "active" })], cookie.adminA, "/students/new")
    assert.ok(r.redirect?.includes("/students/"), JSON.stringify(r.result))
    const { data } = await service.from("students").select("student_number").eq("school_id", t.schoolA.id).eq("last_name", "Number").single()
    assert.equal(data.student_number, `STU-${year}-00015`)
  })
})
