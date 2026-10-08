// Phase 3: academic operations, attacked directly through the Supabase API.
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { anon, buildAcademic, buildStructure, buildTenants, daysAgo, insert, service, signedIn, today } from "./helpers.mjs"

let t, A, B, as

before(async () => {
  t = await buildTenants()
  const S = await buildAcademic(await buildStructure(t))
  A = S.A
  B = S.B
  // Second subject teacher in School A: Jose teaches Science in G6-A.
  A.joseSci = await insert("teacher_subject_assignments", { school_id: t.schoolA.id, academic_year_id: A.y2026.id, teacher_id: A.teacher2.id, subject_id: A.sci.id, section_id: A.g6a.id })
  const entries = await Promise.all(Object.entries(t.users).map(async ([k, u]) => [k, await signedIn(u.email)]))
  as = Object.fromEntries(entries)
})

const ok = (r, label) => assert.equal(r.error, null, `${label}: ${r.error?.code} ${r.error?.message}`)
const fails = async (promise, label) => {
  const r = await promise
  assert.ok(r.error, `${label}: expected an error, got ${JSON.stringify(r.data)}`)
  return r.error
}
const none = async (promise, label) => {
  const r = await promise
  assert.equal(r.error, null, `${label}: ${r.error?.message}`)
  assert.deepEqual(r.data, [], label)
}
const sheet = (...rows) => rows.map(([enrollment, status, remarks]) => ({ enrollment_id: enrollment.id, status, remarks }))

const PHASE3 = ["grading_periods", "grading_scales", "class_schedules", "attendance_sessions", "attendance_records",
  "grade_records", "grade_change_logs", "assignments", "assignment_submissions", "notifications", "audit_logs"]

describe("tenant isolation (Phase 3 tables)", () => {
  test("School A admin cannot read any School B academic data", async () => {
    // Give School B some rows of every kind first.
    ok(await as.teacherB.rpc("save_attendance", { p_section_id: B.g6a.id, p_date: today(), p_records: sheet([B.enr2026, "absent"]) }), "B attendance")
    ok(await as.teacherB.rpc("save_grades", { p_period_id: B.p1.id, p_section_id: B.g6a.id, p_subject_id: B.math.id, p_entries: [{ enrollment_id: B.enr2026.id, score: 88 }] }), "B grade")
    for (const table of PHASE3) {
      await none(as.adminA.from(table).select("id").eq("school_id", t.schoolB.id), table)
    }
  })

  test("anonymous users see nothing", async () => {
    for (const table of PHASE3) {
      const { data } = await anon().from(table).select("id")
      assert.deepEqual(data ?? [], [], table)
    }
  })

  test("school_id cannot be changed on academic records", async () => {
    await fails(as.adminA.from("class_schedules").update({ school_id: t.schoolB.id }).eq("id", A.mathSchedule.id), "move schedule")
  })
})

describe("attendance", () => {
  test("teacher records attendance for an assigned section (one transaction)", async () => {
    const r = await as.teacherA.rpc("save_attendance", { p_section_id: A.g6a.id, p_date: today(), p_records: sheet([A.enr2026, "absent", "Fever"]) })
    ok(r, "save")
    const { data } = await as.teacherA.from("attendance_records").select("status, remarks, recorded_by").eq("attendance_session_id", r.data)
    assert.deepEqual(data, [{ status: "absent", remarks: "Fever", recorded_by: t.users.teacherA.userId }])
  })

  test("adviser can take daily attendance for their advisory section", async () => {
    ok(await as.teacherA.rpc("save_attendance", { p_section_id: A.g6b.id, p_date: today(), p_records: sheet([A.enrSibling, "present"]) }), "adviser of G6-B")
  })

  test("teacher cannot record attendance for an unrelated section or another school", async () => {
    await fails(as.teacherA.rpc("save_attendance", { p_section_id: A.g6c.id, p_date: today(), p_records: sheet([A.enrOther, "present"]) }), "G6-C")
    await fails(as.teacherA.rpc("save_attendance", { p_section_id: B.g6a.id, p_date: today(), p_records: sheet([B.enr2026, "present"]) }), "School B")
  })

  test("a record must use an enrollment of that section", async () => {
    await fails(as.teacherA.rpc("save_attendance", { p_section_id: A.g6a.id, p_date: today(), p_records: sheet([A.enrOther, "present"]) }), "G6-C student in G6-A")
  })

  test("no attendance for future dates or outside the academic year", async () => {
    const future = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10)
    await fails(as.teacherA.rpc("save_attendance", { p_section_id: A.g6a.id, p_date: future, p_records: sheet([A.enr2026, "present"]) }), "future")
    await fails(as.adminA.rpc("save_attendance", { p_section_id: A.g6a.id, p_date: "2026-05-01", p_records: [] }), "before the year")
  })

  test("locked attendance is read-only for teachers but not for admins", async () => {
    const d = daysAgo(1)
    const r = await as.teacherA.rpc("save_attendance", { p_section_id: A.g6a.id, p_date: d, p_records: sheet([A.enr2026, "present"]) })
    ok(r, "create")
    await fails(as.teacherA.from("attendance_sessions").update({ status: "locked" }).eq("id", r.data), "teacher cannot lock")
    ok(await as.adminA.from("attendance_sessions").update({ status: "locked" }).eq("id", r.data).select().single(), "admin locks")
    const err = await fails(as.teacherA.rpc("save_attendance", { p_section_id: A.g6a.id, p_date: d, p_records: sheet([A.enr2026, "late"]) }), "edit locked")
    assert.match(err.message, /locked/)
    ok(await as.adminA.rpc("save_attendance", { p_section_id: A.g6a.id, p_date: d, p_records: sheet([A.enr2026, "late"]) }), "admin override")
  })

  test("the school's edit window is enforced (configurable, not hard-coded)", async () => {
    const old = daysAgo(20)
    const session = await insert("attendance_sessions", { school_id: t.schoolA.id, academic_year_id: A.y2026.id, section_id: A.g6a.id, attendance_date: old })
    await insert("attendance_records", { school_id: t.schoolA.id, academic_year_id: A.y2026.id, section_id: A.g6a.id, attendance_session_id: session.id, student_id: A.student.id, enrollment_id: A.enr2026.id, status: "present" })
    await fails(as.teacherA.rpc("save_attendance", { p_section_id: A.g6a.id, p_date: old, p_records: sheet([A.enr2026, "absent"]) }), "outside 7-day window")
    ok(await as.adminA.from("school_settings").update({ attendance_edit_days: null }).eq("school_id", t.schoolA.id).select().single(), "no limit")
    ok(await as.teacherA.rpc("save_attendance", { p_section_id: A.g6a.id, p_date: old, p_records: sheet([A.enr2026, "absent"]) }), "allowed with no limit")
    await service.from("school_settings").update({ attendance_edit_days: 7 }).eq("school_id", t.schoolA.id)
  })

  test("students and parents see only their own / their children's attendance", async () => {
    const { data: own } = await as.studentA.from("attendance_records").select("student_id")
    assert.ok(own.length > 0 && own.every((r) => r.student_id === A.student.id))
    const { data: kids } = await as.parentA.from("attendance_records").select("student_id")
    assert.ok(kids.length > 0 && kids.every((r) => [A.student.id, A.sibling.id].includes(r.student_id)))
    await none(as.parentA.from("attendance_records").select("id").eq("student_id", B.student.id), "parent A -> student B")
    await none(as.studentA.from("attendance_records").select("id").eq("student_id", A.sibling.id), "student -> sibling")
  })

  test("students and parents cannot record attendance", async () => {
    for (const who of ["studentA", "parentA"]) {
      await fails(as[who].rpc("save_attendance", { p_section_id: A.g6a.id, p_date: today(), p_records: sheet([A.enr2026, "present"]) }), who)
    }
  })

  test("school admin sees the school's attendance; summaries respect RLS", async () => {
    const { data } = await as.adminA.from("attendance_records").select("school_id")
    assert.ok(data.length >= 3 && data.every((r) => r.school_id === t.schoolA.id))
    const { data: summary } = await as.adminA.rpc("attendance_section_summary", { p_section_id: A.g6a.id, p_from: "2026-06-01", p_to: today() })
    const john = summary.find((r) => r.student_id === A.student.id)
    assert.ok(john && john.total >= 3)
    const { data: foreign } = await as.adminB.rpc("attendance_section_summary", { p_section_id: A.g6a.id, p_from: "2026-06-01", p_to: today() })
    assert.deepEqual(foreign, [])
  })

  test("absences notify the guardian; changes are audited", async () => {
    const { data: notes } = await as.parentA.from("notifications").select("type, data").eq("type", "attendance_absent")
    assert.ok(notes.some((n) => n.data.student_id === A.student.id))
    const { data: logs } = await as.adminA.from("audit_logs").select("action").in("action", ["attendance.created", "attendance.modified", "attendance.locked"])
    const actions = new Set(logs.map((l) => l.action))
    assert.ok(actions.has("attendance.created") && actions.has("attendance.modified") && actions.has("attendance.locked"))
  })
})

describe("grades", () => {
  const entry = (score, enr = A.enr2026) => [{ enrollment_id: enr.id, score }]

  test("teacher enters a draft for an assigned subject; students cannot see drafts", async () => {
    const r = await as.teacherA.rpc("save_grades", { p_period_id: A.p1.id, p_section_id: A.g6a.id, p_subject_id: A.math.id, p_entries: entry(91) })
    ok(r, "save")
    assert.deepEqual(r.data, { saved: 1, skipped: 0 })
    await none(as.studentA.from("grade_records").select("id"), "student sees no draft")
    await none(as.parentA.from("grade_records").select("id"), "parent sees no draft")
  })

  test("teacher cannot grade another teacher's subject or another school", async () => {
    await fails(as.teacherA.rpc("save_grades", { p_period_id: A.p1.id, p_section_id: A.g6a.id, p_subject_id: A.sci.id, p_entries: entry(80) }), "Jose's Science")
    await fails(as.teacherA.from("grade_records").insert({ school_id: t.schoolA.id, academic_year_id: A.y2026.id, grading_period_id: A.p1.id, section_id: A.g6a.id, enrollment_id: A.enr2026.id, student_id: A.student.id, subject_id: A.sci.id, teacher_id: A.teacher2.id, score: 50 }), "as Jose")
    await fails(as.teacherA.rpc("save_grades", { p_period_id: B.p1.id, p_section_id: B.g6a.id, p_subject_id: B.math.id, p_entries: entry(80, B.enr2026) }), "School B")
    await fails(as.teacherA.rpc("save_grades", { p_period_id: A.p1.id, p_section_id: A.g6c.id, p_subject_id: A.math.id, p_entries: entry(80, A.enrOther) }), "unassigned section")
  })

  test("teacher cannot see or change another teacher's grades", async () => {
    // Jose (no login) has a Science grade for John; Maria must not see or touch it.
    const jose = await insert("grade_records", { school_id: t.schoolA.id, academic_year_id: A.y2026.id, grading_period_id: A.p1.id, section_id: A.g6a.id, enrollment_id: A.enr2026.id, student_id: A.student.id, subject_id: A.sci.id, teacher_id: A.teacher2.id, score: 77 })
    await none(as.teacherA.from("grade_records").select("id").eq("id", jose.id), "read")
    await none(as.teacherA.from("grade_records").update({ score: 10 }).eq("id", jose.id).select("id"), "update")
    const { data } = await as.teacherA.from("grade_records").select("teacher_id")
    assert.ok(data.every((g) => g.teacher_id === A.teacher.id))
  })

  test("grades only while the period is open, within the school's max score", async () => {
    const err = await fails(as.teacherA.rpc("save_grades", { p_period_id: A.p2.id, p_section_id: A.g6a.id, p_subject_id: A.math.id, p_entries: entry(80) }), "upcoming period")
    assert.match(err.message, /open/)
    await fails(as.teacherA.rpc("save_grades", { p_period_id: A.p1.id, p_section_id: A.g6a.id, p_subject_id: A.math.id, p_entries: entry(101) }), "above max")
  })

  test("students and parents cannot create or modify grades", async () => {
    const row = { school_id: t.schoolA.id, academic_year_id: A.y2026.id, grading_period_id: A.p1.id, section_id: A.g6a.id, enrollment_id: A.enr2026.id, student_id: A.student.id, subject_id: A.math.id, teacher_id: A.teacher.id, score: 100 }
    for (const who of ["studentA", "parentA"]) {
      await fails(as[who].from("grade_records").insert(row), `${who} insert`)
      await none(as[who].from("grade_records").update({ score: 100 }).eq("student_id", A.student.id).select("id"), `${who} update`)
    }
  })

  test("submit -> teacher locked out -> admin approves -> student and parent see it", async () => {
    ok(await as.teacherA.rpc("save_grades", { p_period_id: A.p1.id, p_section_id: A.g6a.id, p_subject_id: A.math.id, p_entries: entry(92), p_submit: true }), "submit")
    const { data: g } = await as.teacherA.from("grade_records").select("id, status, score").eq("enrollment_id", A.enr2026.id).eq("subject_id", A.math.id).single()
    assert.deepEqual([g.status, Number(g.score)], ["submitted", 92])
    const again = await as.teacherA.rpc("save_grades", { p_period_id: A.p1.id, p_section_id: A.g6a.id, p_subject_id: A.math.id, p_entries: entry(99) })
    assert.deepEqual(again.data, { saved: 0, skipped: 1 }, "submitted grade is skipped, not overwritten")
    await fails(as.teacherA.from("grade_records").update({ score: 99 }).eq("id", g.id), "direct teacher edit")

    const { data: count } = await as.adminA.rpc("review_grades", { p_ids: [g.id], p_action: "approve" })
    assert.equal(count, 1)
    const { data: mine } = await as.studentA.from("grade_records").select("score, status")
    assert.deepEqual(mine.map((x) => [Number(x.score), x.status]), [[92, "approved"]])
    const { data: kids } = await as.parentA.from("grade_records").select("student_id")
    assert.deepEqual(kids.map((x) => x.student_id), [A.student.id])
    await none(as.parentB.from("grade_records").select("id").eq("student_id", A.student.id), "parent B")
    await none(as.studentB.from("grade_records").select("id").eq("student_id", A.student.id), "student B")
  })

  test("publishing notifies the student and the parent", async () => {
    for (const who of ["studentA", "parentA"]) {
      const { data } = await as[who].from("notifications").select("type").eq("type", "grade_published")
      assert.ok(data.length >= 1, who)
    }
  })

  test("changes to approved grades need a reason and are preserved in history", async () => {
    const { data: g } = await as.adminA.from("grade_records").select("id").eq("enrollment_id", A.enr2026.id).eq("subject_id", A.math.id).single()
    const err = await fails(as.adminA.from("grade_records").update({ score: 95 }).eq("id", g.id), "no reason")
    assert.match(err.message, /reason/)
    ok(await as.adminA.from("grade_records").update({ score: 95, change_reason: "Recomputed quiz 3" }).eq("id", g.id).select().single(), "with reason")

    const { data: log } = await as.adminA.from("grade_change_logs").select("old_score, new_score, old_status, new_status, reason, changed_by").eq("grade_record_id", g.id).order("changed_at")
    const last = log.at(-1)
    assert.deepEqual([Number(last.old_score), Number(last.new_score), last.reason, last.changed_by], [92, 95, "Recomputed quiz 3", t.users.adminA.userId])
    assert.ok(log.length >= 4, "created, draft->submitted, approved, modified")
    const { data: audit } = await as.adminA.from("audit_logs").select("action").eq("entity_id", g.id)
    const actions = new Set(audit.map((a) => a.action))
    for (const a of ["grade.created", "grade.submitted", "grade.approved", "grade.modified"]) assert.ok(actions.has(a), a)
  })

  test("locking makes a grade final; unlocking needs a reason", async () => {
    const { data: g } = await as.adminA.from("grade_records").select("id").eq("enrollment_id", A.enr2026.id).eq("subject_id", A.math.id).single()
    ok(await as.adminA.rpc("review_grades", { p_ids: [g.id], p_action: "lock" }), "lock")
    await fails(as.adminA.from("grade_records").update({ score: 70, change_reason: "x" }).eq("id", g.id), "edit locked")
    await fails(as.adminA.rpc("review_grades", { p_ids: [g.id], p_action: "unlock" }), "unlock without reason")
    ok(await as.adminA.rpc("review_grades", { p_ids: [g.id], p_action: "unlock", p_reason: "Board correction" }), "unlock")
  })

  test("grade history cannot be rewritten, even with the service key", async () => {
    const { data } = await service.from("grade_change_logs").select("id").limit(1).single()
    await fails(service.from("grade_change_logs").update({ reason: "tampered" }).eq("id", data.id), "update")
    await fails(service.from("grade_change_logs").delete().eq("id", data.id), "delete")
  })

  test("disabling the grades module cuts access for school users", async () => {
    await service.from("school_features").update({ enabled: false }).eq("school_id", t.schoolA.id).eq("feature_key", "grades")
    await none(as.studentA.from("grade_records").select("id"), "student, module off")
    await none(as.teacherA.from("grading_periods").select("id"), "teacher, module off")
    await service.from("school_features").update({ enabled: true }).eq("school_id", t.schoolA.id).eq("feature_key", "grades")
  })
})

describe("schedules", () => {
  const slot = (o) => ({ school_id: t.schoolA.id, academic_year_id: A.y2026.id, section_id: A.g6b.id, subject_id: A.math.id, teacher_id: A.teacher.id, day_of_week: 1, start_time: "08:30", end_time: "09:30", ...o })

  test("a teacher cannot be in two places at once", async () => {
    ok(await as.adminA.from("teacher_subject_assignments").insert({ school_id: t.schoolA.id, academic_year_id: A.y2026.id, teacher_id: A.teacher.id, subject_id: A.math.id, section_id: A.g6b.id }).select().single(), "assign G6-B")
    const err = await fails(as.adminA.from("class_schedules").insert(slot()), "teacher overlap")
    assert.equal(err.code, "23P01")
    assert.match(err.message, /class_schedules_teacher_conflict/)
  })

  test("a section cannot have two classes at once", async () => {
    const err = await fails(as.adminA.from("class_schedules").insert(slot({ section_id: A.g6a.id, subject_id: A.sci.id, teacher_id: A.teacher2.id })), "section overlap")
    assert.match(err.message, /class_schedules_section_conflict/)
  })

  test("back-to-back classes are fine", async () => {
    ok(await as.adminA.from("class_schedules").insert(slot({ start_time: "09:00", end_time: "10:00" })).select().single(), "adjacent")
  })

  test("room conflicts are detected with a useful message, if the school enforces them", async () => {
    ok(await as.adminA.from("class_schedules").insert(slot({ section_id: A.g6b.id, day_of_week: 3, start_time: "08:00", end_time: "09:00", room: "Lab" })).select().single(), "Lab booked")
    const conflict = await fails(as.adminA.from("class_schedules").insert(slot({ section_id: A.g6a.id, subject_id: A.sci.id, teacher_id: A.teacher2.id, day_of_week: 3, start_time: "08:30", end_time: "09:30", room: "lab" })), "room clash")
    assert.match(conflict.message, /Room lab is already booked 08:00 to 09:00/i)
    await service.from("school_settings").update({ enforce_room_conflicts: false }).eq("school_id", t.schoolA.id)
    ok(await as.adminA.from("class_schedules").insert(slot({ section_id: A.g6a.id, subject_id: A.sci.id, teacher_id: A.teacher2.id, day_of_week: 3, start_time: "08:30", end_time: "09:30", room: "lab" })).select().single(), "rooms not enforced")
    await service.from("school_settings").update({ enforce_room_conflicts: true }).eq("school_id", t.schoolA.id)
  })

  test("only assigned teacher/subject/section combinations can be scheduled", async () => {
    await fails(as.adminA.from("class_schedules").insert(slot({ section_id: A.g6c.id, day_of_week: 5 })), "not assigned to G6-C")
    await fails(as.adminA.from("class_schedules").insert(slot({ subject_id: B.math.id, day_of_week: 5 })), "School B subject")
  })

  test("teachers and students see the right schedules", async () => {
    const { data: teacher } = await as.teacherA.from("class_schedules").select("section_id, teacher_id")
    assert.ok(teacher.length >= 2)
    assert.ok(teacher.every((s) => s.teacher_id === A.teacher.id || [A.g6a.id, A.g6b.id].includes(s.section_id)))
    const { data: student } = await as.studentA.from("class_schedules").select("section_id")
    assert.ok(student.length >= 1 && student.every((s) => s.section_id === A.g6a.id))
    await none(as.adminA.from("class_schedules").select("id").eq("school_id", t.schoolB.id), "admin A -> B schedules")
  })
})

describe("coursework and files", () => {
  const file = (text) => new Blob([text], { type: "text/plain" })

  test("teacher creates coursework only for their own classes", async () => {
    const base = { school_id: t.schoolA.id, academic_year_id: A.y2026.id, section_id: A.g6a.id, subject_id: A.math.id, teacher_id: A.teacher.id, title: "Quiz review" }
    ok(await as.teacherA.from("assignments").insert(base).select().single(), "own class")
    await fails(as.teacherA.from("assignments").insert({ ...base, section_id: A.g6c.id }), "unrelated section")
    await fails(as.teacherA.from("assignments").insert({ ...base, subject_id: A.sci.id }), "Jose's subject")
    await fails(as.teacherA.from("assignments").insert({ ...base, school_id: t.schoolB.id, academic_year_id: B.y2026.id, section_id: B.g6a.id, subject_id: B.math.id, teacher_id: B.teacher.id }), "School B")
  })

  test("students and parents see published coursework of their sections only", async () => {
    const draft = await insert("assignments", { school_id: t.schoolA.id, academic_year_id: A.y2026.id, section_id: A.g6a.id, subject_id: A.math.id, teacher_id: A.teacher.id, title: "Unpublished", status: "draft" })
    const { data: s } = await as.studentA.from("assignments").select("id, section_id")
    assert.ok(s.some((a) => a.id === A.homework.id))
    assert.ok(s.every((a) => a.section_id === A.g6a.id) && !s.some((a) => a.id === draft.id))
    const { data: p } = await as.parentA.from("assignments").select("id")
    assert.ok(p.some((a) => a.id === A.homework.id))
    await none(as.studentB.from("assignments").select("id").eq("id", A.homework.id), "student B")
    await none(as.parentB.from("assignments").select("id").eq("id", A.homework.id), "parent B")
  })

  test("new coursework notifies the class", async () => {
    const { data } = await as.studentA.from("notifications").select("type, data").eq("type", "assignment_created")
    assert.ok(data.some((n) => n.data.entity_type === "assignment" && n.data.entity_id === A.homework.id))
  })

  test("submission workflow: own work only, late detection, review locks it", async () => {
    const row = { school_id: t.schoolA.id, academic_year_id: A.y2026.id, section_id: A.g6a.id, assignment_id: A.homework.id, student_id: A.student.id, enrollment_id: A.enr2026.id, content: "My answers" }
    const sub = await as.studentA.from("assignment_submissions").insert({ ...row, status: "reviewed" }).select().single()
    ok(sub, "submit")
    assert.equal(sub.data.status, "submitted", "students cannot self-review")
    await fails(as.studentA.from("assignment_submissions").insert({ ...row, student_id: A.sibling.id, enrollment_id: A.enrSibling.id }), "for a sibling")
    await fails(as.teacherA.from("assignment_submissions").update({ content: "edited by teacher" }).eq("id", sub.data.id), "teacher edits work")
    ok(await as.teacherA.from("assignment_submissions").update({ status: "reviewed" }).eq("id", sub.data.id).select().single(), "review")
    await fails(as.studentA.from("assignment_submissions").update({ content: "changed" }).eq("id", sub.data.id), "after review")
    const { data: parentView } = await as.parentA.from("assignment_submissions").select("status")
    assert.deepEqual(parentView, [{ status: "reviewed" }])
    await none(as.parentB.from("assignment_submissions").select("id"), "parent B")
  })

  test("files are tenant-safe: guessing another school's path fails", async () => {
    const path = `${t.schoolA.id}/assignments/${A.homework.id}/sheet.txt`
    ok(await as.teacherA.storage.from("academic-files").upload(path, file("worksheet")), "teacher uploads")
    const own = await as.studentA.storage.from("academic-files").download(path)
    assert.equal(own.error, null)
    assert.equal(await own.data.text(), "worksheet")
    for (const who of ["studentB", "adminB", "teacherB", "parentB"]) {
      const r = await as[who].storage.from("academic-files").download(path)
      assert.ok(r.error, `${who} must not read School A files`)
    }
    const r2 = await as.studentA.storage.from("academic-files").upload(`${t.schoolA.id}/assignments/${A.homework.id}/hack.txt`, file("x"))
    assert.ok(r2.error, "students cannot upload teacher files")
    const forged = await as.teacherB.storage.from("academic-files").upload(`${t.schoolA.id}/assignments/${A.homework.id}/b.txt`, file("x"))
    assert.ok(forged.error, "School B teacher cannot write into School A")
  })

  test("submission files: own folder only; readable by teacher and parent", async () => {
    const own = `${t.schoolA.id}/submissions/${A.homework.id}/${A.student.id}/answer.txt`
    ok(await as.studentA.storage.from("academic-files").upload(own, file("answer")), "own folder")
    const other = await as.studentA.storage.from("academic-files").upload(`${t.schoolA.id}/submissions/${A.homework.id}/${A.sibling.id}/x.txt`, file("x"))
    assert.ok(other.error, "another student's folder")
    for (const who of ["teacherA", "parentA", "adminA"]) {
      const r = await as[who].storage.from("academic-files").download(own)
      assert.equal(r.error, null, who)
    }
    const r = await as.studentB.storage.from("academic-files").download(own)
    assert.ok(r.error)
  })
})

describe("teacher names for students and parents", () => {
  test("students and parents get only their own teachers' names, no contact data", async () => {
    const ids = [A.teacher.id, A.teacher2.id, B.teacher.id]
    const { data: student } = await as.studentA.rpc("visible_teacher_names", { p_ids: ids })
    assert.deepEqual(student.map((t) => t.id).sort(), [A.teacher.id, A.teacher2.id].sort(), "Maria and Jose teach G6-A")
    assert.deepEqual(Object.keys(student[0]).sort(), ["first_name", "id", "last_name"])
    const { data: parent } = await as.parentA.rpc("visible_teacher_names", { p_ids: ids })
    assert.ok(parent.some((t) => t.id === A.teacher.id) && !parent.some((t) => t.id === B.teacher.id))
    const { data: foreign } = await as.studentB.rpc("visible_teacher_names", { p_ids: [A.teacher.id] })
    assert.deepEqual(foreign, [])
    await none(as.studentA.from("teachers").select("id"), "teachers table itself stays closed")
  })
})

describe("notifications", () => {
  test("users only see notifications addressed to them, within their school", async () => {
    const { data } = await as.parentA.from("notifications").select("recipient_user_id, school_id")
    assert.ok(data.length > 0 && data.every((n) => n.recipient_user_id === t.users.parentA.userId && n.school_id === t.schoolA.id))
    await none(as.adminA.from("notifications").select("id").eq("recipient_user_id", t.users.parentA.userId), "admin cannot read others'")
    await none(as.parentB.from("notifications").select("id").eq("school_id", t.schoolA.id), "other school")
  })

  test("notifications cannot be created or altered by users, only marked read", async () => {
    await fails(as.adminA.from("notifications").insert({ school_id: t.schoolA.id, recipient_user_id: t.users.parentA.userId, type: "system", title: "x", message: "y" }), "insert")
    const { data: n } = await as.parentA.from("notifications").select("id").limit(1).single()
    await fails(as.parentA.from("notifications").update({ title: "changed" }).eq("id", n.id), "change title")
    await none(as.studentA.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id).select("id"), "mark someone else's")
    const { data: count } = await as.parentA.rpc("mark_notifications_read", { p_ids: null })
    assert.ok(count >= 1)
  })
})
