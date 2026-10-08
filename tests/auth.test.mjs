import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PASSWORD, RUN, anon, createSchool, service } from "./helpers.mjs"

let school

before(async () => {
  school = await createSchool(`Auth School ${RUN}`, `AU-${RUN}`)
})

const register = (client, email, extra = {}) =>
  client.auth.signUp({
    email,
    password: PASSWORD,
    options: { data: { first_name: "New", last_name: "User", school_code: school.code, requested_role: "student", ...extra } },
  })

describe("authentication", () => {
  test("user can register with a valid school code (starts pending)", async () => {
    const email = `reg-${RUN}@test.local`.toLowerCase()
    const { data, error } = await register(anon(), email, { requested_role: "teacher" })
    assert.equal(error, null)
    const { data: profile } = await service.from("profiles").select("*").eq("user_id", data.user.id).single()
    assert.equal(profile.school_id, school.id)
    assert.equal(profile.role, "teacher")
    assert.equal(profile.status, "pending")
    assert.equal(profile.email, email)
  })

  test("registration with an unknown school code is rejected", async () => {
    const { error } = await register(anon(), `bad-${RUN}@test.local`, { school_code: "NOPE-XYZ-000" })
    assert.ok(error, "expected sign-up to fail")
  })

  test("registration with an inactive school's code is rejected", async () => {
    const inactive = await createSchool(`Inactive ${RUN}`, `IN-${RUN}`)
    await service.from("schools").update({ status: "inactive" }).eq("id", inactive.id)
    const { error } = await register(anon(), `inact-${RUN}@test.local`, { school_code: inactive.code })
    assert.ok(error)
  })

  test("self-registration cannot request an admin role", async () => {
    for (const requested_role of ["school_admin", "super_admin"]) {
      const { data, error } = await register(anon(), `esc-${requested_role}-${RUN}@test.local`, { requested_role })
      assert.equal(error, null)
      const { data: p } = await service.from("profiles").select("role, status").eq("user_id", data.user.id).single()
      assert.equal(p.role, "student")
      assert.equal(p.status, "pending")
    }
  })

  test("self-registration cannot set app_metadata provisioning", async () => {
    // user_metadata is client-controlled; app_metadata is not settable via sign-up.
    const { data } = await register(anon(), `meta-${RUN}@test.local`, { provision_role: "school_admin", provision_status: "active" })
    const { data: p } = await service.from("profiles").select("role, status").eq("user_id", data.user.id).single()
    assert.equal(p.role, "student")
    assert.equal(p.status, "pending")
  })

  test("user can log in, and wrong passwords are rejected", async () => {
    const email = `login-${RUN}@test.local`.toLowerCase()
    await register(anon(), email)
    const client = anon()
    const ok = await client.auth.signInWithPassword({ email, password: PASSWORD })
    assert.equal(ok.error, null)
    assert.ok(ok.data.session?.access_token)
    const bad = await anon().auth.signInWithPassword({ email, password: "wrong-password-1" })
    assert.ok(bad.error)
  })

  test("user can log out; the client loses access", async () => {
    const email = `logout-${RUN}@test.local`.toLowerCase()
    await register(anon(), email)
    const client = anon()
    await client.auth.signInWithPassword({ email, password: PASSWORD })
    const { data: before } = await client.from("profiles").select("id")
    assert.equal(before.length, 1)
    const { error } = await client.auth.signOut()
    assert.equal(error, null)
    const { data: after } = await client.from("profiles").select("id")
    assert.deepEqual(after ?? [], [])
  })

  test("passwords are not stored in the application schema", async () => {
    const { data } = await service.from("profiles").select("*").limit(1)
    assert.ok(!Object.keys(data[0] ?? {}).some((k) => k.includes("password")))
  })
})
