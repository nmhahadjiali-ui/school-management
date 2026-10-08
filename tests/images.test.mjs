// Picture uploads: school logos (public bucket), student and profile photos
// (private bucket). Uploads go straight to Storage with each user's session,
// so these tests exercise the Storage RLS policies and bucket limits directly.
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { APP_URL, anon, buildStructure, buildTenants, http, service, sessionCookie, signedIn } from "./helpers.mjs"

let t, A, B, as
// A valid 1×1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")
const name = (ext = "png") => `${crypto.randomUUID()}.${ext}`

before(async () => {
  t = await buildTenants()
  const S = await buildStructure(t)
  A = S.A
  B = S.B
  as = Object.fromEntries(await Promise.all(Object.keys(t.users).map(async (k) => [k, await signedIn(t.users[k].email)])))
})

const upload = (who, bucket, path, body = PNG, contentType = "image/png") =>
  (who === "anon" ? anon() : as[who]).storage.from(bucket).upload(path, body, { contentType })
const ok = (r, label) => assert.equal(r.error, null, `${label}: ${r.error?.message}`)
const refused = (r, label) => assert.ok(r.error, `${label}: expected refusal`)
const canRead = async (who, path) => !(await as[who].storage.from("photos").createSignedUrl(path, 60)).error

describe("limits", () => {
  test("pictures over 1.5 MB are refused by the bucket", async () => {
    const big = Buffer.alloc(1.5 * 1024 * 1024 + 1, 0)
    refused(await upload("adminA", "school-logos", `${t.schoolA.id}/${name()}`, big), "1.5 MB + 1 byte")
    const justUnder = Buffer.alloc(1.5 * 1024 * 1024 - 1024, 0)
    ok(await upload("adminA", "school-logos", `${t.schoolA.id}/${name()}`, justUnder), "just under 1.5 MB")
  })

  test("only JPG, PNG and WebP are accepted (no SVG)", async () => {
    refused(await upload("adminA", "school-logos", `${t.schoolA.id}/${name("svg")}`, Buffer.from("<svg onload='alert(1)'/>"), "image/svg+xml"), "svg")
    refused(await upload("adminA", "photos", `${t.schoolA.id}/students/${A.student.id}/${name()}`, Buffer.from("%PDF"), "application/pdf"), "pdf")
    ok(await upload("adminA", "school-logos", `${t.schoolA.id}/${name("webp")}`, PNG, "image/webp"), "webp")
  })
})

describe("school logos", () => {
  test("the school's admin and the super admin can upload; nobody else", async () => {
    ok(await upload("adminA", "school-logos", `${t.schoolA.id}/${name()}`), "admin A, own school")
    ok(await upload("super", "school-logos", `${t.schoolB.id}/${name()}`), "super admin")
    refused(await upload("adminA", "school-logos", `${t.schoolB.id}/${name()}`), "admin A into school B")
    for (const who of ["teacherA", "studentA", "parentA", "anon"]) refused(await upload(who, "school-logos", `${t.schoolA.id}/${name()}`), who)
  })

  test("logos are public and can be replaced by their school's admin only", async () => {
    const path = `${t.schoolA.id}/${name()}`
    ok(await upload("adminA", "school-logos", path), "upload")
    const { data } = service.storage.from("school-logos").getPublicUrl(path)
    assert.equal((await fetch(data.publicUrl)).status, 200, "public URL works without signing in")
    const del = await as.adminB.storage.from("school-logos").remove([path])
    assert.equal(del.data?.length ?? 0, 0, "admin B cannot delete school A's logo")
    const own = await as.adminA.storage.from("school-logos").remove([path])
    assert.equal(own.data?.length, 1, "admin A can")
  })
})

describe("student photos", () => {
  let path
  test("only the student's school admin can upload", async () => {
    path = `${t.schoolA.id}/students/${A.student.id}/${name()}`
    ok(await upload("adminA", "photos", path), "admin A")
    refused(await upload("adminB", "photos", `${t.schoolA.id}/students/${A.student.id}/${name()}`), "admin B")
    refused(await upload("adminA", "photos", `${t.schoolA.id}/students/${B.student.id}/${name()}`), "a school B student in school A's folder")
    for (const who of ["teacherA", "studentA", "parentA"]) refused(await upload(who, "photos", `${t.schoolA.id}/students/${A.student.id}/${name()}`), who)
  })

  test("visible exactly to those who can see the student", async () => {
    for (const who of ["adminA", "teacherA", "studentA", "parentA"]) assert.ok(await canRead(who, path), `${who} can see`)
    for (const who of ["adminB", "teacherB", "parentB", "studentB"]) assert.equal(await canRead(who, path), false, `${who} cannot`)
    const other = `${t.schoolA.id}/students/${A.other.id}/${name()}`
    ok(await upload("adminA", "photos", other), "photo of an unrelated student")
    for (const who of ["teacherA", "studentA", "parentA"]) assert.equal(await canRead(who, other), false, `${who} cannot see an unrelated student`)
    const anonRead = await anon().storage.from("photos").createSignedUrl(path, 60)
    assert.ok(anonRead.error, "signed out")
  })

  test("a student record can only point at its own folder", async () => {
    const r = await as.adminA.from("students").update({ photo_path: `${t.schoolA.id}/students/${A.other.id}/${name()}` }).eq("id", A.student.id)
    assert.ok(r.error, "path of another student")
    const good = await as.adminA.from("students").update({ photo_path: path }).eq("id", A.student.id).select("photo_path").single()
    assert.equal(good.data?.photo_path, path)
  })
})

describe("profile photos", () => {
  let path
  test("users upload only into their own folder", async () => {
    const u = t.users.teacherA.userId
    path = `${t.schoolA.id}/users/${u}/${name()}`
    ok(await upload("teacherA", "photos", path), "own folder")
    refused(await upload("teacherA", "photos", `${t.schoolA.id}/users/${t.users.parentA.userId}/${name()}`), "someone else's folder")
    refused(await upload("teacherA", "photos", `${t.schoolB.id}/users/${u}/${name()}`), "another school's folder")
    ok(await upload("super", "photos", `platform/users/${t.users.super.userId}/${name()}`), "super admin uses 'platform'")
  })

  test("seen by the user, their school's admins and super admins only", async () => {
    for (const who of ["teacherA", "adminA", "super"]) assert.ok(await canRead(who, path), `${who} can see`)
    for (const who of ["parentA", "studentA", "adminB", "teacherB"]) assert.equal(await canRead(who, path), false, `${who} cannot`)
  })

  test("a profile can only point at its own folder", async () => {
    const bad = await as.teacherA.from("profiles").update({ avatar_path: `${t.schoolA.id}/users/${t.users.parentA.userId}/${name()}` }).eq("user_id", t.users.teacherA.userId)
    assert.ok(bad.error, "another user's path")
    const good = await as.teacherA.from("profiles").update({ avatar_path: path }).eq("user_id", t.users.teacherA.userId).select("avatar_path").single()
    assert.equal(good.data?.avatar_path, path)
  })
})

describe("photo route", { skip: !APP_URL && "TEST_APP_URL not set" }, () => {
  test("/api/photos redirects only for people allowed to see the picture", async () => {
    const path = `${t.schoolA.id}/students/${A.student.id}/${name()}`
    ok(await upload("adminA", "photos", path), "upload")
    const q = `/api/photos?path=${encodeURIComponent(path)}`
    const parentA = await http(q, await sessionCookie(t.users.parentA.email))
    assert.equal(parentA.status, 302)
    assert.equal((await fetch(parentA.headers.get("location"))).status, 200, "signed URL serves the picture")
    assert.equal((await http(q, await sessionCookie(t.users.parentB.email))).status, 404, "other school's parent")
    assert.equal((await http(q)).status, 401, "signed out")
    assert.equal((await http(`/api/photos?path=${encodeURIComponent("../../etc/passwd")}`, await sessionCookie(t.users.adminA.email))).status, 404, "bad path")
  })
})
