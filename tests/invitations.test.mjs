// Invitation flow at the API level: the same steps services/invitations.ts performs.
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PASSWORD, RUN, anon, buildTenants, insert, latestEmail, service, signedIn } from "./helpers.mjs"

let t

before(async () => {
  t = await buildTenants()
})

async function invite(email, record, school) {
  const { data, error } = await service.auth.admin.inviteUserByEmail(email, { data: { first_name: "Invited", last_name: "Teacher" } })
  if (error) throw error
  const { error: linkError } = await service.auth.admin.updateUserById(data.user.id, {
    app_metadata: {
      provision_role: "teacher",
      provision_school_id: school.id,
      provision_status: "active",
      provision_record_type: "teacher",
      provision_record_id: record.id,
    },
  })
  return { userId: data.user.id, linkError }
}

describe("teacher invitations", () => {
  test("an invited teacher is linked to their record and can sign in after accepting", async () => {
    const email = `invitee-${RUN}@test.local`.toLowerCase()
    const teacher = await insert("teachers", { school_id: t.schoolA.id, first_name: "Invited", last_name: "Teacher", email })
    const { userId, linkError } = await invite(email, teacher, t.schoolA)
    assert.equal(linkError, null)
    await insert("invitations", { school_id: t.schoolA.id, email, role: "teacher", teacher_id: teacher.id, user_id: userId, expires_at: new Date(Date.now() + 864e5).toISOString() })

    // Profile + link were created atomically by the provisioning trigger.
    const { data: profile } = await service.from("profiles").select("role, school_id, status").eq("user_id", userId).single()
    assert.deepEqual(profile, { role: "teacher", school_id: t.schoolA.id, status: "active" })
    const { data: linked } = await service.from("teachers").select("user_id").eq("id", teacher.id).single()
    assert.equal(linked.user_id, userId)

    // The email carries a one-time token hash to /auth/confirm (never a password).
    const mail = await latestEmail(email)
    const link = mail.HTML.match(/href="([^"]+)"/)[1].replaceAll("&amp;", "&")
    const url = new URL(link)
    assert.equal(url.pathname, "/auth/confirm")
    assert.equal(url.searchParams.get("type"), "invite")
    assert.equal(url.searchParams.get("next"), "/accept-invite")

    const client = anon()
    const { error: otpError } = await client.auth.verifyOtp({ token_hash: url.searchParams.get("token_hash"), type: "invite" })
    assert.equal(otpError, null)
    // The token is single-use.
    const reuse = await anon().auth.verifyOtp({ token_hash: url.searchParams.get("token_hash"), type: "invite" })
    assert.ok(reuse.error, "token reuse must fail")

    assert.equal((await client.auth.updateUser({ password: PASSWORD })).error, null)
    const { data: accepted } = await client.rpc("accept_invitation")
    assert.equal(accepted, true)
    const { data: inv } = await service.from("invitations").select("accepted_at").eq("teacher_id", teacher.id).single()
    assert.ok(inv.accepted_at)

    const me = await signedIn(email)
    const { data: ctx } = await me.rpc("get_my_context")
    assert.deepEqual(ctx.record, { type: "teacher", id: teacher.id })
  })

  test("an invitation cannot link a record from another school", async () => {
    const email = `cross-${RUN}@test.local`.toLowerCase()
    const teacherB = await insert("teachers", { school_id: t.schoolB.id, first_name: "B", last_name: "Teacher", email })
    const { userId, linkError } = await invite(email, teacherB, t.schoolA)
    assert.ok(linkError, "linking a School B record while provisioning into School A must fail")
    const { data } = await service.from("profiles").select("id").eq("user_id", userId)
    assert.deepEqual(data, [], "no profile is created when the link fails")
    await service.auth.admin.deleteUser(userId)
  })

  test("a record that already has an account cannot be linked again", async () => {
    const email = `twice-${RUN}@test.local`.toLowerCase()
    const teacher = await insert("teachers", { school_id: t.schoolA.id, first_name: "T", last_name: "Twice", user_id: t.users.teacherA.userId })
    const { userId, linkError } = await invite(email, teacher, t.schoolA)
    assert.ok(linkError)
    await service.auth.admin.deleteUser(userId)
  })

  test("only one open invitation per record; school members cannot read invitations", async () => {
    const teacher = await insert("teachers", { school_id: t.schoolA.id, first_name: "One", last_name: "Open" })
    const row = { school_id: t.schoolA.id, email: `one-${RUN}@test.local`, role: "teacher", teacher_id: teacher.id, expires_at: new Date(Date.now() + 864e5).toISOString() }
    await insert("invitations", row)
    const dup = await service.from("invitations").insert(row)
    assert.equal(dup.error?.code, "23505")

    const admin = await signedIn(t.users.adminA.email)
    const { data } = await admin.from("invitations").select("id").eq("teacher_id", teacher.id)
    assert.equal(data.length, 1)
    for (const who of ["teacherA", "studentA", "parentA", "adminB"]) {
      const c = await signedIn(t.users[who].email)
      const { data: none } = await c.from("invitations").select("id")
      assert.deepEqual(none, [], who)
    }
  })

  test("an invitation's role must match its record type", async () => {
    const teacher = await insert("teachers", { school_id: t.schoolA.id, first_name: "Role", last_name: "Mismatch" })
    const { error } = await service.from("invitations").insert({ school_id: t.schoolA.id, email: `rm-${RUN}@test.local`, role: "parent", teacher_id: teacher.id, expires_at: new Date().toISOString() })
    assert.equal(error?.code, "23514")
  })
})
