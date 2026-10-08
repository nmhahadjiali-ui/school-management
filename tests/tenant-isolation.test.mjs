import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { anon, buildTenants, signedIn } from "./helpers.mjs"

let t, as

before(async () => {
  t = await buildTenants()
  const entries = await Promise.all(Object.entries(t.users).map(async ([k, u]) => [k, await signedIn(u.email)]))
  as = Object.fromEntries(entries)
})

const ids = (rows) => (rows ?? []).map((r) => r.id)

describe("tenant isolation: reads", () => {
  for (const [admin, own, other] of [
    ["adminA", "schoolA", "schoolB"],
    ["adminB", "schoolB", "schoolA"],
  ]) {
    test(`${admin} sees only their own school`, async () => {
      const { data } = await as[admin].from("schools").select("id")
      assert.deepEqual(ids(data), [t[own].id])
    })

    test(`${admin} cannot query the other school's users`, async () => {
      const { data } = await as[admin].from("profiles").select("id, school_id")
      assert.ok(data.length >= 4)
      assert.ok(data.every((p) => p.school_id === t[own].id))
      const { data: targeted } = await as[admin].from("profiles").select("id").eq("school_id", t[other].id)
      assert.deepEqual(targeted, [])
    })

    test(`${admin} cannot read the other school's settings or feature flags`, async () => {
      const { data: s } = await as[admin].from("school_settings").select("school_id").eq("school_id", t[other].id)
      assert.deepEqual(s, [])
      const { data: f } = await as[admin].from("school_features").select("id").eq("school_id", t[other].id)
      assert.deepEqual(f, [])
    })
  }

  test("a School A teacher cannot query School B students", async () => {
    const { data } = await as.teacherA.from("profiles").select("id").eq("role", "student")
    assert.deepEqual(data, [])
    const { data: byId } = await as.teacherA.from("profiles").select("id").eq("id", t.users.studentB.profile.id)
    assert.deepEqual(byId, [])
  })

  test("anonymous clients can read nothing", async () => {
    for (const table of ["schools", "profiles", "school_settings", "school_features", "features"]) {
      const { data } = await anon().from(table).select("*")
      assert.deepEqual(data ?? [], [], table)
    }
  })
})

describe("tenant isolation: writes", () => {
  test("School A admin cannot modify School B's record", async () => {
    const { data } = await as.adminA.from("schools").update({ name: "Hacked" }).eq("id", t.schoolB.id).select()
    assert.deepEqual(data, [])
  })

  test("School A admin cannot modify School B's users", async () => {
    const { data } = await as.adminA.from("profiles").update({ first_name: "Hacked" }).eq("id", t.users.studentB.profile.id).select()
    assert.deepEqual(data, [])
    const { data: status } = await as.adminA.from("profiles").update({ status: "inactive" }).eq("id", t.users.teacherB.profile.id).select()
    assert.deepEqual(status, [])
  })

  test("School A admin cannot modify School B's settings", async () => {
    const { data } = await as.adminA.from("school_settings").update({ primary_color: "#000000" }).eq("school_id", t.schoolB.id).select()
    assert.deepEqual(data, [])
  })

  test("School A admin cannot move a user into School B", async () => {
    const { error } = await as.adminA.from("profiles").update({ school_id: t.schoolB.id }).eq("id", t.users.studentA.profile.id)
    assert.ok(error, "expected an error")
  })

  test("School B users cannot modify School A records", async () => {
    for (const who of ["adminB", "teacherB", "studentB", "parentB"]) {
      const { data } = await as[who].from("schools").update({ name: "Hacked" }).eq("id", t.schoolA.id).select()
      assert.deepEqual(data, [], who)
    }
  })

  test("school users cannot create schools", async () => {
    const { error } = await as.adminA.from("schools").insert({ name: "Rogue", code: "ROGUE-1" })
    assert.ok(error)
  })

  test("school users cannot create profiles directly", async () => {
    const { error } = await as.adminA.from("profiles").insert({
      user_id: t.users.teacherA.userId,
      email: "x@test.local",
      role: "teacher",
      school_id: t.schoolA.id,
    })
    assert.ok(error)
  })

  test("profiles cannot be deleted through the API", async () => {
    const { data } = await as.adminA.from("profiles").delete().eq("id", t.users.studentA.profile.id).select()
    assert.ok(!data?.length)
  })
})
