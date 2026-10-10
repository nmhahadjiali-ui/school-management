// Automatic student / employee numbers (assigned by the database on insert).
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { buildTenants, service, signedIn } from "./helpers.mjs"

let t, adminA, adminB
const year = String(new Date().getFullYear())

before(async () => {
  t = await buildTenants()
  adminA = await signedIn(t.users.adminA.email)
  adminB = await signedIn(t.users.adminB.email)
})

const settings = (client, schoolId, values) => client.from("school_settings").update(values).eq("school_id", schoolId).select("id").single()
const addStudent = (client, schoolId, number, last = "Auto") =>
  client.from("students").insert({ school_id: schoolId, student_number: number, first_name: "Ann", last_name: last }).select("student_number").single()
const addTeacher = (client, schoolId, number) =>
  client.from("teachers").insert({ school_id: schoolId, employee_number: number, first_name: "Tom", last_name: "Auto" }).select("employee_number").single()

describe("automatic numbering", () => {
  test("off by default: students need a number, teachers may have none", async () => {
    const s = await addStudent(adminA, t.schoolA.id, "")
    assert.equal(s.error?.code, "P0001")
    assert.match(s.error.message, /Enter a student number/)
    const tch = await addTeacher(adminA, t.schoolA.id, null)
    assert.equal(tch.error, null)
    assert.equal(tch.data.employee_number, null)
  })

  test("blank numbers get the next number in the school's format; typed numbers are kept", async () => {
    assert.equal((await settings(adminA, t.schoolA.id, { student_number_auto: true, student_number_format: "{YYYY}-{####}", student_number_next: 1, employee_number_auto: true, employee_number_format: "EMP-{YY}-{###}", employee_number_next: 7 })).error, null)
    assert.equal((await addStudent(adminA, t.schoolA.id, "")).data.student_number, `${year}-0001`)
    assert.equal((await addStudent(adminA, t.schoolA.id, null)).data.student_number, `${year}-0002`)
    assert.equal((await addStudent(adminA, t.schoolA.id, "MANUAL-9")).data.student_number, "MANUAL-9")
    assert.equal((await addStudent(adminA, t.schoolA.id, "  ")).data.student_number, `${year}-0003`)
    assert.equal((await addTeacher(adminA, t.schoolA.id, "")).data.employee_number, `EMP-${year.slice(-2)}-007`)
    assert.equal((await addTeacher(adminA, t.schoolA.id, null)).data.employee_number, `EMP-${year.slice(-2)}-008`)
    const { data } = await service.from("school_settings").select("student_number_next, employee_number_next").eq("school_id", t.schoolA.id).single()
    assert.deepEqual(data, { student_number_next: 4, employee_number_next: 9 })
  })

  test("numbers already in use are skipped", async () => {
    await addStudent(adminA, t.schoolA.id, `${year}-0004`)
    await addStudent(adminA, t.schoolA.id, `${year}-0005`)
    assert.equal((await addStudent(adminA, t.schoolA.id, "")).data.student_number, `${year}-0006`)
  })

  test("concurrent saves never get the same number", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => addStudent(adminA, t.schoolA.id, "", `Many${i}`)))
    const numbers = results.map((r) => { assert.equal(r.error, null); return r.data.student_number })
    assert.equal(new Set(numbers).size, 20)
  })

  test("each school has its own counter and format", async () => {
    await settings(adminB, t.schoolB.id, { student_number_auto: true, student_number_format: "S{######}", student_number_next: 42 })
    assert.equal((await addStudent(adminB, t.schoolB.id, "")).data.student_number, "S000042")
  })

  test("invalid formats and counters are rejected by the database", async () => {
    for (const bad of [{ student_number_format: "{YYYY}" }, { student_number_format: "A{##}{##}" }, { student_number_format: "<b>{###}" }, { employee_number_format: "x" }, { student_number_next: 0 }]) {
      const r = await settings(adminA, t.schoolA.id, bad)
      assert.ok(r.error, JSON.stringify(bad))
    }
  })

  test("teachers cannot change the numbering settings", async () => {
    const teacher = await signedIn(t.users.teacherA.email)
    await teacher.from("school_settings").update({ student_number_next: 999 }).eq("school_id", t.schoolA.id)
    const { data } = await service.from("school_settings").select("student_number_next").eq("school_id", t.schoolA.id).single()
    assert.notEqual(data.student_number_next, 999)
  })
})
