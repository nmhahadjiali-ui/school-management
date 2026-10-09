// The mobile app's account-creation endpoint (POST /api/mobile/users).
// Authenticated with the app's bearer access token; same rules as the web form.
// Needs a running app: set TEST_APP_URL, e.g. http://localhost:3000.
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { APP_URL, RUN, buildTenants, service, signedIn } from "./helpers.mjs"

const skip = APP_URL ? false : "TEST_APP_URL not set (start the app to run HTTP tests)"
let t, token

before(async () => {
  if (skip) return
  t = await buildTenants()
  token = {}
  for (const who of ["super", "adminA", "teacherA", "parentA"]) {
    const client = await signedIn(t.users[who].email)
    token[who] = (await client.auth.getSession()).data.session.access_token
  }
})

let n = 0
const newUser = (overrides = {}) => ({
  first_name: "Mobile",
  last_name: "Created",
  email: `mobile-${++n}-${RUN}@test.local`.toLowerCase(),
  role: "teacher",
  password: "Temp-pass-123",
  ...overrides,
})

const post = (body, bearer) =>
  fetch(`${APP_URL}/api/mobile/users`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify(body),
  })

const profileOf = async (email) => (await service.from("profiles").select("role, school_id, status").eq("email", email).maybeSingle()).data

describe("POST /api/mobile/users", { skip }, () => {
  test("requires a valid bearer token", async () => {
    const body = newUser({ school_id: t.schoolA.id })
    assert.equal((await post(body)).status, 401)
    assert.equal((await post(body, "not-a-jwt")).status, 401)
    assert.equal(await profileOf(body.email), null)
  })

  test("super admin creates an account in any school, with an admin role", async () => {
    const body = newUser({ school_id: t.schoolB.id, role: "school_admin" })
    const res = await post(body, token.super)
    assert.equal(res.status, 201)
    assert.equal((await res.json()).ok, true)
    assert.deepEqual(await profileOf(body.email), { role: "school_admin", school_id: t.schoolB.id, status: "active" })
  })

  test("school admin: own school and member roles only", async () => {
    const ok = newUser({ school_id: t.schoolA.id, role: "student" })
    assert.equal((await post(ok, token.adminA)).status, 201)
    assert.equal((await profileOf(ok.email))?.school_id, t.schoolA.id)

    const otherSchool = newUser({ school_id: t.schoolB.id })
    assert.equal((await post(otherSchool, token.adminA)).status, 403)
    assert.equal(await profileOf(otherSchool.email), null)

    const adminRole = newUser({ school_id: t.schoolA.id, role: "school_admin" })
    const res = await post(adminRole, token.adminA)
    assert.equal(res.status, 400)
    assert.match((await res.json()).error, /only add teachers, students and parents/)
    assert.equal(await profileOf(adminRole.email), null)
  })

  test("teachers and parents cannot create accounts", async () => {
    for (const who of ["teacherA", "parentA"]) {
      const body = newUser({ school_id: t.schoolA.id })
      assert.equal((await post(body, token[who])).status, 403, who)
      assert.equal(await profileOf(body.email), null, who)
    }
  })

  test("validation and duplicates use the web form's messages", async () => {
    const weak = await post(newUser({ school_id: t.schoolA.id, password: "short" }), token.super)
    assert.equal(weak.status, 400)
    assert.ok((await weak.json()).fieldErrors.password)

    const superRole = await post(newUser({ school_id: t.schoolA.id, role: "super_admin" }), token.super)
    assert.equal(superRole.status, 400)
    assert.ok((await superRole.json()).fieldErrors.role)

    const missingSchool = await post(newUser({ school_id: "00000000-0000-0000-0000-000000000000" }), token.super)
    assert.equal(missingSchool.status, 400)
    assert.match((await missingSchool.json()).error, /school was not found/)

    const dup = await post(newUser({ school_id: t.schoolA.id, email: t.users.teacherA.email }), token.super)
    assert.equal(dup.status, 400)
    assert.ok((await dup.json()).fieldErrors.email)
  })
})
