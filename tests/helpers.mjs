// Shared helpers for the integration tests. They run against a real Supabase
// instance (local by default) so RLS policies are exercised for real.
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"

export const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
export const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
export const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
/** Base URL of a running Next.js app for HTTP tests (optional). */
export const APP_URL = process.env.TEST_APP_URL

if (!URL_ || !ANON || !SERVICE) {
  throw new Error("Tests need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY")
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(URL_) && process.env.ALLOW_REMOTE_TESTS !== "1") {
  throw new Error("Refusing to run tests against a non-local Supabase. Set ALLOW_REMOTE_TESTS=1 to override.")
}

const noPersist = { auth: { persistSession: false, autoRefreshToken: false } }

export const service = createClient(URL_, SERVICE, noPersist)
export const anon = () => createClient(URL_, ANON, noPersist)

/** Unique suffix so repeated runs never collide. */
export const RUN = (Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).toUpperCase()
export const PASSWORD = "Test-pass-123"

export async function createSchool(name, code) {
  const { data, error } = await service.from("schools").insert({ name, code }).select().single()
  if (error) throw error
  return data
}

/** Provision a user the same way the app does (app_metadata, service role). */
export async function provisionUser(label, role, schoolId) {
  const email = `${label}-${RUN}@test.local`.toLowerCase()
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: label, last_name: "Test" },
    app_metadata: { provision_role: role, provision_school_id: schoolId ?? "", provision_status: "active" },
  })
  if (error) throw error
  const { data: profile, error: pErr } = await service.from("profiles").select("*").eq("user_id", data.user.id).single()
  if (pErr) throw pErr
  return { email, userId: data.user.id, profile }
}

/** A Supabase client signed in as `email` (RLS applies). */
export async function signedIn(email) {
  const client = anon()
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw error
  return client
}

/** Session cookies exactly as the app's @supabase/ssr client would set them. */
export async function sessionCookie(email) {
  const jar = new Map()
  const client = createServerClient(URL_, ANON, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw error
  return [...jar].map(([n, v]) => `${n}=${v}`).join("; ")
}

export async function http(path, cookie) {
  return fetch(`${APP_URL}${path}`, { redirect: "manual", headers: cookie ? { cookie } : {} })
}

/**
 * Two schools (A with SMS enabled, B without) and one user per role in each,
 * plus a super admin. Used by every test file.
 */
export async function buildTenants() {
  const schoolA = await createSchool(`School A ${RUN}`, `A-${RUN}`)
  const schoolB = await createSchool(`School B ${RUN}`, `B-${RUN}`)
  const { error } = await service
    .from("school_features")
    .update({ enabled: true })
    .eq("school_id", schoolA.id)
    .eq("feature_key", "sms")
  if (error) throw error

  const users = {}
  const make = async (key, role, school) => (users[key] = await provisionUser(key, role, school?.id))
  await Promise.all([
    make("super", "super_admin", null),
    make("adminA", "school_admin", schoolA),
    make("teacherA", "teacher", schoolA),
    make("studentA", "student", schoolA),
    make("parentA", "parent", schoolA),
    make("adminB", "school_admin", schoolB),
    make("teacherB", "teacher", schoolB),
    make("studentB", "student", schoolB),
    make("parentB", "parent", schoolB),
  ])
  return { schoolA, schoolB, users }
}

const must = async (promise) => {
  const { data, error } = await promise
  if (error) throw new Error(`${error.code}: ${error.message}`)
  return data
}
export const insert = (table, row) => must(service.from(table).insert(row).select().single())

/**
 * Phase 2 school structure for both tenants (service role), linked to the
 * Phase 1 users: teacherX -> teacher record, studentX -> student record,
 * parentX -> guardian record.
 *
 * Per school: years 2025-2026 (active) and 2026-2027 (current); grades G5, G6;
 * sections G5-A (2025), G6-A and G6-B (2026, G6-B adviser = teacher);
 * subjects MATH, SCI; the linked student enrolled G5-A (2025) then G6-A (2026);
 * a second student "sibling" in G6-B; an unrelated student "other" in G6-B
 * with no guardian. The linked guardian has both the student and the sibling.
 * Teacher assignments: MATH in G6-A (+ adviser of G6-B).
 */
export async function buildStructure(t) {
  const out = {}
  for (const [key, school] of [["A", t.schoolA], ["B", t.schoolB]]) {
    const s = { school }
    const id = school.id
    s.y2025 = await insert("academic_years", { school_id: id, name: "2025-2026", start_date: "2025-06-01", end_date: "2026-03-31", status: "active" })
    s.y2026 = await insert("academic_years", { school_id: id, name: "2026-2027", start_date: "2026-06-01", end_date: "2027-03-31", status: "active", is_current: true })
    s.g5 = await insert("grade_levels", { school_id: id, name: "Grade 5", code: "G5", sort_order: 5 })
    s.g6 = await insert("grade_levels", { school_id: id, name: "Grade 6", code: "G6", sort_order: 6 })
    s.math = await insert("subjects", { school_id: id, name: "Mathematics", code: "MATH" })
    s.sci = await insert("subjects", { school_id: id, name: "Science", code: "SCI" })
    s.teacher = await insert("teachers", { school_id: id, user_id: t.users[`teacher${key}`].userId, employee_number: "EMP-001", first_name: "Maria", last_name: `Teacher${key}`, email: `maria.${key.toLowerCase()}@test.local` })
    s.teacher2 = await insert("teachers", { school_id: id, employee_number: "EMP-002", first_name: "Jose", last_name: `Teacher${key}` })
    s.g5a = await insert("sections", { school_id: id, academic_year_id: s.y2025.id, grade_level_id: s.g5.id, name: "A" })
    s.g6a = await insert("sections", { school_id: id, academic_year_id: s.y2026.id, grade_level_id: s.g6.id, name: "A", adviser_teacher_id: s.teacher2.id })
    s.g6b = await insert("sections", { school_id: id, academic_year_id: s.y2026.id, grade_level_id: s.g6.id, name: "B", adviser_teacher_id: s.teacher.id })
    s.g6c = await insert("sections", { school_id: id, academic_year_id: s.y2026.id, grade_level_id: s.g6.id, name: "C" })
    s.student = await insert("students", { school_id: id, user_id: t.users[`student${key}`].userId, student_number: "2026-0001", first_name: "John", last_name: `Doe${key}` })
    s.sibling = await insert("students", { school_id: id, student_number: "2026-0002", first_name: "Anna", last_name: `Doe${key}` })
    s.other = await insert("students", { school_id: id, student_number: "2026-0003", first_name: "Mark", last_name: `Other${key}` })
    s.loner = await insert("students", { school_id: id, student_number: "2026-0004", first_name: "Lone", last_name: `Student${key}` })
    s.guardian = await insert("guardians", { school_id: id, user_id: t.users[`parent${key}`].userId, first_name: "Maria", last_name: `Parent${key}` })
    s.guardian2 = await insert("guardians", { school_id: id, first_name: "Pedro", last_name: `Parent${key}` })
    s.link1 = await insert("student_guardians", { school_id: id, student_id: s.student.id, guardian_id: s.guardian.id, relationship_type: "mother", is_primary: true })
    s.link2 = await insert("student_guardians", { school_id: id, student_id: s.sibling.id, guardian_id: s.guardian.id, relationship_type: "mother" })
    s.link3 = await insert("student_guardians", { school_id: id, student_id: s.student.id, guardian_id: s.guardian2.id, relationship_type: "father" })
    s.enr2025 = await insert("student_enrollments", { school_id: id, academic_year_id: s.y2025.id, student_id: s.student.id, grade_level_id: s.g5.id, section_id: s.g5a.id, enrollment_date: "2025-06-01" })
    s.enr2026 = await insert("student_enrollments", { school_id: id, academic_year_id: s.y2026.id, student_id: s.student.id, grade_level_id: s.g6.id, section_id: s.g6a.id, enrollment_date: "2026-06-01" })
    s.enrSibling = await insert("student_enrollments", { school_id: id, academic_year_id: s.y2026.id, student_id: s.sibling.id, grade_level_id: s.g6.id, section_id: s.g6b.id, enrollment_date: "2026-06-01" })
    s.enrOther = await insert("student_enrollments", { school_id: id, academic_year_id: s.y2026.id, student_id: s.other.id, grade_level_id: s.g6.id, section_id: s.g6c.id, enrollment_date: "2026-06-01" })
    s.assignMath = await insert("teacher_subject_assignments", { school_id: id, academic_year_id: s.y2026.id, teacher_id: s.teacher.id, subject_id: s.math.id, section_id: s.g6a.id })
    out[key] = s
  }
  return out
}

/** Latest email to `address` in the local Mailpit inbox. */
export async function latestEmail(address) {
  const base = URL_.replace(/:\d+$/, ":54424")
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`)
    const { messages = [] } = await res.json()
    if (messages.length) {
      return (await fetch(`${base}/api/v1/message/${messages[0].ID}`)).json()
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`No email for ${address}`)
}

/** Today's date (UTC is fine: fixture schools use the default UTC time zone). */
export const today = () => new Date().toISOString().slice(0, 10)
export const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)

/**
 * Phase 3 fixtures on top of buildStructure: per school, grading periods for
 * 2026-2027 (P1 open, P2 upcoming), a MATH schedule for the teacher in G6-A,
 * and a published MATH assignment in G6-A.
 */
export async function buildAcademic(S) {
  for (const s of [S.A, S.B]) {
    const id = s.school.id
    s.p1 = await insert("grading_periods", { school_id: id, academic_year_id: s.y2026.id, name: "Term 1", code: "T1", sequence: 1, start_date: "2026-06-01", end_date: "2026-10-31", status: "open" })
    s.p2 = await insert("grading_periods", { school_id: id, academic_year_id: s.y2026.id, name: "Term 2", code: "T2", sequence: 2, start_date: "2026-11-01", end_date: "2027-03-31", status: "upcoming" })
    s.mathSchedule = await insert("class_schedules", { school_id: id, academic_year_id: s.y2026.id, section_id: s.g6a.id, subject_id: s.math.id, teacher_id: s.teacher.id, day_of_week: 1, start_time: "08:00", end_time: "09:00", room: "101" })
    s.homework = await insert("assignments", { school_id: id, academic_year_id: s.y2026.id, section_id: s.g6a.id, subject_id: s.math.id, teacher_id: s.teacher.id, title: "Fractions worksheet", due_at: new Date(Date.now() + 7 * 864e5).toISOString() })
  }
  return S
}

/**
 * Invoke a Server Action over HTTP exactly as the browser does (React's
 * encodeReply + Next-Action header). `args` = bound args then call args;
 * plain objects marked with `asForm` become FormData, others are sent as-is.
 * Requires TEST_APP_URL and a production build (.next).
 */
export const asForm = (obj) => ({ __form: obj })
let _actionClient
export async function callAction(name, args, cookie, path = "/dashboard") {
  if (!_actionClient) {
    const { createRequire } = await import("node:module")
    const require = createRequire(import.meta.url)
    const manifestPath = new URL("../.next/server/server-reference-manifest.json", import.meta.url)
    _actionClient = {
      encodeReply: require("next/dist/compiled/react-server-dom-webpack/client.node").encodeReply,
      manifest: require(manifestPath.pathname.replace(/^\/([A-Za-z]:)/, "$1")),
    }
  }
  const id = Object.entries(_actionClient.manifest.node).find(([, v]) => v.exportedName === name)?.[0]
  if (!id) throw new Error(`action ${name} not found in the build`)
  const encoded = args.map((a) => {
    if (a && typeof a === "object" && "__form" in a) {
      const fd = new FormData()
      for (const [k, v] of Object.entries(a.__form)) fd.set(k, String(v))
      return fd
    }
    return a
  })
  const res = await fetch(`${APP_URL}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { cookie, "Next-Action": id, Origin: APP_URL, Accept: "text/x-component" },
    body: await _actionClient.encodeReply(encoded),
  })
  const body = await res.text()
  const line = body.split("\n").find((l) => l.startsWith("1:"))
  return { status: res.status, redirect: res.headers.get("x-action-redirect"), result: line ? JSON.parse(line.slice(2)) : null }
}

/**
 * Phase 5 fixtures: billing enabled for both schools (online payments for A
 * only), finance users, fee types, a Grade 6 fee structure for 2026-2027, and
 * discount types. Returns { financeA, staffA, financeB } user records.
 */
export async function buildFinance(t, S) {
  const users = {
    financeA: await provisionUser("financeA", "finance_admin", t.schoolA.id),
    staffA: await provisionUser("staffA", "finance_staff", t.schoolA.id),
    financeB: await provisionUser("financeB", "finance_admin", t.schoolB.id),
  }
  for (const [key, school] of [["A", t.schoolA], ["B", t.schoolB]]) {
    const s = S[key]
    for (const [feature, on] of [["billing", true], ["online_payments", key === "A"]]) {
      await service.from("school_features").update({ enabled: on }).eq("school_id", school.id).eq("feature_key", feature)
    }
    s.tuitionType = await insert("fee_types", { school_id: school.id, name: "Tuition", code: "TUI", category: "tuition" })
    s.labType = await insert("fee_types", { school_id: school.id, name: "Laboratory", code: "LAB", category: "laboratory" })
    s.actType = await insert("fee_types", { school_id: school.id, name: "Activities", code: "ACT", category: "activity" })
    s.structure = await insert("fee_structures", { school_id: school.id, academic_year_id: s.y2026.id, name: "Grade 6 fees", grade_level_id: s.g6.id })
    s.tuitionItem = await insert("fee_structure_items", { school_id: school.id, fee_structure_id: s.structure.id, fee_type_id: s.tuitionType.id, name: "Tuition", amount: "30000.00", due_date: "2026-06-15", sequence: 1 })
    s.labItem = await insert("fee_structure_items", { school_id: school.id, fee_structure_id: s.structure.id, fee_type_id: s.labType.id, name: "Laboratory fee", amount: "1500.00", due_date: "2026-07-01", sequence: 2 })
    s.actItem = await insert("fee_structure_items", { school_id: school.id, fee_structure_id: s.structure.id, fee_type_id: s.actType.id, name: "Activities", amount: "1000.00", frequency: "monthly", installments: 3, due_date: "2026-07-01", sequence: 3 })
    s.sibling10 = await insert("discount_types", { school_id: school.id, name: "Sibling discount", code: "SIB", calculation_type: "fixed", value: "1000.00" })
    s.half = await insert("discount_types", { school_id: school.id, name: "Scholarship 50%", code: "SCH50", calculation_type: "percentage", value: "50" })
  }
  return users
}
