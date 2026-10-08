// Phase 3 over HTTP against a running build (TEST_APP_URL): page access per
// role, cross-school 404s, the file route, and Server Actions with forged input.
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { APP_URL, asForm, buildAcademic, buildStructure, buildTenants, callAction, http, insert, service, sessionCookie, signedIn, today } from "./helpers.mjs"

const built = existsSync(new URL("../.next/server/server-reference-manifest.json", import.meta.url))
const skip = !APP_URL ? "TEST_APP_URL not set" : !built ? "no build found (run npm run build)" : false
let t, A, B, cookie, joseLoad

before(async () => {
  if (skip) return
  t = await buildTenants()
  const S = await buildAcademic(await buildStructure(t))
  A = S.A
  B = S.B
  joseLoad = await insert("teacher_subject_assignments", { school_id: t.schoolA.id, academic_year_id: A.y2026.id, teacher_id: A.teacher2.id, subject_id: A.sci.id, section_id: A.g6a.id })
  const entries = await Promise.all(Object.entries(t.users).map(async ([k, u]) => [k, await sessionCookie(u.email)]))
  cookie = Object.fromEntries(entries)
})

const status = async (path, who) => (await http(path, cookie[who])).status
const html = async (path, who) => (await (await http(path, cookie[who])).text()).replace(/<script[\s\S]*?<\/script>/g, "")
const act = (name, args, who, path) => callAction(name, args, cookie[who], path)

describe("academic pages by role", { skip }, () => {
  test("school admin reaches every academic screen", async () => {
    for (const p of ["/attendance", `/attendance?section=${A.g6a.id}`, "/attendance/reports", "/attendance/reports?view=date", "/grades/review", "/grading-periods", "/grading-scales", `/schedules?section=${A.g6a.id}`, "/coursework", "/coursework/new", `/coursework/${A.homework.id}`, "/notifications", "/settings", "/teaching-loads"]) {
      assert.equal(await status(p, "adminA"), 200, p)
    }
  })

  test("teacher reaches their tools but not admin screens", async () => {
    for (const p of [`/attendance?section=${A.g6a.id}`, "/schedule", "/grades", `/grades/entry?load=${A.assignMath.id}&period=${A.p1.id}`, "/coursework", `/coursework/${A.homework.id}`, "/attendance/reports"]) {
      assert.equal(await status(p, "teacherA"), 200, p)
    }
    for (const p of ["/grades/review", "/schedules", "/grading-periods", "/grading-scales"]) {
      assert.equal(await status(p, "teacherA"), 307, p)
    }
  })

  test("teacher cannot open another teacher's grade sheet or another school's", async () => {
    assert.equal(await status(`/grades/entry?load=${joseLoad.id}&period=${A.p1.id}`, "teacherA"), 404)
    assert.equal(await status(`/grades/entry?load=${B.assignMath.id}&period=${B.p1.id}`, "teacherA"), 404)
  })

  test("teacher's attendance page never lists an unrelated section's students", async () => {
    const page = await html(`/attendance?section=${A.g6c.id}`, "teacherA")
    assert.ok(!page.includes("OtherA"), "G6-C student must not appear")
    const own = await html(`/attendance?section=${A.g6a.id}`, "teacherA")
    assert.ok(own.includes("DoeA"))
  })

  test("students see their own schedule and coursework; other schools' are 404", async () => {
    assert.equal(await status("/schedule", "studentA"), 200)
    assert.ok((await html("/coursework", "studentA")).includes("Fractions worksheet"))
    assert.equal(await status(`/coursework/${A.homework.id}`, "studentA"), 200)
    assert.equal(await status(`/coursework/${B.homework.id}`, "studentA"), 404)
    for (const p of ["/attendance", "/grades", "/grades/review"]) assert.equal(await status(p, "studentA"), 307, p)
  })

  test("parents see their child's academics, not other students'", async () => {
    assert.equal(await status(`/students/${A.student.id}`, "parentA"), 200)
    assert.equal(await status(`/coursework/${A.homework.id}`, "parentA"), 200)
    assert.equal(await status(`/coursework/${B.homework.id}`, "parentA"), 404)
    assert.equal(await status(`/students/${B.student.id}`, "parentA"), 404)
    assert.equal(await status("/notifications", "parentA"), 200)
  })

  test("a disabled module is unreachable", async () => {
    await service.from("school_features").update({ enabled: false }).eq("school_id", t.schoolA.id).eq("feature_key", "grades")
    try {
      assert.equal(await status("/grades", "teacherA"), 307)
      assert.equal(await status("/grades/review", "adminA"), 307)
    } finally {
      await service.from("school_features").update({ enabled: true }).eq("school_id", t.schoolA.id).eq("feature_key", "grades")
    }
  })
})

describe("files over HTTP", { skip }, () => {
  test("download links only work for people who may see the file", async () => {
    const path = `${t.schoolA.id}/assignments/${A.homework.id}/http-test.txt`
    const teacher = await signedIn(t.users.teacherA.email)
    const up = await teacher.storage.from("academic-files").upload(path, new Blob(["hello"], { type: "text/plain" }))
    assert.equal(up.error, null)
    const url = `/api/files?path=${encodeURIComponent(path)}`
    assert.equal(await status(url, "studentA"), 302)
    assert.equal(await status(url, "parentA"), 302)
    for (const who of ["studentB", "teacherB", "adminB"]) assert.equal(await status(url, who), 404, who)
    assert.equal((await http(url)).status, 401)
    assert.equal(await status("/api/files?path=..%2F..%2Fetc%2Fpasswd", "adminA"), 404)
  })
})

describe("academic server actions with forged input", { skip }, () => {
  const sheet = (enr, s = "present") => [{ enrollment_id: enr.id, status: s, remarks: null }]

  test("attendance: own section works, forged section is refused", async () => {
    const ok = await act("saveAttendance", [{ section_id: A.g6a.id, date: today(), records: sheet(A.enr2026) }], "teacherA")
    assert.equal(ok.result.ok, true, JSON.stringify(ok.result))
    const forged = await act("saveAttendance", [{ section_id: A.g6c.id, date: today(), records: sheet(A.enrOther) }], "teacherA")
    assert.equal(forged.result.ok, false)
    const other = await act("saveAttendance", [{ section_id: B.g6a.id, date: today(), records: sheet(B.enr2026) }], "teacherA")
    assert.equal(other.result.ok, false)
    const student = await act("saveAttendance", [{ section_id: A.g6a.id, date: today(), records: sheet(A.enr2026, "absent") }], "studentA")
    assert.deepEqual(student.result, { ok: false, error: "You do not have permission to do that." })
  })

  test("grades: only the caller's own teaching load", async () => {
    const entries = [{ enrollment_id: A.enr2026.id, score: 88, remarks: null }]
    const own = await act("saveGradeSheet", [{ load_id: A.assignMath.id, period_id: A.p1.id, submit: false, entries }], "teacherA")
    assert.equal(own.result.ok, true, JSON.stringify(own.result))
    for (const load of [joseLoad, B.assignMath]) {
      const r = await act("saveGradeSheet", [{ load_id: load.id, period_id: A.p1.id, submit: false, entries }], "teacherA")
      assert.equal(r.result.ok, false)
    }
    const { data } = await service.from("grade_records").select("teacher_id").eq("enrollment_id", A.enr2026.id)
    assert.ok(data.every((g) => g.teacher_id === A.teacher.id), "no grade created under another teacher")
  })

  test("only school admins review grades or change academic policies", async () => {
    const { data: g } = await service.from("grade_records").select("id").eq("enrollment_id", A.enr2026.id).limit(1).single()
    // Make it approvable, so a successful cross-school approve would be visible.
    await service.from("grade_records").update({ status: "submitted" }).eq("id", g.id)
    const r = await act("reviewGrades", [{ ids: [g.id], action: "approve", reason: null }], "teacherA")
    assert.deepEqual(r.result, { ok: false, error: "You do not have permission to do that." })
    const p = await act("updateAcademicSettings", [null, asForm({ attendance_edit_days: "", grade_max_score: 100, grade_passing_score: 0 })], "teacherA")
    assert.equal(p.result.ok, false)
    const b = await act("reviewGrades", [{ ids: [g.id], action: "approve", reason: null }], "adminB")
    assert.equal(b.result.ok, true, "the call succeeds but…")
    const { data: after } = await service.from("grade_records").select("status").eq("id", g.id).single()
    assert.equal(after.status, "submitted", "…School B's admin changed nothing in School A")
    const a = await act("reviewGrades", [{ ids: [g.id], action: "approve", reason: null }], "adminA")
    assert.match(a.result.message, /^1 grade approved/, "School A's admin can")
  })

  test("coursework: own load only; attachments must live in the record's folder", async () => {
    const created = await act("createCoursework", [null, asForm({ load_id: A.assignMath.id, title: "Action test", status: "published" })], "teacherA", "/coursework/new")
    assert.match(created.redirect ?? "", /^\/coursework\/[0-9a-f-]{36}\?created=1/)
    const id = created.redirect.split("/")[2].split("?")[0]
    const jose = await act("createCoursework", [null, asForm({ load_id: joseLoad.id, title: "Hijack", status: "published" })], "teacherA", "/coursework/new")
    assert.deepEqual(jose.result, { ok: false, error: "You do not have permission to do that." })
    const bad = await act("setCourseworkAttachment", [id, `${t.schoolB.id}/assignments/${id}/x.pdf`, "x.pdf"], "teacherA")
    assert.equal(bad.result.ok, false)
  })

  test("submissions: a student cannot submit someone else's file path", async () => {
    const forged = await act("submitWork", [A.homework.id, { content: "x", file_path: `${t.schoolA.id}/submissions/${A.homework.id}/${A.sibling.id}/a.txt`, file_name: "a.txt" }], "studentA")
    assert.equal(forged.result.ok, false)
    const ok = await act("submitWork", [A.homework.id, { content: "My answer", file_path: null, file_name: null }], "studentA")
    assert.equal(ok.result.ok, true, JSON.stringify(ok.result))
    const { data } = await service.from("assignment_submissions").select("student_id").eq("assignment_id", A.homework.id)
    assert.deepEqual(data.map((s) => s.student_id), [A.student.id])
  })
})
