// Scale hardening: data retention, server-side rate limiting, school-code
// checks off the public API, and the extended page context.
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { anon, buildTenants, service, signedIn } from "./helpers.mjs"

let t, as

before(async () => {
  t = await buildTenants()
  as = Object.fromEntries(await Promise.all(["adminA", "teacherA", "parentA"].map(async (k) => [k, await signedIn(t.users[k].email)])))
})

const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString()
const notification = async (userId, extra) => {
  const { data, error } = await service.from("notifications").insert({
    school_id: t.schoolA.id, recipient_user_id: userId, type: "announcement", title: "Retention test", message: "x",
    event_key: `retention:${crypto.randomUUID()}`, ...extra,
  }).select("id").single()
  if (error) throw error
  return data.id
}
const exists = async (id) => (await service.from("notifications").select("id").eq("id", id).maybeSingle()).data !== null

describe("data retention", () => {
  test("old read/dismissed/expired notifications and very old ones are purged; recent and unread ones stay", async () => {
    const u = t.users.parentA.userId
    const ids = {
      oldRead: await notification(u, { created_at: daysAgo(200), read_at: daysAgo(199) }),
      oldDismissed: await notification(u, { created_at: daysAgo(200), dismissed_at: daysAgo(199) }),
      oldExpired: await notification(u, { created_at: daysAgo(200), expires_at: daysAgo(190) }),
      ancientUnread: await notification(u, { created_at: daysAgo(400) }),
      oldUnread: await notification(u, { created_at: daysAgo(200) }),
      recentRead: await notification(u, { created_at: daysAgo(10), read_at: daysAgo(9) }),
    }
    const { data: delivery, error } = await service.from("notification_deliveries").insert({
      school_id: t.schoolA.id, notification_id: ids.recentRead, recipient_user_id: u, channel: "email", destination: "x@test.local",
      status: "sent", created_at: daysAgo(100),
    }).select("id").single()
    assert.equal(error, null, error?.message)

    const { data: r, error: runError } = await service.rpc("run_data_retention")
    assert.equal(runError, null, runError?.message)
    assert.ok(r.notifications >= 4)
    for (const k of ["oldRead", "oldDismissed", "oldExpired", "ancientUnread"]) assert.equal(await exists(ids[k]), false, `${k} purged`)
    for (const k of ["oldUnread", "recentRead"]) assert.equal(await exists(ids[k]), true, `${k} kept`)
    const { data: d } = await service.from("notification_deliveries").select("id").eq("id", delivery.id).maybeSingle()
    assert.equal(d, null, "90-day-old delivery log purged")
  })

  test("only the server can run it", async () => {
    for (const c of [anon(), as.adminA]) {
      const { error } = await c.rpc("run_data_retention")
      assert.ok(error, "refused")
    }
  })
})

describe("rate limiting", () => {
  test("a bucket allows exactly its limit per window", async () => {
    const bucket = `test:${crypto.randomUUID()}`
    const results = []
    for (let i = 0; i < 4; i++) results.push((await service.rpc("hit_rate_limit", { p_bucket: bucket, p_limit: 3, p_window_seconds: 600 })).data)
    assert.deepEqual(results, [true, true, true, false])
  })

  test("users and anonymous callers cannot use or reset it", async () => {
    for (const c of [anon(), as.teacherA]) {
      const { error } = await c.rpc("hit_rate_limit", { p_bucket: "x", p_limit: 1000, p_window_seconds: 1 })
      assert.ok(error)
    }
  })

  test("school codes cannot be probed through the public API", async () => {
    for (const c of [anon(), as.parentA]) {
      const { error } = await c.rpc("school_code_is_valid", { school_code: t.schoolA.code })
      assert.ok(error, "refused")
    }
    const { data } = await service.rpc("school_code_is_valid", { school_code: t.schoolA.code })
    assert.equal(data, true, "the server can still check")
  })
})

describe("page context", () => {
  test("includes the finance level and currency", async () => {
    const { data } = await as.adminA.rpc("get_my_context")
    assert.equal(data.finance_level, "none", "billing is off by default")
    assert.equal(data.settings.currency.trim(), "PHP")
    await service.from("school_features").update({ enabled: true }).eq("school_id", t.schoolA.id).eq("feature_key", "billing")
    assert.equal((await as.adminA.rpc("get_my_context")).data.finance_level, "admin", "school admin with full access")
    assert.equal((await as.teacherA.rpc("get_my_context")).data.finance_level, "none", "teachers never")
    await service.from("school_features").update({ enabled: false }).eq("school_id", t.schoolA.id).eq("feature_key", "billing")
  })
})
