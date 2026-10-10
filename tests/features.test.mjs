import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { buildTenants, signedIn } from "./helpers.mjs"

let t, as

before(async () => {
  t = await buildTenants() // SMS enabled for School A only
  const entries = await Promise.all(Object.entries(t.users).map(async ([k, u]) => [k, await signedIn(u.email)]))
  as = Object.fromEntries(entries)
})

describe("feature flags", () => {
  test("an enabled feature appears for the correct school", async () => {
    for (const who of ["adminA", "teacherA", "studentA", "parentA"]) {
      const { data } = await as[who].rpc("get_my_context")
      assert.ok(data.features.includes("sms"), who)
      const { data: has } = await as[who].rpc("has_feature", { feature: "sms" })
      assert.equal(has, true, who)
    }
  })

  test("a disabled feature does not appear for another school", async () => {
    for (const who of ["adminB", "teacherB", "studentB", "parentB"]) {
      const { data } = await as[who].rpc("get_my_context")
      assert.ok(!data.features.includes("sms"), who)
      const { data: has } = await as[who].rpc("has_feature", { feature: "sms" })
      assert.equal(has, false, who)
    }
  })

  test("school admins see their own flags but cannot flip them", async () => {
    const { data } = await as.adminB.from("school_features").select("feature_key, enabled").eq("feature_key", "sms")
    assert.deepEqual(data, [{ feature_key: "sms", enabled: false }])
    const { data: upd } = await as.adminB.from("school_features").update({ enabled: true }).eq("feature_key", "sms").select()
    assert.deepEqual(upd, [])
    const { data: has } = await as.adminB.rpc("has_feature", { feature: "sms" })
    assert.equal(has, false)
  })

  test("unknown features are never enabled", async () => {
    const { data } = await as.adminA.rpc("has_feature", { feature: "does_not_exist" })
    assert.equal(data, false)
  })

  test("enabling a feature takes effect immediately", async () => {
    await as.super.from("school_features").update({ enabled: true }).eq("school_id", t.schoolB.id).eq("feature_key", "sms")
    const { data } = await as.studentB.rpc("has_feature", { feature: "sms" })
    assert.equal(data, true)
    await as.super.from("school_features").update({ enabled: false }).eq("school_id", t.schoolB.id).eq("feature_key", "sms")
    const { data: off } = await as.studentB.rpc("has_feature", { feature: "sms" })
    assert.equal(off, false)
  })
})

describe("feature availability (coming soon / always included)", () => {
  test("the catalog says which features are built", async () => {
    const sup = await signedIn(t.users.super.email)
    const { data } = await sup.from("features").select("key, availability")
    const by = Object.fromEntries(data.map((f) => [f.key, f.availability]))
    for (const k of ["advanced_reports", "inventory", "library", "online_enrollment"]) assert.equal(by[k], "coming_soon", k)
    for (const k of ["payments", "parent_portal"]) assert.equal(by[k], "included", k)
    for (const k of ["attendance", "grades", "billing", "announcements", "sms"]) assert.equal(by[k], "available", k)
  })

  test("coming-soon features cannot be enabled, even directly through the API", async () => {
    const sup = await signedIn(t.users.super.email)
    const bad = await sup.from("school_features").upsert({ school_id: t.schoolA.id, feature_key: "library", enabled: true }, { onConflict: "school_id,feature_key" }).select("id")
    assert.equal(bad.error?.code, "P0001")
    assert.match(bad.error.message, /coming soon/)
    const off = await sup.from("school_features").upsert({ school_id: t.schoolA.id, feature_key: "library", enabled: false }, { onConflict: "school_id,feature_key" }).select("enabled").single()
    assert.equal(off.error, null)
    const ok = await sup.from("school_features").upsert({ school_id: t.schoolA.id, feature_key: "grades", enabled: true }, { onConflict: "school_id,feature_key" }).select("enabled").single()
    assert.equal(ok.data?.enabled, true)
  })
})
