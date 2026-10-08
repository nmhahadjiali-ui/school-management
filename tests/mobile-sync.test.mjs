// Phase 6: offline attendance sync as the mobile app calls it (same API,
// same RLS as the web). Idempotent replays, conflict detection, server-side
// authorization, and isolation of operation receipts.
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { anon, buildAcademic, buildStructure, buildTenants, service, signedIn } from "./helpers.mjs"

let t, A, B, as
const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)

before(async () => {
  t = await buildTenants()
  const S = await buildAcademic(await buildStructure(t))
  A = S.A
  B = S.B
  as = Object.fromEntries(await Promise.all(["teacherA", "teacherB", "adminA", "parentA", "studentA"].map(async (k) => [k, await signedIn(t.users[k].email)])))
})

const rec = (enr, status, base = null, remarks = null) => ({ enrollment_id: enr.id, student_id: enr.student_id, status, remarks, base_updated_at: base })
const sync = (who, records, opts = {}) =>
  as[who].rpc("sync_attendance", {
    p_op_id: opts.op ?? crypto.randomUUID(), p_section_id: opts.section ?? A.g6a.id, p_date: opts.date ?? day(1), p_records: records,
  })
const ok = (r, label) => {
  assert.equal(r.error, null, `${label}: ${r.error?.code} ${r.error?.message}`)
  return r.data
}

describe("offline attendance sync", () => {
  test("an offline sheet is saved through the same rules as the web", async () => {
    const r = ok(await sync("teacherA", [rec(A.enr2026, "absent", null, "Fever")], { date: day(1) }), "sync")
    assert.deepEqual([r.applied, r.conflicts.length, r.duplicate], [1, 0, false])
    assert.equal(r.records[0].status, "absent")
    const { data } = await service.from("attendance_records").select("status, remarks, recorded_by").eq("attendance_session_id", r.session_id).single()
    assert.deepEqual([data.status, data.remarks, data.recorded_by], ["absent", "Fever", t.users.teacherA.userId])
  })

  test("replaying the same operation does not write twice", async () => {
    const op = crypto.randomUUID()
    const first = ok(await sync("teacherA", [rec(A.enr2026, "late")], { op, date: day(2) }), "first")
    // The admin changes it in between; a blind replay must NOT overwrite that.
    ok(await as.adminA.rpc("save_attendance", { p_section_id: A.g6a.id, p_date: day(2), p_records: [{ enrollment_id: A.enr2026.id, status: "excused" }] }), "admin edit")
    const again = ok(await sync("teacherA", [rec(A.enr2026, "late")], { op, date: day(2) }), "replay")
    assert.equal(again.duplicate, true)
    assert.equal(again.session_id, first.session_id)
    const { data } = await service.from("attendance_records").select("status").eq("attendance_session_id", first.session_id).single()
    assert.equal(data.status, "excused", "the replay changed nothing")
  })

  test("a record changed elsewhere is reported as a conflict, not overwritten", async () => {
    const d = day(3)
    const mine = ok(await sync("teacherA", [rec(A.enr2026, "present")], { date: d }), "initial")
    const base = mine.records[0].updated_at
    // Someone else (the admin) changes it while the teacher's phone is offline.
    ok(await as.adminA.rpc("save_attendance", { p_section_id: A.g6a.id, p_date: d, p_records: [{ enrollment_id: A.enr2026.id, status: "absent", remarks: "Called in" }] }), "admin edit")
    const offline = ok(await sync("teacherA", [rec(A.enr2026, "late", base)], { date: d }), "offline edit")
    assert.equal(offline.applied, 0)
    assert.equal(offline.conflicts.length, 1)
    assert.deepEqual([offline.conflicts[0].server_status, offline.conflicts[0].local_status], ["absent", "late"])
    const { data } = await service.from("attendance_records").select("status, updated_at").eq("attendance_session_id", mine.session_id).single()
    assert.equal(data.status, "absent", "server value kept")
    // The teacher reviews and decides to keep theirs: resend against the server version.
    const resolved = ok(await sync("teacherA", [rec(A.enr2026, "late", offline.conflicts[0].server_updated_at)], { date: d }), "keep mine")
    assert.deepEqual([resolved.applied, resolved.conflicts.length], [1, 0])
  })

  test("no conflict when nobody else changed the record, or both chose the same value", async () => {
    const d = day(4)
    const first = ok(await sync("teacherA", [rec(A.enr2026, "present")], { date: d }), "first")
    const edit = ok(await sync("teacherA", [rec(A.enr2026, "absent", first.records[0].updated_at)], { date: d }), "own edit")
    assert.equal(edit.conflicts.length, 0)
    const same = ok(await sync("teacherA", [rec(A.enr2026, "absent", null)], { date: d }), "same value, stale copy")
    assert.equal(same.conflicts.length, 0)
  })

  test("offline data cannot bypass authorization", async () => {
    const bad = async (who, records, opts, label) => {
      const r = await sync(who, records, opts)
      assert.ok(r.error, `${label}: expected refusal, got ${JSON.stringify(r.data)}`)
    }
    await bad("teacherA", [rec(A.enrOther, "present")], { section: A.g6c.id }, "a section the teacher does not teach")
    await bad("teacherA", [rec(B.enr2026, "present")], { section: B.g6a.id }, "another school")
    await bad("teacherA", [rec(B.enr2026, "present")], { section: A.g6a.id }, "another school's student in own section")
    await bad("parentA", [rec(A.enr2026, "present")], {}, "parent")
    await bad("studentA", [rec(A.enr2026, "present")], {}, "student")
    await bad("teacherA", [rec(A.enr2026, "asleep")], {}, "invalid status")
    await bad("teacherA", [rec(A.enr2026, "present")], { date: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10) }, "future date")
    const { error } = await anon().rpc("sync_attendance", { p_op_id: crypto.randomUUID(), p_section_id: A.g6a.id, p_date: day(1), p_records: [] })
    assert.ok(error, "signed out")
  })

  test("operation ids are private to their user", async () => {
    const op = crypto.randomUUID()
    ok(await sync("teacherA", [rec(A.enr2026, "present")], { op, date: day(5) }), "teacher A")
    const r = await as.teacherB.rpc("sync_attendance", { p_op_id: op, p_section_id: B.g6a.id, p_date: day(5), p_records: [rec(B.enr2026, "present")] })
    assert.ok(r.error, "teacher B cannot reuse (or read) teacher A's operation")
    const { data } = await as.teacherB.from("client_operations").select("id")
    assert.deepEqual(data, [], "receipts are visible only to their owner")
    const { error } = await as.teacherA.from("client_operations").insert({ id: crypto.randomUUID(), user_id: t.users.teacherA.userId, school_id: t.schoolA.id, kind: "attendance", result: {} })
    assert.ok(error, "receipts cannot be forged through the API")
  })
})

describe("devices (push foundation)", () => {
  test("a device registers, refreshes its token, and is removed on sign-out", async () => {
    const token = `fcm-${crypto.randomUUID()}`
    const id = ok(await as.teacherA.rpc("register_device", { p_push_token: token, p_device_type: "android", p_app_version: "1.0.0" }), "register")
    const again = ok(await as.teacherA.rpc("register_device", { p_push_token: token, p_device_type: "android", p_app_version: "1.0.1" }), "refresh")
    assert.equal(again, id, "same device row")
    const second = ok(await as.teacherA.rpc("register_device", { p_push_token: `fcm-${crypto.randomUUID()}`, p_device_type: "android" }), "second device")
    assert.notEqual(second, id)
    const { data: others } = await as.parentA.from("user_devices").select("push_token")
    assert.ok(!others.some((d) => d.push_token === token), "other users never see the token")
    const del = await as.teacherA.from("user_devices").delete().eq("push_token", token).select("id")
    assert.equal(del.data.length, 1)
  })
})
