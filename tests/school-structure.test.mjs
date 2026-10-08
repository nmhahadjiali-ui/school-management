// Phase 2: school structure — tenant isolation, integrity, history, relationships, roles.
// Everything here goes straight at the Supabase API (no UI), as an attacker would.
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { anon, buildStructure, buildTenants, insert, service, signedIn } from "./helpers.mjs"

let t, S, A, B, as

before(async () => {
  t = await buildTenants()
  S = await buildStructure(t)
  A = S.A
  B = S.B
  const entries = await Promise.all(Object.entries(t.users).map(async ([k, u]) => [k, await signedIn(u.email)]))
  as = Object.fromEntries(entries)
})

const TABLES = [
  "academic_years", "grade_levels", "subjects", "teachers", "sections", "students", "guardians",
  "student_guardians", "student_enrollments", "teacher_subject_assignments", "invitations",
]
const ids = (rows) => (rows ?? []).map((r) => r.id).sort()
const expectError = async (promise, label) => {
  const { error, data } = await promise
  assert.ok(error, `${label}: expected an error, got ${JSON.stringify(data)}`)
  return error
}
const expectNoRows = async (promise, label) => {
  const { data, error } = await promise
  assert.equal(error, null, `${label}: ${error?.message}`)
  assert.deepEqual(data, [], label)
}

describe("multi-tenancy: School A admin vs School B data", () => {
  for (const table of TABLES) {
    test(`cannot read School B ${table}`, async () => {
      await expectNoRows(as.adminA.from(table).select("id").eq("school_id", t.schoolB.id), table)
      const { data } = await as.adminA.from(table).select("school_id")
      assert.ok(data.every((r) => r.school_id === t.schoolA.id), `${table} leaked other schools`)
    })
  }

  test("School B admin cannot read School A students either", async () => {
    await expectNoRows(as.adminB.from("students").select("id").eq("school_id", t.schoolA.id), "students")
    await expectNoRows(as.adminB.from("students").select("id").eq("id", A.student.id), "by id")
  })

  test("cannot create records in School B", async () => {
    await expectError(as.adminA.from("students").insert({ school_id: t.schoolB.id, student_number: "X-1", first_name: "X", last_name: "Y" }), "student")
    await expectError(as.adminA.from("subjects").insert({ school_id: t.schoolB.id, name: "Hack", code: "HACK" }), "subject")
  })

  test("cannot update School B records (0 rows)", async () => {
    await expectNoRows(as.adminA.from("students").update({ first_name: "Hacked" }).eq("id", B.student.id).select("id"), "student")
    await expectNoRows(as.adminA.from("teachers").update({ first_name: "Hacked" }).eq("id", B.teacher.id).select("id"), "teacher")
    await expectNoRows(as.adminA.from("sections").update({ name: "Z" }).eq("id", B.g6a.id).select("id"), "section")
  })

  test("cannot move a record to another school", async () => {
    await expectError(as.adminA.from("students").update({ school_id: t.schoolB.id }).eq("id", A.other.id), "school_id change")
  })

  test("cannot reference another school's rows (composite foreign keys)", async () => {
    const a = t.schoolA.id
    await expectError(as.adminA.from("student_enrollments").insert({ school_id: a, academic_year_id: A.y2026.id, student_id: B.loner.id, grade_level_id: A.g6.id }), "B student in A enrollment")
    await expectError(as.adminA.from("student_enrollments").insert({ school_id: a, academic_year_id: A.y2026.id, student_id: A.loner.id, grade_level_id: A.g6.id, section_id: B.g6a.id }), "B section")
    await expectError(as.adminA.from("sections").insert({ school_id: a, academic_year_id: A.y2026.id, grade_level_id: A.g6.id, name: "X", adviser_teacher_id: B.teacher.id }), "B adviser")
    await expectError(as.adminA.from("student_guardians").insert({ school_id: a, student_id: A.loner.id, guardian_id: B.guardian2.id, relationship_type: "father" }), "B guardian")
  })

  test("anonymous clients see nothing", async () => {
    for (const table of TABLES) {
      const { data } = await anon().from(table).select("id")
      assert.deepEqual(data ?? [], [], table)
    }
  })
})

describe("data integrity", () => {
  test("student numbers are unique per school, not globally", async () => {
    assert.equal(A.student.student_number, B.student.student_number) // both 2026-0001
    const err = await expectError(as.adminA.from("students").insert({ school_id: t.schoolA.id, student_number: "2026-0001", first_name: "Dup", last_name: "Dup" }), "duplicate")
    assert.equal(err.code, "23505")
  })

  test("employee numbers are unique per school", async () => {
    const err = await expectError(as.adminA.from("teachers").insert({ school_id: t.schoolA.id, employee_number: "emp-001", first_name: "D", last_name: "D" }), "duplicate (case-insensitive)")
    assert.equal(err.code, "23505")
  })

  test("section names are unique per year and grade; codes per year", async () => {
    const err = await expectError(as.adminA.from("sections").insert({ school_id: t.schoolA.id, academic_year_id: A.y2026.id, grade_level_id: A.g6.id, name: "a" }), "dup name")
    assert.equal(err.code, "23505")
    // Same name in another year is fine.
    const ok = await as.adminA.from("sections").insert({ school_id: t.schoolA.id, academic_year_id: A.y2025.id, grade_level_id: A.g6.id, name: "A" }).select().single()
    assert.equal(ok.error, null)
  })

  test("subject codes are unique per school", async () => {
    const err = await expectError(as.adminA.from("subjects").insert({ school_id: t.schoolA.id, name: "Maths 2", code: "math" }), "dup code")
    assert.equal(err.code, "23505")
  })

  test("only one current academic year per school", async () => {
    const err = await expectError(as.adminA.from("academic_years").update({ is_current: true }).eq("id", A.y2025.id), "second current")
    assert.equal(err.code, "23505")
    const { error } = await as.adminA.rpc("set_current_academic_year", { p_year_id: A.y2025.id })
    assert.equal(error, null)
    const { data } = await as.adminA.from("academic_years").select("id").eq("is_current", true)
    assert.deepEqual(ids(data), [A.y2025.id])
    await as.adminA.rpc("set_current_academic_year", { p_year_id: A.y2026.id })
  })

  test("a current year must be active; dates must be ordered", async () => {
    await expectError(as.adminA.from("academic_years").insert({ school_id: t.schoolA.id, name: "Bad", start_date: "2030-06-01", end_date: "2030-01-01" }), "dates")
    await expectError(as.adminA.from("academic_years").update({ status: "planned" }).eq("id", A.y2026.id), "current must be active")
  })

  test("an enrollment's section must match its academic year and grade level", async () => {
    // G5-A belongs to 2025-2026 / Grade 5.
    await expectError(as.adminA.from("student_enrollments").insert({ school_id: t.schoolA.id, academic_year_id: A.y2026.id, student_id: A.loner.id, grade_level_id: A.g6.id, section_id: A.g5a.id }), "wrong year/grade")
  })

  test("account links must match school and role", async () => {
    // A School B teacher account cannot be linked to a School A record...
    await expectError(as.adminA.from("teachers").update({ user_id: t.users.teacherB.userId }).eq("id", A.teacher2.id), "other school")
    // ...nor a student account to a teacher record.
    await expectError(as.adminA.from("teachers").update({ user_id: t.users.studentA.userId }).eq("id", A.teacher2.id), "wrong role")
  })

  test("a linked account's role cannot be changed", async () => {
    await expectError(as.adminA.from("profiles").update({ role: "parent" }).eq("id", t.users.teacherA.profile.id), "linked role change")
  })

  test("records cannot be deleted through the API", async () => {
    for (const [table, id] of [["students", A.loner.id], ["teachers", A.teacher2.id], ["academic_years", A.y2025.id], ["sections", A.g6c.id]]) {
      const { data } = await as.adminA.from(table).delete().eq("id", id).select()
      assert.ok(!data?.length, table)
    }
  })
})

describe("student history", () => {
  test("a student keeps separate enrollments across academic years", async () => {
    const { data } = await as.adminA.from("student_enrollments").select("academic_year_id, grade_level_id, section_id").eq("student_id", A.student.id).order("enrollment_date")
    assert.deepEqual(data, [
      { academic_year_id: A.y2025.id, grade_level_id: A.g5.id, section_id: A.g5a.id },
      { academic_year_id: A.y2026.id, grade_level_id: A.g6.id, section_id: A.g6a.id },
    ])
  })

  test("only one open enrollment per student per year", async () => {
    const err = await expectError(as.adminA.from("student_enrollments").insert({ school_id: t.schoolA.id, academic_year_id: A.y2026.id, student_id: A.student.id, grade_level_id: A.g6.id }), "second open")
    assert.equal(err.code, "23505")
  })

  test("an enrollment's student, year and grade cannot be rewritten", async () => {
    await expectError(as.adminA.from("student_enrollments").update({ grade_level_id: A.g5.id }).eq("id", A.enr2026.id), "grade change")
    await expectError(as.adminA.from("student_enrollments").update({ section_id: A.g6b.id }).eq("id", A.enr2026.id), "section move without transfer")
  })

  test("a section move is a transfer that keeps the old row", async () => {
    const enr = await insert("student_enrollments", { school_id: t.schoolA.id, academic_year_id: A.y2026.id, student_id: A.loner.id, grade_level_id: A.g6.id, enrollment_date: "2026-06-01" })
    // Unsectioned -> first section is allowed.
    const first = await as.adminA.from("student_enrollments").update({ section_id: A.g6b.id }).eq("id", enr.id).select().single()
    assert.equal(first.error, null)
    const { data: newId, error } = await as.adminA.rpc("transfer_enrollment", { p_enrollment_id: enr.id, p_grade_level_id: A.g6.id, p_section_id: A.g6c.id, p_effective_date: "2026-09-01" })
    assert.equal(error, null)
    const { data: rows } = await as.adminA.from("student_enrollments").select("id, section_id, enrollment_status, exit_date").eq("student_id", A.loner.id).order("created_at")
    assert.equal(rows.length, 2)
    assert.deepEqual(rows[0], { id: enr.id, section_id: A.g6b.id, enrollment_status: "transferred", exit_date: "2026-09-01" })
    assert.equal(rows[1].id, newId)
    assert.equal(rows[1].section_id, A.g6c.id)
    assert.equal(rows[1].enrollment_status, "enrolled")
    // The closed row is now immutable.
    await expectError(as.adminA.from("student_enrollments").update({ enrollment_status: "enrolled", exit_date: null }).eq("id", enr.id), "reopen")
  })

  test("section capacity is enforced", async () => {
    const small = await insert("sections", { school_id: t.schoolA.id, academic_year_id: A.y2026.id, grade_level_id: A.g5.id, name: "Tiny", capacity: 1 })
    const s1 = await insert("students", { school_id: t.schoolA.id, student_number: "CAP-1", first_name: "C", last_name: "One" })
    const s2 = await insert("students", { school_id: t.schoolA.id, student_number: "CAP-2", first_name: "C", last_name: "Two" })
    const ok = await as.adminA.from("student_enrollments").insert({ school_id: t.schoolA.id, academic_year_id: A.y2026.id, student_id: s1.id, grade_level_id: A.g5.id, section_id: small.id }).select().single()
    assert.equal(ok.error, null)
    await expectError(as.adminA.from("student_enrollments").insert({ school_id: t.schoolA.id, academic_year_id: A.y2026.id, student_id: s2.id, grade_level_id: A.g5.id, section_id: small.id }), "over capacity")
  })

  test("archiving a year closes its enrollments and freezes it", async () => {
    const { error } = await as.adminA.rpc("archive_academic_year", { p_year_id: A.y2025.id })
    assert.equal(error, null)
    const { data: enr } = await as.adminA.from("student_enrollments").select("enrollment_status, exit_date").eq("id", A.enr2025.id).single()
    assert.equal(enr.enrollment_status, "completed")
    assert.ok(enr.exit_date)
    await expectError(as.adminA.from("student_enrollments").insert({ school_id: t.schoolA.id, academic_year_id: A.y2025.id, student_id: A.loner.id, grade_level_id: A.g5.id }), "enroll into archived")
    await expectError(as.adminA.from("sections").update({ room: "101" }).eq("id", A.g5a.id), "edit archived section")
    // History is still readable.
    const { data: hist } = await as.adminA.from("student_enrollments").select("id").eq("student_id", A.student.id)
    assert.equal(hist.length, 2)
  })
})

describe("parent relationships", () => {
  test("one guardian can have several children", async () => {
    const { data } = await as.adminA.from("student_guardians").select("student_id").eq("guardian_id", A.guardian.id)
    assert.deepEqual(data.map((r) => r.student_id).sort(), [A.student.id, A.sibling.id].sort())
  })

  test("one student can have several guardians, but only one primary", async () => {
    const { data } = await as.adminA.from("student_guardians").select("guardian_id").eq("student_id", A.student.id)
    assert.equal(data.length, 2)
    const err = await expectError(as.adminA.from("student_guardians").update({ is_primary: true }).eq("id", A.link3.id), "second primary")
    assert.equal(err.code, "23505")
  })

  test("a parent sees exactly their children", async () => {
    const { data } = await as.parentA.from("students").select("id")
    assert.deepEqual(ids(data), [A.student.id, A.sibling.id].sort())
  })

  test("a parent sees their children's enrollments and sections only", async () => {
    const { data: enr } = await as.parentA.from("student_enrollments").select("student_id")
    assert.ok(enr.length >= 3 && enr.every((e) => [A.student.id, A.sibling.id].includes(e.student_id)))
    const { data: sec } = await as.parentA.from("sections").select("id")
    assert.ok(!ids(sec).includes(A.g6c.id))
  })

  test("a parent cannot see other students, other guardians, or another school", async () => {
    await expectNoRows(as.parentA.from("students").select("id").eq("id", A.other.id), "unrelated student")
    await expectNoRows(as.parentA.from("students").select("id").eq("school_id", t.schoolB.id), "school B")
    const { data } = await as.parentA.from("guardians").select("id")
    assert.deepEqual(ids(data), [A.guardian.id])
  })

  test("a parent cannot link themselves to another child", async () => {
    await expectError(as.parentA.from("student_guardians").insert({ school_id: t.schoolA.id, student_id: A.other.id, guardian_id: A.guardian.id, relationship_type: "mother" }), "self-link")
  })
})

describe("teacher assignments", () => {
  test("a teacher can have several assignments", async () => {
    const extra = await as.adminA.from("teacher_subject_assignments").insert([
      { school_id: t.schoolA.id, academic_year_id: A.y2026.id, teacher_id: A.teacher.id, subject_id: A.math.id, section_id: A.g6b.id },
      { school_id: t.schoolA.id, academic_year_id: A.y2026.id, teacher_id: A.teacher.id, subject_id: A.sci.id, section_id: A.g6b.id },
    ]).select()
    assert.equal(extra.error, null)
    const { data } = await as.teacherA.from("teacher_subject_assignments").select("id")
    assert.equal(data.length, 3)
  })

  test("assignments cannot reference another school's subject, section or teacher", async () => {
    const base = { school_id: t.schoolA.id, academic_year_id: A.y2026.id, teacher_id: A.teacher.id, subject_id: A.sci.id, section_id: A.g6a.id }
    await expectError(as.adminA.from("teacher_subject_assignments").insert({ ...base, subject_id: B.sci.id }), "B subject")
    await expectError(as.adminA.from("teacher_subject_assignments").insert({ ...base, section_id: B.g6a.id }), "B section")
    await expectError(as.adminA.from("teacher_subject_assignments").insert({ ...base, teacher_id: B.teacher.id }), "B teacher")
    await expectError(as.adminA.from("teacher_subject_assignments").insert({ ...base, school_id: t.schoolB.id, teacher_id: B.teacher.id, subject_id: B.sci.id, section_id: B.g6a.id, academic_year_id: B.y2026.id }), "write into B")
  })

  test("an assignment's section must be in the assignment's academic year", async () => {
    await expectError(as.adminA.from("teacher_subject_assignments").insert({ school_id: t.schoolA.id, academic_year_id: A.y2025.id, teacher_id: A.teacher.id, subject_id: A.sci.id, section_id: A.g6a.id }), "year mismatch")
  })

  test("a teacher sees their sections and those sections' students only", async () => {
    const { data: sections } = await as.teacherA.from("sections").select("id")
    assert.deepEqual(ids(sections), [A.g6a.id, A.g6b.id].sort())
    const { data: students } = await as.teacherA.from("students").select("id")
    assert.ok(ids(students).includes(A.student.id) && ids(students).includes(A.sibling.id))
    assert.ok(!ids(students).includes(A.other.id), "student of an unrelated section")
    await expectNoRows(as.teacherA.from("students").select("id").eq("school_id", t.schoolB.id), "school B")
  })

  test("a teacher cannot see guardians, other teachers, or write anything", async () => {
    await expectNoRows(as.teacherA.from("guardians").select("id"), "guardians")
    const { data } = await as.teacherA.from("teachers").select("id")
    assert.deepEqual(ids(data), [A.teacher.id])
    await expectNoRows(as.teacherA.from("students").update({ first_name: "X" }).eq("id", A.student.id).select("id"), "edit student")
    await expectError(as.teacherA.from("teacher_subject_assignments").insert({ school_id: t.schoolA.id, academic_year_id: A.y2026.id, teacher_id: A.teacher.id, subject_id: A.sci.id, section_id: A.g6c.id }), "self-assign")
  })

  test("a teacher whose record is no longer active loses access", async () => {
    await service.from("teachers").update({ status: "resigned" }).eq("id", A.teacher.id)
    await expectNoRows(as.teacherA.from("students").select("id"), "students after resigning")
    await service.from("teachers").update({ status: "active" }).eq("id", A.teacher.id)
  })
})

describe("roles on school records", () => {
  test("super admin can read and manage every school's records", async () => {
    const { data } = await as.super.from("students").select("school_id").in("school_id", [t.schoolA.id, t.schoolB.id])
    assert.ok(data.some((r) => r.school_id === t.schoolA.id) && data.some((r) => r.school_id === t.schoolB.id))
    const { error } = await as.super.from("subjects").insert({ school_id: t.schoolB.id, name: "Music", code: "MUS" }).select().single()
    assert.equal(error, null)
  })

  test("school admin can create and edit every record type in their school", async () => {
    const a = t.schoolA.id
    const rec = async (table, row) => {
      const r = await as.adminA.from(table).insert(row).select().single()
      assert.equal(r.error, null, `${table}: ${r.error?.message}`)
      return r.data
    }
    const y = await rec("academic_years", { school_id: a, name: "2027-2028", start_date: "2027-06-01", end_date: "2028-03-31" })
    const g = await rec("grade_levels", { school_id: a, name: "Nursery", code: "NUR", sort_order: -2 })
    const sub = await rec("subjects", { school_id: a, name: "Filipino", code: "FIL" })
    const tch = await rec("teachers", { school_id: a, first_name: "New", last_name: "Teacher" })
    const sec = await rec("sections", { school_id: a, academic_year_id: y.id, grade_level_id: g.id, name: "Sampaguita", adviser_teacher_id: tch.id, capacity: 30 })
    const stu = await rec("students", { school_id: a, student_number: "2027-0001", first_name: "New", last_name: "Student", gender: "female" })
    const gua = await rec("guardians", { school_id: a, first_name: "New", last_name: "Guardian" })
    await rec("student_guardians", { school_id: a, student_id: stu.id, guardian_id: gua.id, relationship_type: "grandparent", can_pickup: true })
    await rec("student_enrollments", { school_id: a, academic_year_id: y.id, student_id: stu.id, grade_level_id: g.id, section_id: sec.id })
    await rec("teacher_subject_assignments", { school_id: a, academic_year_id: y.id, teacher_id: tch.id, subject_id: sub.id, section_id: sec.id })
    const upd = await as.adminA.from("students").update({ status: "transferred" }).eq("id", stu.id).select().single()
    assert.equal(upd.error, null)
  })

  test("a student sees their own record, enrollments and sections only", async () => {
    const { data: st } = await as.studentA.from("students").select("id")
    assert.deepEqual(ids(st), [A.student.id])
    const { data: enr } = await as.studentA.from("student_enrollments").select("student_id")
    assert.ok(enr.length >= 2 && enr.every((e) => e.student_id === A.student.id))
    await expectNoRows(as.studentA.from("guardians").select("id"), "guardians")
    await expectNoRows(as.studentA.from("teachers").select("id"), "teachers")
  })

  test("teachers, students and parents cannot create school records", async () => {
    for (const who of ["teacherA", "studentA", "parentA"]) {
      await expectError(as[who].from("students").insert({ school_id: t.schoolA.id, student_number: `R-${who}`, first_name: "R", last_name: "R" }), who)
      await expectError(as[who].from("subjects").insert({ school_id: t.schoolA.id, name: `R ${who}`, code: `R${who.length}` }), who)
    }
  })

  test("reference data is readable by school members, not by other schools", async () => {
    const { data } = await as.studentA.from("subjects").select("school_id")
    assert.ok(data.length >= 2 && data.every((r) => r.school_id === t.schoolA.id))
    await expectNoRows(as.studentB.from("grade_levels").select("id").eq("school_id", t.schoolA.id), "B student reading A grades")
  })

  test("get_my_context exposes the current year and the linked record", async () => {
    const { data } = await as.teacherA.rpc("get_my_context")
    assert.equal(data.current_academic_year.id, A.y2026.id)
    assert.deepEqual(data.record, { type: "teacher", id: A.teacher.id })
    const { data: p } = await as.parentA.rpc("get_my_context")
    assert.deepEqual(p.record, { type: "guardian", id: A.guardian.id })
  })
})
