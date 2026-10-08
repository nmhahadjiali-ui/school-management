// End-to-end checks against a running Next.js app (server-side authorization,
// route protection, feature gates). Set TEST_APP_URL, e.g. http://localhost:3000.
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { APP_URL, buildTenants, http, sessionCookie } from "./helpers.mjs"

const skip = APP_URL ? false : "TEST_APP_URL not set (start the app to run HTTP tests)"
let t, cookie

before(async () => {
  if (skip) return
  t = await buildTenants()
  const entries = await Promise.all(Object.entries(t.users).map(async ([k, u]) => [k, await sessionCookie(u.email)]))
  cookie = Object.fromEntries(entries)
})

const location = (res) => new URL(res.headers.get("location"), APP_URL)

describe("protected routes", { skip }, () => {
  for (const path of ["/dashboard", "/profile", "/users", "/platform/schools", "/settings"]) {
    test(`${path} redirects to login when signed out`, async () => {
      const res = await http(path)
      assert.equal(res.status, 307)
      assert.equal(location(res).pathname, "/login")
    })
  }

  test("API routes return 401 when signed out", async () => {
    const res = await http("/api/features/sms")
    assert.equal(res.status, 401)
  })

  test("an invalid session cookie is treated as expired", async () => {
    const res = await http("/dashboard", "sb-127-auth-token=base64-garbage")
    assert.equal(res.status, 307)
    assert.equal(location(res).searchParams.get("reason"), "expired")
  })

  test("signed-in users can open their dashboard", async () => {
    for (const who of ["super", "adminA", "teacherA", "studentA", "parentA"]) {
      const res = await http("/dashboard", cookie[who])
      assert.equal(res.status, 200, who)
    }
  })
})

describe("server-side role checks", { skip }, () => {
  const platformPages = ["/platform/schools", "/platform/users", "/platform/settings"]
  const schoolPages = ["/school", "/users", "/settings"]

  test("super admin can open platform pages", async () => {
    for (const p of platformPages) assert.equal((await http(p, cookie.super)).status, 200, p)
  })

  test("school admin can open school pages but not platform pages", async () => {
    for (const p of schoolPages) assert.equal((await http(p, cookie.adminA)).status, 200, p)
    for (const p of platformPages) {
      const res = await http(p, cookie.adminA)
      assert.equal(res.status, 307, p)
      assert.equal(location(res).searchParams.get("denied"), "1")
    }
  })

  test("teachers, students and parents only reach dashboard and profile", async () => {
    for (const who of ["teacherA", "studentA", "parentA"]) {
      assert.equal((await http("/profile", cookie[who])).status, 200)
      for (const p of [...platformPages, ...schoolPages]) {
        assert.equal((await http(p, cookie[who])).status, 307, `${who} ${p}`)
      }
    }
  })

  test("school admin cannot open another school's admin page", async () => {
    const res = await http(`/platform/schools/${t.schoolB.id}`, cookie.adminA)
    assert.equal(res.status, 307)
  })
})

describe("feature gates over HTTP", { skip }, () => {
  test("enabled feature is reachable for School A", async () => {
    assert.equal((await http("/api/features/sms", cookie.studentA)).status, 200)
    assert.equal((await http("/modules/sms", cookie.studentA)).status, 200)
  })

  test("disabled feature cannot be accessed directly by School B", async () => {
    assert.equal((await http("/api/features/sms", cookie.studentB)).status, 403)
    assert.equal((await http("/modules/sms", cookie.studentB)).status, 404)
  })
})
