// Bootstrap script. Uses the service-role key, so run it only from a trusted machine.
//
//   npm run seed            -> creates the first super admin
//   npm run seed -- --demo  -> also creates two demo schools with one user per role
//
// Env: SEED_SUPER_ADMIN_EMAIL, SEED_SUPER_ADMIN_PASSWORD (plus the Supabase keys).
import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const superEmail = process.env.SEED_SUPER_ADMIN_EMAIL
const superPassword = process.env.SEED_SUPER_ADMIN_PASSWORD
const demo = process.argv.includes("--demo")
const DEMO_PASSWORD = "Demo-pass-123"

if (!url || !key || !superEmail || !superPassword) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD.")
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function ensureUser({ email, password, firstName, lastName, role, schoolId }) {
  const { data: existing } = await db.from("profiles").select("id").eq("email", email).maybeSingle()
  if (existing) {
    console.log(`  = ${email} already exists`)
    return
  }
  const { error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName },
    // app_metadata can only be set with the service key; the database trigger reads it.
    app_metadata: { provision_role: role, provision_school_id: schoolId ?? "", provision_status: "active" },
  })
  if (error) throw new Error(`${email}: ${error.message}`)
  console.log(`  + ${email} (${role})`)
}

async function ensureSchool({ name, code, timezone, features }) {
  let { data: school } = await db.from("schools").select("*").eq("code", code).maybeSingle()
  if (!school) {
    const res = await db.from("schools").insert({ name, code, timezone, contact_email: `office@${code.toLowerCase()}.example` }).select().single()
    if (res.error) throw res.error
    school = res.data
    console.log(`+ school ${name} (${code})`)
  }
  for (const feature_key of features) {
    await db.from("school_features").update({ enabled: true }).eq("school_id", school.id).eq("feature_key", feature_key)
  }
  return school
}

console.log("Super admin")
await ensureUser({ email: superEmail, password: superPassword, firstName: "Platform", lastName: "Admin", role: "super_admin" })

if (demo) {
  // Two schools with DIFFERENT structures, same codebase: configuration only.
  const schools = [
    { name: "Northfield Academy", code: "NORTH", timezone: "Asia/Manila", features: ["sms", "parent_portal"],
      grades: ["Kinder", "Grade 1", "Grade 2", "Grade 3"] },
    { name: "Southridge High School", code: "SOUTH", timezone: "Asia/Manila", features: [],
      grades: ["Nursery", "Kinder", ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)] },
  ]
  for (const s of schools) {
    const school = await ensureSchool(s)
    const slug = s.code.toLowerCase()
    for (const role of ["school_admin", "teacher", "student", "parent"]) {
      const label = role === "school_admin" ? "admin" : role
      await ensureUser({
        email: `${label}@${slug}.example`,
        password: DEMO_PASSWORD,
        firstName: label.charAt(0).toUpperCase() + label.slice(1),
        lastName: s.code.charAt(0) + s.code.slice(1).toLowerCase(),
        role,
        schoolId: school.id,
      })
    }
    await seedStructure(school, s, slug)
  }
  console.log(`\nDemo users use the password ${DEMO_PASSWORD}`)
}
console.log("Done.")

/** Phase 2 demo structure. Skipped if the school already has academic years. */
async function seedStructure(school, s, slug) {
  const { count } = await db.from("academic_years").select("id", { count: "exact", head: true }).eq("school_id", school.id)
  if (count) {
    console.log(`  = ${s.code} structure already exists`)
    return
  }
  const one = async (table, row) => {
    const { data, error } = await db.from(table).insert(row).select().single()
    if (error) throw new Error(`${table}: ${error.message}`)
    return data
  }
  const userId = async (email) => (await db.from("profiles").select("user_id").eq("email", email).single()).data.user_id
  const id = school.id

  const past = await one("academic_years", { school_id: id, name: "2025-2026", start_date: "2025-06-01", end_date: "2026-03-31", status: "active" })
  const current = await one("academic_years", { school_id: id, name: "2026-2027", start_date: "2026-06-01", end_date: "2027-03-31", status: "active", is_current: true })
  const grades = []
  for (const [i, name] of s.grades.entries()) {
    grades.push(await one("grade_levels", { school_id: id, name, code: name.replace(/[^A-Za-z0-9]/g, "").slice(0, 20).toUpperCase(), sort_order: i }))
  }
  const subjects = []
  for (const [name, code] of [["Mathematics", "MATH"], ["Science", "SCI"], ["English", "ENG"], ["Filipino", "FIL"], ["Araling Panlipunan", "AP"], ["Physical Education", "PE"]]) {
    subjects.push(await one("subjects", { school_id: id, name, code }))
  }
  const maria = await one("teachers", { school_id: id, user_id: await userId(`teacher@${slug}.example`), employee_number: "T-0001", first_name: "Maria", last_name: "Santos", email: `teacher@${slug}.example`, specialization: "Mathematics" })
  const jose = await one("teachers", { school_id: id, employee_number: "T-0002", first_name: "Jose", last_name: "Reyes", specialization: "Science" })

  const [gA, gB] = [grades[1], grades[2]]
  const pastSection = await one("sections", { school_id: id, academic_year_id: past.id, grade_level_id: gA.id, name: "A", capacity: 30, adviser_teacher_id: jose.id })
  const secA = await one("sections", { school_id: id, academic_year_id: current.id, grade_level_id: gB.id, name: "A", capacity: 30, room: "101", adviser_teacher_id: maria.id })
  const secB = await one("sections", { school_id: id, academic_year_id: current.id, grade_level_id: gB.id, name: "B", capacity: 30, room: "102", adviser_teacher_id: jose.id })
  for (const [teacher, subject, section] of [[maria, subjects[0], secA], [maria, subjects[0], secB], [jose, subjects[1], secA]]) {
    await one("teacher_subject_assignments", { school_id: id, academic_year_id: current.id, teacher_id: teacher.id, subject_id: subject.id, section_id: section.id })
  }

  const parent = await one("guardians", { school_id: id, user_id: await userId(`parent@${slug}.example`), first_name: "Ana", last_name: "Cruz", email: `parent@${slug}.example`, phone: "0917 000 0000" })
  const names = [["Juan", "Cruz"], ["Lia", "Cruz"], ["Paolo", "Garcia"], ["Bea", "Lim"], ["Carlo", "Tan"], ["Dina", "Uy"]]
  for (const [i, [first, last]] of names.entries()) {
    const student = await one("students", {
      school_id: id,
      user_id: i === 0 ? await userId(`student@${slug}.example`) : null,
      student_number: `2026-${String(i + 1).padStart(4, "0")}`,
      first_name: first,
      last_name: last,
      gender: i % 2 ? "female" : "male",
    })
    if (last === "Cruz") {
      await one("student_guardians", { school_id: id, student_id: student.id, guardian_id: parent.id, relationship_type: "mother", is_primary: true, can_pickup: true })
    }
    // History: last year's placement, then this year's.
    await one("student_enrollments", { school_id: id, academic_year_id: past.id, student_id: student.id, grade_level_id: gA.id, section_id: pastSection.id, enrollment_date: "2025-06-01" })
    await one("student_enrollments", { school_id: id, academic_year_id: current.id, student_id: student.id, grade_level_id: gB.id, section_id: i % 2 ? secB.id : secA.id, enrollment_date: "2026-06-01" })
  }
  const { error } = await db.rpc("archive_academic_year", { p_year_id: past.id })
  if (error) throw error
  console.log(`  + ${s.code} structure: ${s.grades.length} grade levels, 2 years, 3 sections, ${names.length} students`)
}
