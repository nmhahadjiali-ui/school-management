// Welcome splash after sign-in (TEST_APP_URL).
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { APP_URL, PASSWORD, asForm, buildTenants, callAction, http, service, sessionCookie } from "./helpers.mjs"

const skip = APP_URL ? false : "TEST_APP_URL not set (start the app to run HTTP tests)"
let t, cookie

before(async () => {
  if (skip) return
  t = await buildTenants()
  cookie = { teacherA: await sessionCookie(t.users.teacherA.email), super: await sessionCookie(t.users.super.email) }
})

describe("welcome splash", { skip }, () => {
  test("signing in goes to the welcome page, keeping where the user was going", async () => {
    const r = await callAction("signIn", [null, asForm({ email: t.users.teacherA.email, password: PASSWORD, next: "/attendance" })], "", "/login")
    assert.equal(r.redirect?.split(";")[0], "/welcome?next=%2Fattendance")
    const unsafe = await callAction("signIn", [null, asForm({ email: t.users.teacherA.email, password: PASSWORD, next: "//evil.example" })], "", "/login")
    assert.equal(unsafe.redirect?.split(";")[0], "/welcome?next=%2Fdashboard")
  })

  test("shows the school's name with its logo, or the default logo; then continues", async () => {
    const plain = await (await http("/welcome?next=/attendance", cookie.teacherA)).text()
    assert.ok(plain.includes(t.schoolA.name))
    assert.ok(!plain.includes("logo\""), "no logo: default icon")
    assert.ok(plain.includes("/attendance"))

    await service.from("schools").update({ logo_url: "https://cdn.example/logo-a.png" }).eq("id", t.schoolA.id)
    const withLogo = await (await http("/welcome", cookie.teacherA)).text()
    assert.ok(withLogo.includes("https://cdn.example/logo-a.png"))
    assert.ok(withLogo.includes("/dashboard"))

    const platform = await (await http("/welcome", cookie.super)).text()
    assert.ok(platform.includes("Platform Administration"))
    assert.equal((await http("/welcome")).status, 307, "signed out: to login")
  })
})
