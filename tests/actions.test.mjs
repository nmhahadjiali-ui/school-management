// Server Actions called over HTTP exactly as the browser does (React's
// encodeReply + Next-Action header), including FORGED arguments an attacker
// could send: other schools' ids in bound parameters, school_id in forms.
// Requires TEST_APP_URL and a build (.next/server/server-reference-manifest.json).
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { existsSync } from "node:fs"
import { APP_URL, PASSWORD, RUN, anon, buildStructure, buildTenants, latestEmail, service, sessionCookie } from "./helpers.mjs"

const require = createRequire(import.meta.url)
const manifestPath = new URL("../.next/server/server-reference-manifest.json", import.meta.url)
const skip = !APP_URL ? "TEST_APP_URL not set" : !existsSync(manifestPath) ? "no build found (run npm run build)" : false

let t, A, B, cookie, encodeReply, manifest

before(async () => {
  if (skip) return
  ;({ encodeReply } = require("next/dist/compiled/react-server-dom-webpack/client.node"))
  manifest = require(manifestPath.pathname.replace(/^\/([A-Za-z]:)/, "$1"))
  t = await buildTenants()
  const S = await buildStructure(t)
  A = S.A
  B = S.B
  const entries = await Promise.all(["adminA", "teacherA", "parentA"].map(async (k) => [k, await sessionCookie(t.users[k].email)]))
  cookie = Object.fromEntries(entries)
})

/** Invoke a Server Action. `args` = bound args followed by call args; objects become FormData. */
async function action(name, args, who, path = "/dashboard") {
  const id = Object.entries(manifest.node).find(([, v]) => v.exportedName === name)?.[0]
  assert.ok(id, `action ${name} not found`)
  const encoded = args.map((a) => {
    if (a && typeof a === "object") {
      const fd = new FormData()
      for (const [k, v] of Object.entries(a)) fd.set(k, String(v))
      return fd
    }
    return a
  })
  const res = await fetch(`${APP_URL}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { cookie: cookie[who], "Next-Action": id, Origin: APP_URL, Accept: "text/x-component" },
    body: await encodeReply(encoded),
  })
  const redirect = res.headers.get("x-action-redirect")
  const body = await res.text()
  const line = body.split("\n").find((l) => l.startsWith("1:"))
  return { status: res.status, redirect, result: line ? JSON.parse(line.slice(2)) : null }
}

const studentForm = (n) => ({ student_number: n, first_name: "Act", last_name: `Student${n}`, status: "active" })

describe("server actions: school comes from the session", { skip }, () => {
  test("createStudent ignores a forged school_id and opens the new profile", async () => {
    const { redirect } = await action("createStudent", [null, { ...studentForm(`ACT-${RUN}`), school_id: t.schoolB.id }], "adminA", "/students/new")
    assert.match(redirect ?? "", /^\/students\/[0-9a-f-]{36}\?created=1/)
    const id = redirect.split("/")[2].split("?")[0]
    const { data } = await service.from("students").select("school_id").eq("id", id).single()
    assert.equal(data.school_id, t.schoolA.id)
  })

  test("duplicate student numbers return a field error", async () => {
    const { result } = await action("createStudent", [null, studentForm("2026-0001")], "adminA", "/students/new")
    assert.equal(result.ok, false)
    assert.match(result.fieldErrors.student_number[0], /already used/)
  })

  test("non-admins are denied", async () => {
    for (const who of ["teacherA", "parentA"]) {
      const { result } = await action("createStudent", [null, studentForm(`X-${who}`)], who, "/students/new")
      assert.deepEqual(result, { ok: false, error: "You do not have permission to do that." }, who)
    }
  })
})

describe("server actions: forged ids from another school", { skip }, () => {
  test("updating a School B student by id fails and changes nothing", async () => {
    const { result } = await action("updateStudent", [B.student.id, null, { ...studentForm("HACK"), first_name: "Hacked" }], "adminA")
    assert.equal(result.ok, false)
    const { data } = await service.from("students").select("first_name").eq("id", B.student.id).single()
    assert.equal(data.first_name, "John")
  })

  test("linking a School B guardian is rejected", async () => {
    const { result } = await action("linkGuardian", [null, { student_id: A.loner.id, guardian_id: B.guardian2.id, relationship_type: "father" }], "adminA")
    assert.equal(result.ok, false)
    assert.match(result.error, /does not belong/)
  })

  test("assigning a School B subject is rejected", async () => {
    const { result } = await action("createAssignment", [null, { academic_year_id: A.y2026.id, teacher_id: A.teacher.id, subject_id: B.sci.id, section_id: A.g6c.id }], "adminA")
    assert.equal(result.ok, false)
  })

  test("inviting a School B teacher is rejected", async () => {
    const { result } = await action("inviteAccount", ["teacher", B.teacher2.id], "adminA")
    assert.equal(result.ok, false)
  })

  test("archiving a School B academic year fails", async () => {
    const { result } = await action("archiveAcademicYear", [B.y2025.id], "adminA")
    assert.equal(result.ok, false)
    const { data } = await service.from("academic_years").select("status").eq("id", B.y2025.id).single()
    assert.equal(data.status, "active")
  })
})

describe("server actions: enrollment workflow", { skip }, () => {
  test("enroll, reject a mismatched section, then transfer keeping history", async () => {
    const wrong = await action("enrollStudent", [null, { student_id: A.loner.id, academic_year_id: A.y2026.id, grade_level_id: A.g6.id, section_id: A.g5a.id, enrollment_date: "2026-06-01" }], "adminA")
    assert.equal(wrong.result.ok, false)
    assert.ok(wrong.result.fieldErrors.section_id)

    const ok = await action("enrollStudent", [null, { student_id: A.loner.id, academic_year_id: A.y2026.id, grade_level_id: A.g6.id, section_id: A.g6b.id, enrollment_date: "2026-06-01" }], "adminA")
    assert.equal(ok.result.ok, true, JSON.stringify(ok.result))
    const { data: enr } = await service.from("student_enrollments").select("id").eq("student_id", A.loner.id).single()

    const moved = await action("transferStudent", [enr.id, null, { grade_level_id: A.g6.id, section_id: A.g6c.id, effective_date: "2026-08-01" }], "adminA")
    assert.equal(moved.result.ok, true, JSON.stringify(moved.result))
    const { data: rows } = await service.from("student_enrollments").select("section_id, enrollment_status").eq("student_id", A.loner.id).order("created_at")
    assert.deepEqual(rows, [
      { section_id: A.g6b.id, enrollment_status: "transferred" },
      { section_id: A.g6c.id, enrollment_status: "enrolled" },
    ])
  })

  test("a second open enrollment in the same year gets a friendly error", async () => {
    const { result } = await action("enrollStudent", [null, { student_id: A.student.id, academic_year_id: A.y2026.id, grade_level_id: A.g6.id, enrollment_date: "2026-06-01" }], "adminA")
    assert.equal(result.ok, false)
    assert.match(result.error, /already has an open enrollment/)
  })
})

describe("server actions: accounts and invitations", { skip }, () => {
  test("invite requires an email, then sends a working invitation; revoke removes it", async () => {
    const noEmail = await action("inviteAccount", ["teacher", A.teacher2.id], "adminA")
    assert.match(noEmail.result.error, /Add an email/)

    const email = `act-invite-${RUN}@test.local`.toLowerCase()
    await service.from("teachers").update({ email }).eq("id", A.teacher2.id)
    const sent = await action("inviteAccount", ["teacher", A.teacher2.id], "adminA")
    assert.equal(sent.result.ok, true, JSON.stringify(sent.result))
    const { data: teacher } = await service.from("teachers").select("user_id").eq("id", A.teacher2.id).single()
    assert.ok(teacher.user_id, "record linked to the invited account")
    const mail = await latestEmail(email)
    assert.match(mail.HTML, /type=invite/)

    const again = await action("inviteAccount", ["teacher", A.teacher2.id], "adminA")
    assert.equal(again.result.ok, false, "cannot invite a linked record twice")

    const { data: inv } = await service.from("invitations").select("id").eq("teacher_id", A.teacher2.id).single()
    const revoked = await action("revokeInvitation", [inv.id], "adminA")
    assert.equal(revoked.result.ok, true, JSON.stringify(revoked.result))
    const { data: after } = await service.from("teachers").select("user_id").eq("id", A.teacher2.id).single()
    assert.equal(after.user_id, null, "unused account removed and record unlinked")
    const { data: user } = await service.auth.admin.getUserById(teacher.user_id)
    assert.equal(user.user, null)
  })

  test("link an account that self-registered with the school code", async () => {
    const email = `selfreg-${RUN}@test.local`.toLowerCase()
    const { data } = await anon().auth.signUp({ email, password: PASSWORD, options: { data: { first_name: "Self", last_name: "Reg", school_code: t.schoolA.code, requested_role: "teacher" } } })
    const teacher = (await service.from("teachers").insert({ school_id: t.schoolA.id, first_name: "Self", last_name: "Reg" }).select().single()).data

    const wrongRole = await action("linkAccount", ["teacher", teacher.id, null, { user_id: t.users.parentA.userId }], "adminA")
    assert.match(wrongRole.result.error, /teacher role/)
    const ok = await action("linkAccount", ["teacher", teacher.id, null, { user_id: data.user.id }], "adminA")
    assert.equal(ok.result.ok, true, JSON.stringify(ok.result))
  })
})
