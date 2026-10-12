// Deleting login accounts from the Users pages (TEST_APP_URL).
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { APP_URL, PASSWORD, buildTenants, callAction, insert, provisionUser, service, sessionCookie } from "./helpers.mjs"

const skip = APP_URL ? false : "TEST_APP_URL not set (start the app to run HTTP tests)"
let t, cookie
let k = 0

before(async () => {
  if (skip) return
  t = await buildTenants()
  cookie = Object.fromEntries(await Promise.all(["adminA", "adminB", "teacherA", "super"].map(async (x) => [x, await sessionCookie(t.users[x].email)])))
})

const fresh = (role, school) => provisionUser(`del${++k}`, role, school.id)
const del = async (who, profileId, password = PASSWORD) => (await callAction("deleteUserAccount", [profileId, password], cookie[who], "/users")).result
const exists = async (userId) => !(await service.auth.admin.getUserById(userId)).error

describe("delete user accounts", { skip }, () => {
  test("super admin deletes a student login; the school record stays (unlinked) and the audit log records it", async () => {
    const acct = await fresh("student", t.schoolA)
    const record = await insert("students", { school_id: t.schoolA.id, user_id: acct.userId, student_number: `DEL-${Date.now()}`, first_name: "Del", last_name: "Student" })
    const r = await del("super", acct.profile.id)
    assert.equal(r.ok, true, r.error)
    assert.equal(await exists(acct.userId), false)
    assert.equal((await service.from("profiles").select("id").eq("id", acct.profile.id)).data.length, 0)
    const { data: student } = await service.from("students").select("id, user_id").eq("id", record.id).single()
    assert.equal(student.user_id, null)
    const { data: log } = await service.from("audit_logs").select("action, actor_user_id, metadata").eq("entity_id", acct.profile.id).single()
    assert.equal(log.action, "user.deleted")
    assert.equal(log.actor_user_id, t.users.super.userId)
    assert.equal(log.metadata.email, acct.email)
  })

  test("a wrong password deletes nothing", async () => {
    const acct = await fresh("parent", t.schoolA)
    const r = await del("super", acct.profile.id, "Wrong-pass-000")
    assert.equal(r.ok, false)
    assert.match(r.error, /password is not correct/)
    assert.equal(await exists(acct.userId), true)
  })

  test("school admins and teachers cannot delete accounts (they deactivate them)", async () => {
    for (const role of ["student", "parent", "teacher"]) {
      const target = await fresh(role, t.schoolA)
      const r = await del("adminA", target.profile.id)
      assert.equal(r.ok, false, role)
      assert.match(r.error, /permission/)
      assert.equal(await exists(target.userId), true, role)
    }
    assert.equal((await del("teacherA", (await fresh("student", t.schoolA)).profile.id)).ok, false, "teachers cannot delete")
  })

  test("super admin: any non-super-admin account; never super admins", async () => {
    const schoolAdmin = await fresh("school_admin", t.schoolB)
    assert.equal((await del("super", schoolAdmin.profile.id)).ok, true)
    assert.equal(await exists(schoolAdmin.userId), false)
    const otherSuper = await provisionUser(`delsuper${++k}`, "super_admin", null)
    assert.equal((await del("super", otherSuper.profile.id)).ok, false)
    assert.equal(await exists(otherSuper.userId), true)
    assert.match((await del("super", t.users.super.profile.id)).error, /your own account/)
  })

  test("accounts that handled money are kept for the finance records", async () => {
    const cashier = await fresh("teacher", t.schoolA)
    await insert("financial_audit_logs", { school_id: t.schoolA.id, actor_user_id: cashier.userId, action: "payment.recorded", entity: "payment" })
    const r = await del("super", cashier.profile.id)
    assert.equal(r.ok, false)
    assert.match(r.error, /finance records/)
    assert.equal(await exists(cashier.userId), true)
  })
})
