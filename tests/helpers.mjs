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
