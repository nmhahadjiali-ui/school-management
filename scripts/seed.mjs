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
    await seedAcademics(school, s.code)
    await seedCommunication(school, s.code, slug)
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

/** Phase 3 demo data: grading periods & scale (different per school), schedules, attendance, grades, coursework. */
async function seedAcademics(school, code) {
  const { count } = await db.from("grading_periods").select("id", { count: "exact", head: true }).eq("school_id", school.id)
  if (count) {
    console.log(`  = ${code} academics already exist`)
    return
  }
  const one = async (table, row) => {
    const { data, error } = await db.from(table).insert(row).select().single()
    if (error) throw new Error(`${table}: ${error.message}`)
    return data
  }
  const id = school.id
  const { data: year } = await db.from("academic_years").select("*").eq("school_id", id).eq("is_current", true).single()

  // Configurable per school: quarters vs semesters, descriptor vs letter scale.
  const periods = code === "NORTH"
    ? [["1st Quarter", "Q1", "2026-06-01", "2026-08-15"], ["2nd Quarter", "Q2", "2026-08-16", "2026-10-31"], ["3rd Quarter", "Q3", "2026-11-01", "2027-01-15"], ["4th Quarter", "Q4", "2027-01-16", "2027-03-31"]]
    : [["Semester 1", "S1", "2026-06-01", "2026-10-31"], ["Semester 2", "S2", "2026-11-01", "2027-03-31"]]
  const today = new Date().toISOString().slice(0, 10)
  const periodRows = []
  for (const [i, [name, pcode, start, end]] of periods.entries()) {
    const status = end < today ? "closed" : start <= today ? "open" : "upcoming"
    periodRows.push(await one("grading_periods", { school_id: id, academic_year_id: year.id, name, code: pcode, sequence: i + 1, start_date: start, end_date: end, status }))
  }
  const scale = code === "NORTH"
    ? [["Outstanding", 90, 100, "O", true], ["Very Satisfactory", 85, 89.99, "VS", true], ["Satisfactory", 80, 84.99, "S", true], ["Fairly Satisfactory", 75, 79.99, "FS", true], ["Did Not Meet Expectations", 0, 74.99, "DNME", false]]
    : [["Excellent", 93, 100, "A", true], ["Very Good", 85, 92.99, "B", true], ["Good", 77, 84.99, "C", true], ["Passing", 70, 76.99, "D", true], ["Failing", 0, 69.99, "F", false]]
  for (const [name, min, max, eq, passing] of scale) {
    await one("grading_scales", { school_id: id, name, minimum_score: min, maximum_score: max, equivalent: eq, is_passing: passing })
  }

  const { data: loads } = await db.from("teacher_subject_assignments").select("*").eq("school_id", id).eq("academic_year_id", year.id)
  // Each class gets its own weekday at 08:00 and another at 10:00, so no teacher or section is double-booked.
  for (const [i, l] of loads.entries()) {
    for (const [day, start, end] of [[(i % 5) + 1, "08:00", "09:00"], [((i + 2) % 5) + 1, "10:00", "11:00"]]) {
      await one("class_schedules", { school_id: id, academic_year_id: year.id, section_id: l.section_id, subject_id: l.subject_id, teacher_id: l.teacher_id, day_of_week: day, start_time: start, end_time: end })
    }
  }

  // Attendance for the last 5 weekdays, every section of the year.
  const { data: sections } = await db.from("sections").select("id").eq("school_id", id).eq("academic_year_id", year.id)
  const days = []
  for (let d = 1; days.length < 5; d++) {
    const date = new Date(Date.now() - d * 864e5)
    if (date.getUTCDay() % 6 !== 0) days.push(date.toISOString().slice(0, 10))
  }
  const statuses = ["present", "present", "present", "present", "present", "present", "late", "absent"]
  for (const sec of sections) {
    const { data: enr } = await db.from("student_enrollments").select("id, student_id").eq("section_id", sec.id).eq("enrollment_status", "enrolled")
    for (const [di, date] of days.entries()) {
      const session = await one("attendance_sessions", { school_id: id, academic_year_id: year.id, section_id: sec.id, attendance_date: date })
      const rows = enr.map((e, ei) => ({ school_id: id, academic_year_id: year.id, section_id: sec.id, attendance_session_id: session.id, student_id: e.student_id, enrollment_id: e.id, status: statuses[(ei + di) % statuses.length] }))
      if (rows.length) {
        const { error } = await db.from("attendance_records").insert(rows)
        if (error) throw error
      }
    }
  }

  // Grades for the first period: approved (published) for one class, submitted for the rest.
  const first = periodRows[0]
  for (const [li, l] of loads.entries()) {
    const { data: enr } = await db.from("student_enrollments").select("id, student_id").eq("section_id", l.section_id).eq("enrollment_status", "enrolled")
    for (const [ei, e] of enr.entries()) {
      await one("grade_records", { school_id: id, academic_year_id: year.id, grading_period_id: first.id, section_id: l.section_id, enrollment_id: e.id, student_id: e.student_id, subject_id: l.subject_id, teacher_id: l.teacher_id, score: 72 + ((ei * 7 + li * 5) % 27), status: li === 0 ? "approved" : "submitted" })
    }
  }

  // Coursework: one published assignment per teaching load, due next week.
  for (const l of loads) {
    const { data: subject } = await db.from("subjects").select("name").eq("id", l.subject_id).single()
    await one("assignments", { school_id: id, academic_year_id: year.id, section_id: l.section_id, subject_id: l.subject_id, teacher_id: l.teacher_id, title: `${subject.name} practice set`, description: "Answer all items and show your solutions.", due_at: new Date(Date.now() + 6 * 864e5).toISOString() })
  }
  console.log(`  + ${code} academics: ${periodRows.length} grading periods, ${scale.length}-band scale, schedules, ${days.length} days of attendance, grades, coursework`)
}

/**
 * Phase 4 demo: NORTH has the SMS add-on and teacher announcements on;
 * SOUTH has neither (same code, different configuration). Announcements are
 * published through the real publish_announcement() path as the school admin.
 */
async function seedCommunication(school, code, slug) {
  const { count } = await db.from("announcements").select("id", { count: "exact", head: true }).eq("school_id", school.id)
  if (count) {
    console.log(`  = ${code} communication already exists`)
    return
  }
  const north = code === "NORTH"
  await db.from("school_settings").update({ sms_notifications_enabled: north, teachers_can_announce: north }).eq("school_id", school.id)
  await db.from("school_features").update({ enabled: north }).eq("school_id", school.id).eq("feature_key", "sms")
  await db.from("profiles").update({ phone: north ? "+63 917 555 0101" : "+63 917 555 0202" }).eq("email", `parent@${slug}.example`)

  const { createClient: makeClient } = await import("@supabase/supabase-js")
  const admin = makeClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { error: loginError } = await admin.auth.signInWithPassword({ email: `admin@${slug}.example`, password: DEMO_PASSWORD })
  if (loginError) throw loginError

  const { data: grade } = await db.from("sections").select("grade_level_id").eq("school_id", school.id).eq("room", "101").single()
  const items = [
    { title: "Welcome to the new school year", content: "Classes start at 7:30 AM. Please check your child's schedule in the app.", targets: [{ target_type: "school", target_id: school.id }] },
    { title: "Parent-teacher conference", content: "Conferences are on Friday afternoon. Teachers will contact you with a time slot.", priority: "high", targets: [{ target_type: "grade_level", target_id: grade.grade_level_id, roles: ["parent", "teacher"] }] },
    { title: "Science fair (draft)", content: "Details to follow.", targets: [{ target_type: "school", target_id: school.id }], draft: true },
  ]
  for (const item of items) {
    const { data: a, error } = await admin.from("announcements").insert({ school_id: school.id, title: item.title, content: item.content, priority: item.priority ?? "normal" }).select().single()
    if (error) throw error
    const { error: tErr } = await admin.from("announcement_targets").insert(item.targets.map((t) => ({ ...t, school_id: school.id, announcement_id: a.id, roles: t.roles ?? null })))
    if (tErr) throw tErr
    if (!item.draft) {
      const { error: pErr } = await admin.rpc("publish_announcement", { p_id: a.id })
      if (pErr) throw pErr
    }
  }
  await admin.auth.signOut()
  console.log(`  + ${code} communication: SMS ${north ? "enabled" : "not included"}, ${items.length} announcements (1 draft)`)
}
