// Phase 4: communication. Attacked directly through the Supabase API.
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { anon, buildAcademic, buildStructure, buildTenants, insert, service, signedIn, today } from "./helpers.mjs"

let t, A, B, as

before(async () => {
  t = await buildTenants()
  const S = await buildAcademic(await buildStructure(t))
  A = S.A
  B = S.B
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
const setChannels = (school, settings, features = {}) =>
  Promise.all([
    service.from("school_settings").update(settings).eq("school_id", school),
    ...Object.entries(features).map(([k, v]) => service.from("school_features").update({ enabled: v }).eq("school_id", school).eq("feature_key", k)),
  ])
/** Create, target and publish an announcement as `who`; returns its id. */
async function announce(who, school, targets, extra = {}) {
  const a = await as[who].from("announcements").insert({ school_id: school, title: extra.title ?? "Notice", content: "Body", ...extra }).select().single()
  ok(a, "create announcement")
  const tg = await as[who].from("announcement_targets").insert(targets.map((x) => ({ school_id: school, announcement_id: a.data.id, ...x })))
  ok(tg, "targets")
  const p = await as[who].rpc("publish_announcement", { p_id: a.data.id })
  ok(p, "publish")
  return a.data.id
}
const visibleTo = async (who, id) => ((await as[who].from("announcements").select("id").eq("id", id)).data ?? []).length === 1
const notifiedOf = async (who, id) => ((await as[who].from("notifications").select("id").eq("data->>entity_id", id)).data ?? []).length

const PHASE4 = ["notification_preferences", "announcements", "announcement_targets", "notification_deliveries", "sms_usage", "user_devices", "notifications"]

describe("announcement targeting", () => {
  test("school admin can address the entire school", async () => {
    const id = await announce("adminA", t.schoolA.id, [{ target_type: "school", target_id: t.schoolA.id }], { title: "Whole school" })
    for (const who of ["teacherA", "studentA", "parentA", "adminA"]) {
      assert.ok(await visibleTo(who, id), `${who} sees it`)
      assert.equal(await notifiedOf(who, id), 1, `${who} notified exactly once`)
    }
    for (const who of ["teacherB", "studentB", "parentB", "adminB"]) assert.equal(await visibleTo(who, id), false, `${who} must not`)
  })

  test("roles narrow a target (parents only)", async () => {
    const id = await announce("adminA", t.schoolA.id, [{ target_type: "school", target_id: t.schoolA.id, roles: ["parent"] }])
    assert.ok(await visibleTo("parentA", id))
    for (const who of ["teacherA", "studentA"]) assert.equal(await visibleTo(who, id), false, who)
  })

  test("a section target reaches exactly that section's students, parents and teachers", async () => {
    // G6-A: John (studentA) + his parent; Maria teaches MATH there. G6-C: Mark (no accounts).
    const id = await announce("adminA", t.schoolA.id, [{ target_type: "section", target_id: A.g6a.id }])
    for (const who of ["studentA", "parentA", "teacherA"]) assert.ok(await visibleTo(who, id), who)
    const other = await announce("adminA", t.schoolA.id, [{ target_type: "section", target_id: A.g6c.id }])
    for (const who of ["studentA", "parentA", "teacherA"]) assert.equal(await visibleTo(who, other), false, `${who} not in G6-C`)
  })

  test("a grade-level target reaches the grade's current sections", async () => {
    const g6 = await announce("adminA", t.schoolA.id, [{ target_type: "grade_level", target_id: A.g6.id, roles: ["student"] }])
    assert.ok(await visibleTo("studentA", g6))
    assert.equal(await visibleTo("parentA", g6), false, "roles: students only")
    const g5 = await announce("adminA", t.schoolA.id, [{ target_type: "grade_level", target_id: A.g5.id }])
    assert.equal(await visibleTo("studentA", g5), false, "John was in Grade 5 LAST year only")
  })

  test("recipients of an announcement are exactly the users who can read it", async () => {
    // Visibility (RLS) and fan-out (recipients) use the same membership rules.
    // Admins/super admins are excluded: they can read every announcement by role.
    const id = await announce("adminA", t.schoolA.id, [{ target_type: "section", target_id: A.g6a.id }])
    const { data: rows } = await service.from("notifications").select("recipient_user_id").eq("event_key", `announcement:${id}`)
    const notified = new Set(rows.map((r) => r.recipient_user_id))
    for (const [who, u] of Object.entries(t.users)) {
      if (who === "super" || who.startsWith("admin")) continue
      assert.equal(await visibleTo(who, id), notified.has(u.userId), `${who}: readable must equal notified`)
    }
    assert.ok(notified.has(t.users.studentA.userId) && notified.has(t.users.parentA.userId) && notified.has(t.users.teacherA.userId))
  })

  test("targets from another school are rejected", async () => {
    const a = await as.adminA.from("announcements").insert({ school_id: t.schoolA.id, title: "x", content: "y" }).select().single()
    for (const target of [
      { target_type: "school", target_id: t.schoolB.id },
      { target_type: "section", target_id: B.g6a.id },
      { target_type: "grade_level", target_id: B.g6.id },
      { target_type: "class", target_id: B.assignMath.id },
      { target_type: "user", target_id: t.users.parentB.userId },
    ]) {
      await fails(as.adminA.from("announcement_targets").insert({ school_id: t.schoolA.id, announcement_id: a.data.id, ...target }), target.target_type)
    }
    await fails(as.adminA.from("announcements").insert({ school_id: t.schoolB.id, title: "x", content: "y" }), "announce into School B")
  })

  test("drafts cannot be published by insert or by flipping the status", async () => {
    const r = await as.adminA.from("announcements").insert({ school_id: t.schoolA.id, title: "sneaky", content: "x", status: "published" }).select().single()
    assert.equal(r.data.status, "draft", "inserted as draft regardless")
    await fails(as.adminA.from("announcements").update({ status: "published" }).eq("id", r.data.id), "status flip")
    await fails(as.adminA.rpc("publish_announcement", { p_id: r.data.id }), "no audience yet")
  })
})

describe("teacher announcements (moderation)", () => {
  test("teachers cannot announce unless the school allows it", async () => {
    await fails(as.teacherA.from("announcements").insert({ school_id: t.schoolA.id, title: "x", content: "y" }), "not permitted")
  })

  test("when allowed, teachers address only their own sections/classes", async () => {
    await service.from("school_settings").update({ teachers_can_announce: true }).eq("school_id", t.schoolA.id)
    const a = await as.teacherA.from("announcements").insert({ school_id: t.schoolA.id, title: "Quiz Friday", content: "Bring a calculator" }).select().single()
    ok(a, "teacher draft")
    for (const target of [
      { target_type: "school", target_id: t.schoolA.id },
      { target_type: "grade_level", target_id: A.g6.id },
      { target_type: "section", target_id: A.g6c.id },
      { target_type: "user", target_id: t.users.parentA.userId },
    ]) {
      await fails(as.teacherA.from("announcement_targets").insert({ school_id: t.schoolA.id, announcement_id: a.data.id, ...target }), `teacher -> ${target.target_type}`)
    }
    ok(await as.teacherA.from("announcement_targets").insert({ school_id: t.schoolA.id, announcement_id: a.data.id, target_type: "class", target_id: A.assignMath.id }), "own class")
    ok(await as.teacherA.rpc("publish_announcement", { p_id: a.data.id }), "publish")
    assert.ok(await visibleTo("studentA", a.data.id))
    assert.equal(await visibleTo("studentB", a.data.id), false)
    await service.from("school_settings").update({ teachers_can_announce: false }).eq("school_id", t.schoolA.id)
  })

  test("students and parents can never author announcements", async () => {
    for (const who of ["studentA", "parentA"]) {
      await fails(as[who].from("announcements").insert({ school_id: t.schoolA.id, title: "x", content: "y" }), who)
    }
  })
})

describe("scheduling and expiry", () => {
  test("a scheduled announcement is invisible until the server job publishes it", async () => {
    const a = await as.adminA.from("announcements").insert({ school_id: t.schoolA.id, title: "Later", content: "x", publish_at: new Date(Date.now() + 60_000).toISOString() }).select().single()
    await as.adminA.from("announcement_targets").insert({ school_id: t.schoolA.id, announcement_id: a.data.id, target_type: "school", target_id: t.schoolA.id })
    const { data: status } = await as.adminA.rpc("publish_announcement", { p_id: a.data.id })
    assert.equal(status, "scheduled")
    assert.equal(await visibleTo("studentA", a.data.id), false)
    // Simulate time passing, then run the job (pg_cron runs the same function every minute).
    await service.from("announcements").update({ publish_at: new Date(Date.now() - 1000).toISOString() }).eq("id", a.data.id)
    const { data: run } = await service.rpc("run_communication_jobs")
    assert.ok(run.announcements_published >= 1)
    assert.ok(await visibleTo("studentA", a.data.id))
  })

  test("pg_cron runs the jobs inside the database", async () => {
    const { data, error } = await service.rpc("run_communication_jobs")
    assert.equal(error, null)
    assert.ok("announcements_published" in data && "due_reminders" in data)
  })

  test("expired announcements leave feeds but stay available to admins", async () => {
    const id = await announce("adminA", t.schoolA.id, [{ target_type: "school", target_id: t.schoolA.id }], { title: "Expiring" })
    const expired = await service.from("announcements").update({ publish_at: new Date(Date.now() - 2 * 864e5).toISOString(), expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", id).select().single()
    ok(expired, "expire it")
    assert.equal(await visibleTo("studentA", id), false)
    assert.ok(await visibleTo("adminA", id), "history kept for administrators")
  })

  test("only school admins and the worker can run or claim jobs", async () => {
    for (const who of ["adminA", "teacherA", "studentA"]) {
      await fails(as[who].rpc("run_communication_jobs"), `${who} run jobs`)
      await fails(as[who].rpc("claim_notification_deliveries", { p_limit: 10 }), `${who} claim`)
    }
  })
})

describe("academic notification events", () => {
  test("absence notifies the student and the verified parent, once", async () => {
    ok(await as.teacherA.rpc("save_attendance", { p_section_id: A.g6a.id, p_date: today(), p_records: [{ enrollment_id: A.enr2026.id, status: "absent" }] }), "absent")
    // Re-saving the same status is not a new event.
    ok(await as.teacherA.rpc("save_attendance", { p_section_id: A.g6a.id, p_date: today(), p_records: [{ enrollment_id: A.enr2026.id, status: "absent", remarks: "flu" }] }), "again")
    for (const who of ["studentA", "parentA"]) {
      const { data } = await as[who].from("notifications").select("type, priority").eq("type", "attendance_absent")
      assert.equal(data.length, 1, `${who} gets exactly one`)
      assert.equal(data[0].priority, "high")
    }
    await none(as.parentB.from("notifications").select("id").eq("type", "attendance_absent"), "unrelated parent")
  })

  test("parent communication can be switched off per school", async () => {
    await setChannels(t.schoolA.id, {}, { parent_communication: false })
    ok(await as.teacherA.rpc("save_attendance", { p_section_id: A.g6b.id, p_date: today(), p_records: [{ enrollment_id: A.enrSibling.id, status: "late" }] }), "late")
    await none(as.parentA.from("notifications").select("id").eq("type", "attendance_late"), "no parent alerts")
    await setChannels(t.schoolA.id, {}, { parent_communication: true })
  })

  test("schedule changes notify the section and the teacher", async () => {
    ok(await as.adminA.from("class_schedules").update({ room: "Lab 2" }).eq("id", A.mathSchedule.id).select().single(), "change room")
    for (const who of ["studentA", "parentA", "teacherA"]) {
      const { data } = await as[who].from("notifications").select("id").eq("type", "schedule_changed")
      assert.equal(data.length, 1, who)
    }
    await none(as.studentB.from("notifications").select("id").eq("type", "schedule_changed"), "School B")
  })

  test("reviewed submissions notify the student", async () => {
    const sub = await insert("assignment_submissions", { school_id: t.schoolA.id, academic_year_id: A.y2026.id, section_id: A.g6a.id, assignment_id: A.homework.id, student_id: A.student.id, enrollment_id: A.enr2026.id, content: "x" })
    ok(await as.teacherA.from("assignment_submissions").update({ status: "reviewed" }).eq("id", sub.id).select().single(), "review")
    const { data } = await as.studentA.from("notifications").select("id").eq("type", "assignment_graded")
    assert.equal(data.length, 1)
  })
})

describe("notification center security", () => {
  test("users see, read, unread and dismiss only their own notifications", async () => {
    const { data: mine } = await as.parentA.from("notifications").select("id, recipient_user_id")
    assert.ok(mine.length > 0 && mine.every((n) => n.recipient_user_id === t.users.parentA.userId))
    const id = mine[0].id
    ok(await as.parentA.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).select().single(), "read")
    ok(await as.parentA.from("notifications").update({ read_at: null }).eq("id", id).select().single(), "unread")
    ok(await as.parentA.from("notifications").update({ dismissed_at: new Date().toISOString() }).eq("id", id).select().single(), "dismiss")
    await none(as.studentA.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).select("id"), "someone else's")
    await none(as.adminA.from("notifications").select("id").eq("id", id), "even the school admin")
    await fails(as.parentA.from("notifications").update({ title: "edited" }).eq("id", id), "content is immutable")
    await fails(as.parentA.from("notifications").delete().eq("id", id), "hard delete")
  })

  test("users cannot create notifications or deliveries", async () => {
    await fails(as.adminA.from("notifications").insert({ school_id: t.schoolA.id, recipient_user_id: t.users.parentA.userId, type: "system", title: "x", message: "y", event_key: "forged" }), "notification")
    await fails(as.adminA.from("notification_deliveries").insert({ school_id: t.schoolA.id, notification_id: "00000000-0000-0000-0000-000000000000", recipient_user_id: t.users.parentA.userId, channel: "sms", destination: "+639170000000" }), "delivery")
  })
})

describe("preferences", () => {
  test("own preferences only; they decide channels; mandatory types override", async () => {
    await setChannels(t.schoolA.id, { email_notifications_enabled: true }, { email_notifications: true })
    ok(await as.parentA.from("notification_preferences").insert({ school_id: t.schoolA.id, user_id: t.users.parentA.userId, notification_type: "announcement", in_app_enabled: false, email_enabled: false, push_enabled: false }), "opt out")
    await fails(as.parentA.from("notification_preferences").insert({ school_id: t.schoolA.id, user_id: t.users.studentA.userId, notification_type: "announcement" }), "for someone else")
    await fails(as.parentA.from("notification_preferences").insert({ school_id: t.schoolB.id, user_id: t.users.parentA.userId, notification_type: "grade_published" }), "in another school")

    const id = await announce("adminA", t.schoolA.id, [{ target_type: "school", target_id: t.schoolA.id }], { title: "Pref test" })
    const { data: n } = await service.from("notifications").select("id, show_in_app").eq("event_key", `announcement:${id}`).eq("recipient_user_id", t.users.parentA.userId).single()
    assert.equal(n.show_in_app, false, "parent opted out of in-app announcements")
    const { data: d } = await service.from("notification_deliveries").select("channel").eq("notification_id", n.id)
    assert.deepEqual(d, [], "and of email")
    const { data: s } = await service.from("notifications").select("id").eq("event_key", `announcement:${id}`).eq("recipient_user_id", t.users.studentA.userId).single()
    const { data: sd } = await service.from("notification_deliveries").select("channel").eq("notification_id", s.id)
    assert.deepEqual(sd.map((x) => x.channel), ["email"], "student keeps the default email")

    // Urgent priority overrides an in-app opt-out.
    const urgent = await announce("adminA", t.schoolA.id, [{ target_type: "school", target_id: t.schoolA.id }], { title: "Typhoon closure", priority: "urgent" })
    const { data: u } = await service.from("notifications").select("show_in_app").eq("event_key", `announcement:${urgent}`).eq("recipient_user_id", t.users.parentA.userId).single()
    assert.equal(u.show_in_app, true)
    await setChannels(t.schoolA.id, { email_notifications_enabled: false }, { email_notifications: false })
  })
})

describe("SMS as an optional feature", () => {
  const absent = (enr, section, date) => as.adminA.rpc("save_attendance", { p_section_id: section, p_date: date, p_records: [{ enrollment_id: enr.id, status: "absent" }] })
  const smsFor = async (studentId) => {
    const { data } = await service.from("notification_deliveries").select("id, status, destination, notifications!inner(data)").eq("channel", "sms").eq("notifications.data->>student_id", studentId)
    return data
  }

  test("a school without the SMS feature never queues SMS", async () => {
    await service.from("profiles").update({ phone: "+63 917 000 0001" }).eq("user_id", t.users.parentB.userId)
    await setChannels(t.schoolB.id, { sms_notifications_enabled: true }, { sms: false })
    ok(await as.teacherB.rpc("save_attendance", { p_section_id: B.g6a.id, p_date: today(), p_records: [{ enrollment_id: B.enr2026.id, status: "absent" }] }), "absent in B")
    assert.deepEqual(await smsFor(B.student.id), [])
  })

  test("with SMS enabled, deliveries are queued once per event (idempotent)", async () => {
    await service.from("profiles").update({ phone: "+63 917 000 0002" }).eq("user_id", t.users.parentA.userId)
    await setChannels(t.schoolA.id, { sms_notifications_enabled: true }, { sms: true })
    ok(await absent(A.enrSibling, A.g6b.id, "2026-10-01"), "absent")
    // Re-process the same event: change remarks, and replay the notification service directly.
    ok(await absent(A.enrSibling, A.g6b.id, "2026-10-01"), "replay")
    const rows = await smsFor(A.sibling.id)
    assert.equal(rows.length, 1, "exactly one SMS for one absence")
    assert.equal(rows[0].status, "pending")
  })

  test("SMS failures and successes are recorded, usage is tracked", async () => {
    const [row] = await smsFor(A.sibling.id)
    const { data: claimed } = await service.rpc("claim_notification_deliveries", { p_limit: 100 })
    assert.ok(claimed.some((c) => c.id === row.id))
    // Fail three times (retry with backoff), then it is final.
    let status
    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        await service.from("notification_deliveries").update({ next_attempt_at: new Date().toISOString() }).eq("id", row.id)
        await service.rpc("claim_notification_deliveries", { p_limit: 100 })
      }
      status = (await service.rpc("complete_notification_delivery", { p_id: row.id, p_success: false, p_provider: "simulator", p_error: "Carrier rejected" })).data
    }
    assert.equal(status, "failed")
    const { data: usage } = await service.from("sms_usage").select("messages_sent, messages_failed").eq("school_id", t.schoolA.id).single()
    assert.equal(usage.messages_failed, 1)
    const { data: audit } = await service.from("audit_logs").select("action").eq("entity_id", row.id)
    const actions = audit.map((a) => a.action)
    assert.ok(actions.includes("notification.delivery_attempted") && actions.includes("notification.delivery_failed"))
  })

  test("turning SMS off cancels queued messages", async () => {
    ok(await absent(A.enr2026, A.g6a.id, "2026-10-02"), "another absence")
    await setChannels(t.schoolA.id, {}, { sms: false })
    await service.rpc("claim_notification_deliveries", { p_limit: 100 })
    const rows = (await smsFor(A.student.id)).filter((r) => r.status !== "failed")
    assert.ok(rows.length >= 1 && rows.every((r) => r.status === "cancelled"))
  })

  test("SMS usage and delivery logs are visible to the school's own admin only", async () => {
    const { data } = await as.adminA.from("sms_usage").select("school_id")
    assert.ok(data.length === 1 && data[0].school_id === t.schoolA.id)
    for (const who of ["adminB", "teacherA", "parentA"]) {
      await none(as[who].from("sms_usage").select("id").eq("school_id", t.schoolA.id), who)
      await none(as[who].from("notification_deliveries").select("id").eq("school_id", t.schoolA.id), who)
    }
  })
})

describe("devices", () => {
  test("users register many devices, only for themselves", async () => {
    for (const [token, type] of [["fcm-token-aaaaaaaa", "android"], ["apns-token-bbbbbbbb", "ios"]]) {
      ok(await as.parentA.rpc("register_device", { p_push_token: token, p_device_type: type, p_app_version: "1.0.0" }), type)
    }
    const { data } = await as.parentA.from("user_devices").select("user_id")
    assert.equal(data.length, 2)
    await fails(as.parentA.from("user_devices").insert({ school_id: t.schoolA.id, user_id: t.users.studentA.userId, device_type: "web", push_token: "forged-token-cccccccc" }), "for another user")
    await none(as.studentA.from("user_devices").select("id"), "cannot see others' devices")
    await none(as.adminA.from("user_devices").select("id").eq("user_id", t.users.parentA.userId), "not even the admin")
    await none(as.parentB.from("user_devices").select("id"), "other school")
  })

  test("push deliveries are queued per device when push is enabled", async () => {
    await setChannels(t.schoolA.id, { push_notifications_enabled: true }, { push_notifications: true })
    // The parent opted out of announcement pushes in the preferences test; opt back in.
    ok(await as.parentA.from("notification_preferences").update({ push_enabled: true, in_app_enabled: true }).eq("notification_type", "announcement").select().single(), "opt in")
    const id = await announce("adminA", t.schoolA.id, [{ target_type: "user", target_id: t.users.parentA.userId }], { title: "Push test" })
    const { data: n } = await service.from("notifications").select("id").eq("event_key", `announcement:${id}`).single()
    const { data: d } = await service.from("notification_deliveries").select("channel, destination").eq("notification_id", n.id).eq("channel", "push")
    assert.equal(d.length, 2, "one per device")
    await setChannels(t.schoolA.id, { push_notifications_enabled: false }, { push_notifications: false })
  })
})

describe("tenant isolation (Phase 4 tables)", () => {
  test("School A cannot read any School B communication data", async () => {
    await announce("adminB", t.schoolB.id, [{ target_type: "school", target_id: t.schoolB.id }], { title: "B only" })
    await as.parentB.rpc("register_device", { p_push_token: "b-device-token-zzzz", p_device_type: "android" })
    for (const table of PHASE4) {
      for (const who of ["adminA", "teacherA", "studentA", "parentA"]) {
        await none(as[who].from(table).select("id").eq("school_id", t.schoolB.id), `${who} -> B ${table}`)
      }
    }
  })

  test("anonymous users see nothing", async () => {
    for (const table of [...PHASE4, "notification_types"]) {
      const { data } = await anon().from(table).select("id")
      assert.deepEqual(data ?? [], [], table)
    }
  })
})
