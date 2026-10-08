import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PASSWORD, RUN, anon, buildTenants, service, signedIn } from "./helpers.mjs"

let t, as

before(async () => {
  t = await buildTenants()
  const entries = await Promise.all(Object.entries(t.users).map(async ([k, u]) => [k, await signedIn(u.email)]))
  as = Object.fromEntries(entries)
})

describe("super admin", () => {
  test("is a platform-level account (no school)", () => {
    assert.equal(t.users.super.profile.school_id, null)
  })

  test("can view all schools and all users", async () => {
    const { data: schools } = await as.super.from("schools").select("id")
    const schoolIds = schools.map((s) => s.id)
    assert.ok(schoolIds.includes(t.schoolA.id) && schoolIds.includes(t.schoolB.id))
    const { data: users } = await as.super.from("profiles").select("id").in("school_id", [t.schoolA.id, t.schoolB.id])
    assert.equal(users.length, 8)
  })

  test("can create a school (settings and default feature flags are created with it)", async () => {
    const { data, error } = await as.super.from("schools").insert({ name: `New ${RUN}`, code: `N-${RUN}` }).select().single()
    assert.equal(error, null)
    const { data: settings } = await as.super.from("school_settings").select("id").eq("school_id", data.id)
    assert.equal(settings.length, 1)
    const { data: flags } = await as.super.from("school_features").select("feature_key, enabled").eq("school_id", data.id)
    const core = ["schedules", "attendance", "grades", "coursework", "notifications"]
    assert.ok(flags.length >= 12)
    // Core academic modules start enabled; optional modules (SMS, payments, ...) start disabled.
    for (const f of flags) assert.equal(f.enabled, core.includes(f.feature_key), f.feature_key)
  })

  test("can disable and re-enable a school; its users lose and regain access", async () => {
    const off = await as.super.from("schools").update({ status: "inactive" }).eq("id", t.schoolB.id).select().single()
    assert.equal(off.error, null)
    const { data: ctx } = await as.adminB.rpc("get_my_context")
    assert.equal(ctx.access_active, false)
    const { data: hidden } = await as.adminB.from("schools").select("id")
    assert.deepEqual(hidden, [])
    const { data: users } = await as.adminB.from("profiles").select("id")
    assert.equal(users.length, 1, "only their own profile stays visible")

    await as.super.from("schools").update({ status: "active" }).eq("id", t.schoolB.id)
    const { data: back } = await as.adminB.from("schools").select("id")
    assert.equal(back.length, 1)
  })

  test("cannot grant the super_admin role through the API", async () => {
    const { error } = await as.super.from("profiles").update({ role: "super_admin", school_id: null }).eq("id", t.users.teacherA.profile.id)
    assert.ok(error)
  })

  test("can manage feature flags", async () => {
    const { error } = await as.super.from("school_features").update({ enabled: true }).eq("school_id", t.schoolB.id).eq("feature_key", "library").select().single()
    assert.equal(error, null)
  })
})

describe("school admin", () => {
  test("can view their school and its users", async () => {
    const { data } = await as.adminA.from("profiles").select("id")
    assert.equal(data.length, 4)
  })

  test("can manage basic school settings", async () => {
    const { error } = await as.adminA.from("school_settings").update({ primary_color: "#0f766e" }).eq("school_id", t.schoolA.id).select().single()
    assert.equal(error, null)
    const { error: e2 } = await as.adminA.from("schools").update({ contact_phone: "555-0100" }).eq("id", t.schoolA.id).select().single()
    assert.equal(e2, null)
  })

  test("cannot change their school's code or status", async () => {
    const { error: e1 } = await as.adminA.from("schools").update({ status: "inactive" }).eq("id", t.schoolA.id)
    assert.ok(e1)
    const { error: e2 } = await as.adminA.from("schools").update({ code: "CHANGED" }).eq("id", t.schoolA.id)
    assert.ok(e2)
  })

  test("can change a member's role and approve accounts", async () => {
    const id = t.users.parentA.profile.id
    const r1 = await as.adminA.from("profiles").update({ role: "teacher" }).eq("id", id).select().single()
    assert.equal(r1.error, null)
    const r2 = await as.adminA.from("profiles").update({ role: "parent", status: "active" }).eq("id", id).select().single()
    assert.equal(r2.error, null)
  })

  test("cannot promote anyone to an admin role", async () => {
    const { error } = await as.adminA.from("profiles").update({ role: "school_admin" }).eq("id", t.users.teacherA.profile.id)
    assert.ok(error)
  })

  test("cannot change their own role or status", async () => {
    const { error } = await as.adminA.from("profiles").update({ status: "inactive" }).eq("id", t.users.adminA.profile.id)
    assert.ok(error)
  })

  test("cannot manage feature flags or platform settings", async () => {
    const { data } = await as.adminA.from("school_features").update({ enabled: true }).eq("school_id", t.schoolA.id).eq("feature_key", "payments").select()
    assert.deepEqual(data, [])
    const { error } = await as.adminA.from("features").insert({ key: "rogue", name: "Rogue" })
    assert.ok(error)
  })
})

for (const role of ["teacher", "student", "parent"]) {
  describe(role, () => {
    const key = `${role}A`

    test("can view only their own profile", async () => {
      const { data } = await as[key].from("profiles").select("id")
      assert.deepEqual(data.map((p) => p.id), [t.users[key].profile.id])
    })

    test("can read their own school, nothing else", async () => {
      const { data } = await as[key].from("schools").select("id")
      assert.deepEqual(data.map((s) => s.id), [t.schoolA.id])
    })

    test("can edit their own contact details", async () => {
      const { error } = await as[key].from("profiles").update({ phone: "555-0101" }).eq("id", t.users[key].profile.id).select().single()
      assert.equal(error, null)
    })

    test("cannot change their own role, status or school", async () => {
      const id = t.users[key].profile.id
      for (const change of [{ role: "school_admin" }, { status: "active", role: "super_admin" }, { school_id: t.schoolB.id }]) {
        const { error } = await as[key].from("profiles").update(change).eq("id", id)
        assert.ok(error, JSON.stringify(change))
      }
    })

    test("cannot modify their school or settings", async () => {
      const { data: s } = await as[key].from("schools").update({ name: "X" }).eq("id", t.schoolA.id).select()
      assert.deepEqual(s, [])
      const { data: st } = await as[key].from("school_settings").update({ primary_color: "#000000" }).eq("school_id", t.schoolA.id).select()
      assert.deepEqual(st, [])
    })

    test("cannot read feature flag rows directly", async () => {
      const { data } = await as[key].from("school_features").select("id")
      assert.deepEqual(data, [])
    })
  })
}

describe("account status", () => {
  test("a pending user sees only their own profile, and no school data", async () => {
    const email = `pending-${RUN}@test.local`.toLowerCase()
    const client = anon()
    await client.auth.signUp({
      email,
      password: PASSWORD,
      options: { data: { first_name: "P", last_name: "U", school_code: t.schoolA.code, requested_role: "student" } },
    })
    const c = await signedIn(email)
    const { data: ctx } = await c.rpc("get_my_context")
    assert.equal(ctx.profile.status, "pending")
    assert.equal(ctx.access_active, false)
    assert.deepEqual(ctx.features, [])
    const { data: schools } = await c.from("schools").select("id")
    assert.deepEqual(schools, [])
    const { data: settings } = await c.from("school_settings").select("id")
    assert.deepEqual(settings, [])
    // Pending users cannot edit their profile either.
    const { data: upd } = await c.from("profiles").update({ phone: "1" }).eq("email", email).select()
    assert.deepEqual(upd, [])
  })

  test("a deactivated user loses access to school data", async () => {
    const { userId, email } = t.users.studentA
    await service.from("profiles").update({ status: "inactive" }).eq("user_id", userId)
    const c = await signedIn(email)
    const { data } = await c.from("schools").select("id")
    assert.deepEqual(data, [])
    await service.from("profiles").update({ status: "active" }).eq("user_id", userId)
  })
})
