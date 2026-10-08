// Phase 4 over HTTP against a running build (TEST_APP_URL): pages per role,
// deep links, the worker endpoint and its providers, and actions with forged input.
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { APP_URL, buildAcademic, buildStructure, buildTenants, callAction, http, service, sessionCookie, signedIn, today } from "./helpers.mjs"

const built = existsSync(new URL("../.next/server/server-reference-manifest.json", import.meta.url))
const skip = !APP_URL ? "TEST_APP_URL not set" : !built ? "no build found (run npm run build)" : !process.env.CRON_SECRET ? "CRON_SECRET not set" : false
let t, A, B, cookie, as

before(async () => {
  if (skip) return
  t = await buildTenants()
  const S = await buildAcademic(await buildStructure(t))
  A = S.A
  B = S.B
  const entries = await Promise.all(Object.entries(t.users).map(async ([k, u]) => [k, await sessionCookie(u.email)]))
  cookie = Object.fromEntries(entries)
  as = Object.fromEntries(await Promise.all(["adminA", "teacherA", "studentA", "parentA"].map(async (k) => [k, await signedIn(t.users[k].email)])))
})

const status = async (path, who) => (await http(path, cookie[who])).status
const act = (name, args, who, path) => callAction(name, args, cookie[who], path)
const job = (secret = process.env.CRON_SECRET) => fetch(`${APP_URL}/api/jobs/communication`, { method: "POST", headers: secret ? { authorization: `Bearer ${secret}` } : {} })
const draft = (targets, extra = {}) => ({ id: null, title: "HTTP test", content: "Body", priority: "normal", publish_at: null, expires_at: null, targets, intent: "publish", ...extra })

describe("communication pages by role", { skip }, () => {
  test("every school user has announcements, notifications and preferences", async () => {
    for (const who of ["adminA", "teacherA", "studentA", "parentA"]) {
      for (const p of ["/announcements", "/notifications", "/notifications?view=unread", "/notifications/preferences", "/dashboard"]) {
        assert.equal(await status(p, who), 200, `${who} ${p}`)
      }
    }
  })

  test("only authors reach the editor", async () => {
    assert.equal(await status("/announcements/new", "adminA"), 200)
    for (const who of ["teacherA", "studentA", "parentA"]) assert.equal(await status("/announcements/new", who), 307, who)
    await service.from("school_settings").update({ teachers_can_announce: true }).eq("school_id", t.schoolA.id)
    assert.equal(await status("/announcements/new", "teacherA"), 200, "teacher when the school allows it")
    await service.from("school_settings").update({ teachers_can_announce: false }).eq("school_id", t.schoolA.id)
  })
})

describe("announcement actions with forged input", { skip }, () => {
  test("admin publishes a section announcement; only its audience can open it", async () => {
    const r = await act("saveAnnouncement", [draft([{ target_type: "section", target_id: A.g6a.id, roles: null }])], "adminA", "/announcements/new")
    assert.match(r.redirect ?? "", /^\/announcements\/[0-9a-f-]{36}\?saved=publish/, JSON.stringify(r.result))
    const id = r.redirect.split("/")[2].split("?")[0]
    for (const who of ["studentA", "parentA", "teacherA"]) assert.equal(await status(`/announcements/${id}`, who), 200, who)
    for (const who of ["studentB", "parentB", "adminB"]) assert.equal(await status(`/announcements/${id}`, who), 404, who)
  })

  test("a 'school' target is pinned to the caller's own school", async () => {
    // The client sends School B's id; the server ignores it for school targets.
    const r = await act("saveAnnouncement", [draft([{ target_type: "school", target_id: t.schoolB.id, roles: null }], { title: "Pinned" })], "adminA", "/announcements/new")
    const id = r.redirect.split("/")[2].split("?")[0]
    const { data } = await service.from("announcement_targets").select("target_id").eq("announcement_id", id)
    assert.deepEqual(data, [{ target_id: t.schoolA.id }])
    assert.equal(await status(`/announcements/${id}`, "studentB"), 404)
  })

  test("targets from another school are refused", async () => {
    const r = await act("saveAnnouncement", [draft([{ target_type: "section", target_id: B.g6a.id, roles: null }])], "adminA", "/announcements/new")
    assert.equal(r.result.ok, false)
    assert.match(r.result.error, /belong to this school/)
  })

  test("teachers cannot announce when not allowed, nor beyond their classes when allowed", async () => {
    const denied = await act("saveAnnouncement", [draft([{ target_type: "section", target_id: A.g6a.id, roles: null }])], "teacherA", "/announcements/new")
    assert.deepEqual(denied.result, { ok: false, error: "You do not have permission to do that." })
    await service.from("school_settings").update({ teachers_can_announce: true }).eq("school_id", t.schoolA.id)
    try {
      const wide = await act("saveAnnouncement", [draft([{ target_type: "school", target_id: null, roles: null }])], "teacherA", "/announcements/new")
      assert.equal(wide.result.ok, false)
      assert.match(wide.result.error, /own sections and classes/)
      const own = await act("saveAnnouncement", [draft([{ target_type: "class", target_id: A.assignMath.id, roles: null }], { title: "Quiz" })], "teacherA", "/announcements/new")
      assert.match(own.redirect ?? "", /^\/announcements\//)
    } finally {
      await service.from("school_settings").update({ teachers_can_announce: false }).eq("school_id", t.schoolA.id)
    }
  })

  test("students and parents cannot author", async () => {
    for (const who of ["studentA", "parentA"]) {
      const r = await act("saveAnnouncement", [draft([{ target_type: "section", target_id: A.g6a.id, roles: null }])], who, "/announcements/new")
      assert.deepEqual(r.result, { ok: false, error: "You do not have permission to do that." }, who)
    }
  })
})

describe("notification center and deep links", { skip }, () => {
  test("a notification opens its target, marks it read, and only for its recipient", async () => {
    await as.teacherA.rpc("save_attendance", { p_section_id: A.g6a.id, p_date: today(), p_records: [{ enrollment_id: A.enr2026.id, status: "absent" }] })
    const { data: n } = await as.parentA.from("notifications").select("id, read_at").eq("type", "attendance_absent").single()
    assert.equal(n.read_at, null)
    const res = await http(`/notifications/${n.id}/open`, cookie.parentA)
    assert.equal(res.status, 307)
    assert.equal(new URL(res.headers.get("location"), APP_URL).pathname, `/students/${A.student.id}`)
    const { data: after } = await as.parentA.from("notifications").select("read_at").eq("id", n.id).single()
    assert.ok(after.read_at)
    // Someone else following the link gets nothing (no redirect to the student).
    const other = await http(`/notifications/${n.id}/open`, cookie.parentB)
    assert.equal(new URL(other.headers.get("location"), APP_URL).pathname, "/notifications")
  })

  test("marking another user's notification does nothing", async () => {
    const { data: n } = await as.parentA.from("notifications").select("id").limit(1).single()
    await act("setRead", [[n.id], false], "parentA")
    const r = await act("setRead", [[n.id], true], "studentA")
    assert.equal(r.result.ok, true, "the call itself is harmless…")
    const { data } = await as.parentA.from("notifications").select("read_at").eq("id", n.id).single()
    assert.equal(data.read_at, null, "…and changed nothing")
  })

  test("preferences are always saved for the caller, never another user", async () => {
    const r = await act("savePreference", [{ notification_type: "attendance_late", in_app_enabled: true, email_enabled: false, sms_enabled: false, push_enabled: false }], "studentA")
    assert.equal(r.result.ok, true)
    const { data } = await service.from("notification_preferences").select("user_id").eq("notification_type", "attendance_late")
    assert.deepEqual(data.map((p) => p.user_id), [t.users.studentA.userId])
  })
})

describe("delivery worker", { skip }, () => {
  test("the job endpoint requires the cron secret", async () => {
    assert.equal((await job(null)).status, 401)
    assert.equal((await job("wrong-secret-of-same-length-xxxxx")).status, 401)
  })

  test("queued SMS is sent through the configured provider and counted", async () => {
    await service.from("school_settings").update({ sms_notifications_enabled: true }).eq("school_id", t.schoolA.id)
    await service.from("school_features").update({ enabled: true }).eq("school_id", t.schoolA.id).eq("feature_key", "sms")
    await service.from("profiles").update({ phone: "+63 917 123 4567" }).eq("user_id", t.users.parentA.userId)
    await as.teacherA.rpc("save_attendance", { p_section_id: A.g6b.id, p_date: today(), p_records: [{ enrollment_id: A.enrSibling.id, status: "absent" }] })
    const res = await job()
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.ok(body.deliveries.sent >= 1, JSON.stringify(body))
    const { data } = await service.from("notification_deliveries").select("status, provider, provider_message_id, notifications!inner(data)").eq("channel", "sms").eq("notifications.data->>student_id", A.sibling.id)
    assert.equal(data.length, 1)
    assert.equal(data[0].status, "sent")
    assert.equal(data[0].provider, "sms-simulator")
    assert.match(data[0].provider_message_id, /^sim-/)
    const { data: usage } = await service.from("sms_usage").select("messages_sent").eq("school_id", t.schoolA.id).single()
    assert.ok(usage.messages_sent >= 1)
  })

  test("provider failures are recorded and retried, not lost", async () => {
    await service.from("profiles").update({ phone: "+63 FAIL 0000" }).eq("user_id", t.users.parentA.userId)
    // Absence alerts go out by SMS by default; the simulator fails numbers containing "FAIL".
    await as.teacherA.rpc("save_attendance", { p_section_id: A.g6a.id, p_date: "2026-10-05", p_records: [{ enrollment_id: A.enr2026.id, status: "absent" }] })
    await job()
    const { data } = await service.from("notification_deliveries").select("status, attempts, error_message").eq("destination", "+63 FAIL 0000")
    assert.equal(data.length, 1)
    assert.deepEqual([data[0].status, data[0].attempts], ["pending", 1], "scheduled for retry")
    assert.match(data[0].error_message, /Simulated delivery failure/)
  })
})
