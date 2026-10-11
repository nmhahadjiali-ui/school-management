// Students and parents cannot upload profile pictures (TEST_APP_URL).
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { APP_URL, buildTenants, callAction, http, sessionCookie } from "./helpers.mjs"

const skip = APP_URL ? false : "TEST_APP_URL not set (start the app to run HTTP tests)"
let t, cookie

before(async () => {
  if (skip) return
  t = await buildTenants()
  cookie = Object.fromEntries(await Promise.all(["studentA", "parentA", "teacherA"].map(async (k) => [k, await sessionCookie(t.users[k].email)])))
})

describe("profile photo upload", { skip }, () => {
  test("hidden and refused for students and parents; teachers keep it", async () => {
    for (const who of ["studentA", "parentA"]) {
      const page = await (await http("/profile", cookie[who])).text()
      assert.ok(!page.includes("Profile photo"), who)
      const r = (await callAction("setMyAvatar", [`${t.schoolA.id}/users/${t.users[who].userId}/00000000-0000-0000-0000-000000000000.png`], cookie[who], "/profile")).result
      assert.equal(r.ok, false, who)
    }
    assert.ok((await (await http("/profile", cookie.teacherA)).text()).includes("Profile photo"))
  })
})
