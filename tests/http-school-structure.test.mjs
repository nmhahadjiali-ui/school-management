// Phase 2 over HTTP against a running app (set TEST_APP_URL): page-level
// authorization, cross-school isolation on profile pages, lookups API.
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { APP_URL, buildStructure, buildTenants, http, insert, sessionCookie } from "./helpers.mjs"

const skip = APP_URL ? false : "TEST_APP_URL not set (start the app to run HTTP tests)"
let t, A, B, cookie

before(async () => {
  if (skip) return
  t = await buildTenants()
  const S = await buildStructure(t)
  A = S.A
  B = S.B
  const entries = await Promise.all(Object.entries(t.users).map(async ([k, u]) => [k, await sessionCookie(u.email)]))
  cookie = Object.fromEntries(entries)
})

const ADMIN_PAGES = ["/academic-years", "/grade-levels", "/sections", "/subjects", "/students", "/students/new", "/teachers", "/teachers/new", "/guardians", "/guardians/new", "/enrollments", "/teaching-loads"]
const status = async (path, who) => (await http(path, cookie[who])).status
const text = async (path, who) => (await http(path, cookie[who])).text()

describe("school admin pages", { skip }, () => {
  test("school admin can open every management page", async () => {
    for (const p of ADMIN_PAGES) assert.equal(await status(p, "adminA"), 200, p)
  })

  test("teachers, students and parents are redirected away", async () => {
    for (const who of ["teacherA", "studentA", "parentA"]) {
      for (const p of ADMIN_PAGES) assert.equal(await status(p, who), 307, `${who} ${p}`)
    }
  })

  test("lists render only the admin's school, with search and pagination", async () => {
    const html = await text("/students?q=doe", "adminA")
    assert.ok(html.includes("DoeA") && !html.includes("DoeB"), "school A only")
    assert.ok(!html.includes("OtherA"), "search applied")
    assert.equal(await status("/students?page=999&sort=bogus&dir=sideways&status=nope", "adminA"), 200, "hostile params are ignored")
  })
})

describe("profile pages respect school boundaries", { skip }, () => {
  test("School A admin gets 404 for School B records", async () => {
    for (const p of [`/students/${B.student.id}`, `/teachers/${B.teacher.id}`, `/guardians/${B.guardian.id}`, `/sections/${B.g6a.id}`, `/students/${B.student.id}/edit`]) {
      assert.equal(await status(p, "adminA"), 404, p)
    }
  })

  test("School A admin can open School A records", async () => {
    for (const p of [`/students/${A.student.id}`, `/teachers/${A.teacher.id}`, `/guardians/${A.guardian.id}`, `/sections/${A.g6a.id}`]) {
      assert.equal(await status(p, "adminA"), 200, p)
    }
  })

  test("invalid ids are 404, not errors", async () => {
    assert.equal(await status("/students/not-a-uuid", "adminA"), 404)
  })
})

describe("teacher, student and parent views", { skip }, () => {
  test("teacher sees their sections and those students only", async () => {
    assert.equal(await status("/my-classes", "teacherA"), 200)
    assert.equal(await status(`/sections/${A.g6a.id}`, "teacherA"), 200)
    assert.equal(await status(`/sections/${A.g6c.id}`, "teacherA"), 404)
    assert.equal(await status(`/students/${A.student.id}`, "teacherA"), 200)
    assert.equal(await status(`/students/${A.other.id}`, "teacherA"), 404)
    assert.equal(await status(`/teachers/${A.teacher.id}`, "teacherA"), 200)
    assert.equal(await status(`/teachers/${A.teacher2.id}`, "teacherA"), 404)
  })

  test("the teacher's view has no management actions", async () => {
    const html = await text(`/students/${A.student.id}`, "teacherA")
    assert.ok(!html.includes("Send invitation") && !html.includes(">Edit<") && !html.includes("Close enrollment"))
  })

  test("parent sees their children only", async () => {
    assert.equal(await status("/my-children", "parentA"), 200)
    const html = await text("/my-children", "parentA")
    assert.ok(html.includes("John") && html.includes("Anna") && !html.includes("OtherA"), "only linked children")
    assert.equal(await status(`/students/${A.sibling.id}`, "parentA"), 200)
    assert.equal(await status(`/students/${A.other.id}`, "parentA"), 404)
    assert.equal(await status(`/students/${B.student.id}`, "parentA"), 404)
    assert.equal(await status(`/guardians/${A.guardian.id}`, "parentA"), 200)
    assert.equal(await status(`/guardians/${A.guardian2.id}`, "parentA"), 404)
  })

  test("student sees their own record only", async () => {
    assert.equal(await status(`/students/${A.student.id}`, "studentA"), 200)
    assert.equal(await status(`/students/${A.sibling.id}`, "studentA"), 404)
    assert.equal(await status("/my-classes", "studentA"), 307)
    assert.equal(await status(`/sections/${A.g6a.id}`, "studentA"), 307)
  })
})

describe("lookups API", { skip }, () => {
  test("returns at most 10 matches from the admin's school", async () => {
    const res = await http("/api/lookups/students?q=doe", cookie.adminA)
    assert.equal(res.status, 200)
    const rows = await res.json()
    assert.ok(rows.length >= 2 && rows.length <= 10)
    assert.ok(rows.every((r) => r.label.includes("DoeA")))
  })

  test("is forbidden for non-admins and anonymous users", async () => {
    assert.equal((await http("/api/lookups/students?q=doe", cookie.teacherA)).status, 403)
    assert.equal((await http("/api/lookups/students?q=doe")).status, 401)
    assert.equal((await http("/api/lookups/profiles?q=a", cookie.adminA)).status, 404)
  })
})

describe("academic year shown on sections and teaching loads", { skip }, () => {
  test("new sections default to the year shown; empty years explain why nothing is listed", async () => {
    const planned = await insert("academic_years", { school_id: t.schoolA.id, name: `2030-2031 ${Date.now() % 1e6}`, start_date: "2030-06-01", end_date: "2031-03-31", status: "planned" })

    // Default view = current year: the form preselects it, not the newest (planned) year.
    const html = await text("/sections", "adminA")
    // The dialog's form is rendered in the browser; its props travel in the page's RSC payload.
    const payload = html.replace(/\\"/g, '"')
    const field = payload.match(/"defaultYearId":"([0-9a-f-]{36})"/)
    assert.ok(field, "new-section form found in the page payload")
    assert.equal(field[1], A.y2026.id)
    assert.ok(html.includes("(planned)"), "planned years are labelled")

    const sections = await text(`/sections?year=${planned.id}`, "adminA")
    assert.ok(sections.includes(`No sections found in ${planned.name}`))
    const loads = await text(`/teaching-loads?year=${planned.id}`, "adminA")
    assert.ok(loads.includes("has no active sections yet"))
    const current = await text("/teaching-loads", "adminA")
    assert.ok(!current.includes("has no active sections yet"), "no warning when the year has sections")
  })
})
