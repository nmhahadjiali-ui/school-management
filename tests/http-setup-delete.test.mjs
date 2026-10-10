// Deleting school setup records (academic years, grade levels, sections,
// subjects, grading periods): school admins only, own school only, with
// password confirmation; records in use are refused with an explanation.
// Needs a running production build: set TEST_APP_URL.
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { APP_URL, PASSWORD, buildStructure, buildTenants, callAction, insert, service, sessionCookie, signedIn } from "./helpers.mjs"

const skip = APP_URL ? false : "TEST_APP_URL not set (start the app to run HTTP tests)"
let t, A, B, cookie

before(async () => {
  if (skip) return
  t = await buildTenants()
  const S = await buildStructure(t)
  A = S.A
  B = S.B
  const entries = await Promise.all(["adminA", "adminB", "teacherA"].map(async (k) => [k, await sessionCookie(t.users[k].email)]))
  cookie = Object.fromEntries(entries)
})

const del = async (who, kind, id, password = PASSWORD) => (await callAction("deleteSetupRecord", [kind, id, password], cookie[who], "/sections")).result
const exists = async (table, id) => Boolean((await service.from(table).select("id").eq("id", id).maybeSingle()).data)
const n = () => `${Date.now() % 1e7}${Math.floor(Math.random() * 1000)}`

describe("delete school setup records", { skip }, () => {
  test("unused records are deleted with the admin's password, and audit-logged", async () => {
    const subject = await insert("subjects", { school_id: t.schoolA.id, name: `Temp subject ${n()}`, code: `T${n()}` })
    const grade = await insert("grade_levels", { school_id: t.schoolA.id, name: `Temp grade ${n()}`, code: `G${n()}`, sort_order: 99 })
    const section = await insert("sections", { school_id: t.schoolA.id, academic_year_id: A.y2026.id, grade_level_id: grade.id, name: "Z" })
    const year = await insert("academic_years", { school_id: t.schoolA.id, name: `Temp ${n()}`, start_date: "2031-06-01", end_date: "2032-03-31", status: "planned" })
    const period = await insert("grading_periods", { school_id: t.schoolA.id, academic_year_id: A.y2026.id, name: `Temp Q ${n()}`, code: `Q${n()}`, sequence: 9, start_date: "2026-06-01", end_date: "2026-08-31" })

    for (const [kind, table, row] of [["section", "sections", section], ["grade_level", "grade_levels", grade], ["subject", "subjects", subject], ["academic_year", "academic_years", year], ["grading_period", "grading_periods", period]]) {
      const r = await del("adminA", kind, row.id)
      assert.equal(r?.ok, true, `${kind}: ${r?.error}`)
      assert.equal(await exists(table, row.id), false, kind)
      const { data: log } = await service.from("audit_logs").select("action, actor_user_id, metadata").eq("entity_id", row.id).single()
      assert.equal(log.action, `${table}.deleted`)
      assert.equal(log.actor_user_id, t.users.adminA.userId)
      assert.equal(log.metadata.name, row.name)
    }
  })

  test("a wrong password deletes nothing", async () => {
    const subject = await insert("subjects", { school_id: t.schoolA.id, name: `Keep ${n()}`, code: `K${n()}` })
    const r = await del("adminA", "subject", subject.id, "Wrong-pass-999")
    assert.equal(r.ok, false)
    assert.match(r.error, /password is not correct/)
    assert.equal(await exists("subjects", subject.id), true)
    const empty = await del("adminA", "subject", subject.id, "")
    assert.equal(empty.ok, false)
    assert.equal(await exists("subjects", subject.id), true)
  })

  test("after 5 wrong passwords even the right one is refused for a while", async () => {
    const subject = await insert("subjects", { school_id: t.schoolB.id, name: `Locked ${n()}`, code: `L${n()}` })
    for (let i = 0; i < 5; i++) assert.equal((await del("adminB", "subject", subject.id, `Nope-${i}-123`)).ok, false)
    const r = await del("adminB", "subject", subject.id)
    assert.equal(r.ok, false)
    assert.match(r.error, /Too many incorrect passwords/)
    assert.equal(await exists("subjects", subject.id), true)
  })

  test("records in use are refused, saying what uses them", async () => {
    // Section with a teaching load; subject used by it; grade level used by sections.
    await insert("teacher_subject_assignments", { school_id: t.schoolA.id, academic_year_id: A.y2026.id, teacher_id: A.teacher.id, subject_id: A.sci.id, section_id: A.g6c.id })
    const section = await del("adminA", "section", A.g6c.id)
    assert.equal(section.ok, false)
    assert.match(section.error, /used by .*1 teaching load/)
    assert.match(section.error, /Deactivate it instead/)
    assert.equal(await exists("sections", A.g6c.id), true)

    const grade = await del("adminA", "grade_level", A.g6.id)
    assert.match(grade.error, /used by 3 sections/)
    assert.equal(await exists("grade_levels", A.g6.id), true)

    const subject = await del("adminA", "subject", A.sci.id)
    assert.match(subject.error, /teaching load/)
    assert.equal(await exists("subjects", A.sci.id), true)
  })

  test("the current academic year cannot be deleted", async () => {
    const r = await del("adminA", "academic_year", A.y2026.id)
    assert.equal(r.ok, false)
    assert.equal(await exists("academic_years", A.y2026.id), true)
    // The database refuses too, even for an otherwise unused current year.
    const lone = await signedIn(t.users.adminB.email)
    const year = await insert("academic_years", { school_id: t.schoolB.id, name: `Cur ${n()}`, start_date: "2040-06-01", end_date: "2041-03-31", status: "active" })
    const must = async (q) => assert.equal((await q).error, null)
    await must(service.from("academic_years").update({ is_current: false }).eq("id", B.y2026.id))
    await must(service.from("academic_years").update({ is_current: true }).eq("id", year.id))
    const direct = await lone.from("academic_years").delete().eq("id", year.id).select("id")
    assert.equal(direct.error?.code, "P0001")
    assert.equal(await exists("academic_years", year.id), true)
    await must(service.from("academic_years").update({ is_current: false }).eq("id", year.id))
    await must(service.from("academic_years").update({ is_current: true }).eq("id", B.y2026.id))
  })

  test("other schools' records and non-admins are refused", async () => {
    const theirs = await insert("subjects", { school_id: t.schoolB.id, name: `Theirs ${n()}`, code: `X${n()}` })
    const r = await del("adminA", "subject", theirs.id)
    assert.equal(r.ok, false)
    assert.equal(await exists("subjects", theirs.id), true)

    const mine = await insert("subjects", { school_id: t.schoolA.id, name: `Mine ${n()}`, code: `M${n()}` })
    const teacher = await del("teacherA", "subject", mine.id)
    assert.equal(teacher.ok, false)
    assert.match(teacher.error, /permission/)
    assert.equal(await exists("subjects", mine.id), true)

    // Directly through the API (RLS): a teacher deletes nothing.
    const asTeacher = await signedIn(t.users.teacherA.email)
    const { data } = await asTeacher.from("subjects").delete().eq("id", mine.id).select("id")
    assert.equal(data?.length ?? 0, 0)
    assert.equal(await exists("subjects", mine.id), true)
  })
})
