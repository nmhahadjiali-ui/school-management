// Grading period / grading scale templates through the web app (TEST_APP_URL).
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { APP_URL, asForm, buildStructure, buildTenants, callAction, http, insert, service, sessionCookie } from "./helpers.mjs"

const skip = APP_URL ? false : "TEST_APP_URL not set (start the app to run HTTP tests)"
let t, A, cookie

before(async () => {
  if (skip) return
  t = await buildTenants()
  A = (await buildStructure(t)).A
  await service.from("school_features").update({ enabled: true }).in("school_id", [t.schoolA.id, t.schoolB.id]).eq("feature_key", "grades")
  cookie = Object.fromEntries(await Promise.all(["adminA", "adminB", "teacherA"].map(async (k) => [k, await sessionCookie(t.users[k].email)])))
})

const act = async (name, args, who, path = "/grading-periods") => (await callAction(name, args, cookie[who], path)).result
const periods = async (yearId) => (await service.from("grading_periods").select("name, code, sequence, start_date, end_date").eq("academic_year_id", yearId).order("sequence")).data
const bands = async (schoolId) => (await service.from("grading_scales").select("name, minimum_score, maximum_score, is_passing").eq("school_id", schoolId).order("minimum_score", { ascending: false })).data

describe("grading templates", { skip }, () => {
  test("a built-in preset creates all periods of an empty year in one click", async () => {
    const year = await insert("academic_years", { school_id: t.schoolA.id, name: `T-${Date.now() % 1e6}`, start_date: "2030-06-01", end_date: "2031-03-31", status: "planned" })
    const r = await act("applyGradingPeriodTemplate", [year.id, "builtin:quarters"], "adminA")
    assert.equal(r.ok, true, r.error)
    const rows = await periods(year.id)
    assert.deepEqual(rows.map((p) => p.code), ["Q1", "Q2", "Q3", "Q4"])
    assert.equal(rows[0].start_date, "2030-06-01")
    assert.equal(rows[3].end_date, "2031-03-31")

    const again = await act("applyGradingPeriodTemplate", [year.id, "builtin:semesters"], "adminA")
    assert.equal(again.ok, false)
    assert.match(again.error, /already has grading periods/)
    assert.equal((await periods(year.id)).length, 4)
  })

  test("save a year's periods as a template and apply it to another year", async () => {
    await insert("grading_periods", { school_id: t.schoolA.id, academic_year_id: A.y2026.id, name: "Term 1", code: "T1", sequence: 1, start_date: "2026-06-01", end_date: "2026-10-31" })
    await insert("grading_periods", { school_id: t.schoolA.id, academic_year_id: A.y2026.id, name: "Term 2", code: "T2", sequence: 2, start_date: "2026-11-01", end_date: "2027-03-31" })
    const saved = await act("saveGradingTemplate", ["grading_periods", A.y2026.id, null, asForm({ name: "Our terms" })], "adminA")
    assert.equal(saved.ok, true, saved.error)
    const dup = await act("saveGradingTemplate", ["grading_periods", A.y2026.id, null, asForm({ name: "our TERMS" })], "adminA")
    assert.match(dup.fieldErrors.name[0], /already exists/)

    const { data: tpl } = await service.from("setup_templates").select("id, items").eq("school_id", t.schoolA.id).eq("name", "Our terms").single()
    assert.deepEqual(tpl.items.map((i) => [i.code, i.start_offset]), [["T1", 0], ["T2", 153]])
    const year = await insert("academic_years", { school_id: t.schoolA.id, name: `S-${Date.now() % 1e6}`, start_date: "2032-06-01", end_date: "2033-03-31", status: "planned" })
    assert.equal((await act("applyGradingPeriodTemplate", [year.id, tpl.id], "adminA")).ok, true)
    assert.deepEqual((await periods(year.id)).map((p) => [p.name, p.start_date, p.end_date]), [["Term 1", "2032-06-01", "2032-10-31"], ["Term 2", "2032-11-01", "2033-03-31"]])

    // Other schools can neither see nor use it.
    const yearB = await insert("academic_years", { school_id: t.schoolB.id, name: `B-${Date.now() % 1e6}`, start_date: "2032-06-01", end_date: "2033-03-31", status: "planned" })
    assert.equal((await act("applyGradingPeriodTemplate", [yearB.id, tpl.id], "adminB")).ok, false)
    assert.equal((await act("applyGradingPeriodTemplate", [year.id, "builtin:quarters"], "adminB")).ok, false, "another school's year")
    assert.equal((await act("deleteGradingTemplate", [tpl.id], "adminB")).ok, false)
    assert.ok((await service.from("setup_templates").select("id").eq("id", tpl.id).single()).data)
  })

  test("a scale template replaces the whole scale at once; saved scales can be reused", async () => {
    await insert("grading_scales", { school_id: t.schoolA.id, name: "Old band", minimum_score: 0, maximum_score: 100, is_passing: true })
    const r = await act("applyGradingScaleTemplate", ["builtin:deped"], "adminA", "/grading-scales")
    assert.equal(r.ok, true, r.error)
    assert.deepEqual((await bands(t.schoolA.id)).map((b) => [b.name, Number(b.minimum_score), Number(b.maximum_score), b.is_passing]), [
      ["Outstanding", 90, 100, true],
      ["Very Satisfactory", 85, 89, true],
      ["Satisfactory", 80, 84, true],
      ["Fairly Satisfactory", 75, 79, true],
      ["Did Not Meet Expectations", 0, 74, false],
    ])

    assert.equal((await act("saveGradingTemplate", ["grading_scales", null, null, asForm({ name: "DepEd copy" })], "adminA", "/grading-scales")).ok, true)
    const { data: tpl } = await service.from("setup_templates").select("id").eq("school_id", t.schoolA.id).eq("name", "DepEd copy").single()
    await service.from("grading_scales").delete().eq("school_id", t.schoolA.id)
    assert.equal((await act("applyGradingScaleTemplate", [tpl.id], "adminA", "/grading-scales")).ok, true)
    assert.equal((await bands(t.schoolA.id)).length, 5)
    assert.equal((await act("deleteGradingTemplate", [tpl.id], "adminA", "/grading-scales")).ok, true)
    assert.equal((await service.from("setup_templates").select("id").eq("id", tpl.id)).data.length, 0)
    assert.equal((await bands(t.schoolA.id)).length, 5, "deleting a template keeps what it created")
  })

  test("a bad template changes nothing (all or nothing)", async () => {
    const before = await bands(t.schoolA.id)
    const { data: tpl } = await service.from("setup_templates").insert({ school_id: t.schoolA.id, kind: "grading_scales", name: "Overlapping", items: [
      { name: "A", minimum_score: 50, maximum_score: 100, equivalent: null, description: null, is_passing: true },
      { name: "B", minimum_score: 0, maximum_score: 60, equivalent: null, description: null, is_passing: false },
    ] }).select("id").single()
    const r = await act("applyGradingScaleTemplate", [tpl.id], "adminA", "/grading-scales")
    assert.equal(r.ok, false)
    assert.match(r.error, /overlaps/)
    assert.deepEqual(await bands(t.schoolA.id), before)
  })

  test("teachers cannot use templates, and the pages show the buttons to admins", async () => {
    assert.equal((await act("applyGradingScaleTemplate", ["builtin:deped"], "teacherA", "/grading-scales")).ok, false)
    assert.equal((await act("saveGradingTemplate", ["grading_scales", null, null, asForm({ name: "x" })], "teacherA", "/grading-scales")).ok, false)
    const html = await (await http("/grading-scales", cookie.adminA)).text()
    assert.ok(html.includes("Use a template"))
    const year = await insert("academic_years", { school_id: t.schoolA.id, name: `P-${Date.now() % 1e6}`, start_date: "2034-06-01", end_date: "2035-03-31", status: "planned" })
    const page = await (await http(`/grading-periods?year=${year.id}`, cookie.adminA)).text()
    assert.ok(page.includes("Use a template") && page.includes("4 Quarters"))
  })
})

describe("grade level templates", { skip }, () => {
  const grades = async (schoolId) => (await service.from("grade_levels").select("name, code, sort_order").eq("school_id", schoolId).order("sort_order")).data

  test("presets add only the grade levels a school does not have yet, and can be combined", async () => {
    // School B already has Grade 5 and Grade 6 (codes G5, G6) from the fixtures, plus a renamed "grade 1".
    await insert("grade_levels", { school_id: t.schoolB.id, name: "grade 1", code: "ONE", sort_order: 1 })
    const r = await act("applyGradeLevelTemplate", ["builtin:elementary"], "adminB", "/grade-levels")
    assert.equal(r.ok, true, r.error)
    assert.match(r.message, /Added 4 grade levels; 3 you already had were kept/)
    const after = await grades(t.schoolB.id)
    assert.deepEqual(after.map((g) => g.code), ["K", "ONE", "G2", "G3", "G4", "G5", "G6"])

    const jhs = await act("applyGradeLevelTemplate", ["builtin:jhs"], "adminB", "/grade-levels")
    assert.match(jhs.message, /Added 4 grade levels\./)
    const again = await act("applyGradeLevelTemplate", ["builtin:jhs"], "adminB", "/grade-levels")
    assert.equal(again.ok, true)
    assert.match(again.message, /already has all of these/)
    assert.equal((await grades(t.schoolB.id)).length, 11)
  })

  test("save the school's grade levels as a template and reuse it", async () => {
    const saved = await act("saveGradingTemplate", ["grade_levels", null, null, asForm({ name: "B levels" })], "adminB", "/grade-levels")
    assert.equal(saved.ok, true, saved.error)
    const { data: tpl } = await service.from("setup_templates").select("id, items").eq("school_id", t.schoolB.id).eq("kind", "grade_levels").single()
    assert.equal(tpl.items.length, 11)
    assert.equal((await act("applyGradeLevelTemplate", [tpl.id], "adminA", "/grade-levels")).ok, false, "not visible to another school")
    await service.from("grade_levels").delete().eq("school_id", t.schoolB.id).eq("code", "G10")
    const r = await act("applyGradeLevelTemplate", [tpl.id], "adminB", "/grade-levels")
    assert.match(r.message, /Added 1 grade level;/)
    assert.equal((await act("applyGradeLevelTemplate", ["builtin:k12"], "teacherA", "/grade-levels")).ok, false)
    const html = await (await http("/grade-levels", cookie.adminB)).text()
    assert.ok(html.includes("Use a template") && html.includes("Complete K–12"))
  })
})

describe("subject templates", { skip }, () => {
  const subjects = async (schoolId) => (await service.from("subjects").select("name, code").eq("school_id", schoolId).order("code")).data

  test("presets add only missing subjects (Mathematics/MATH and Science/SCI exist already) and combine", async () => {
    const r = await act("applySubjectTemplate", ["builtin:jhs"], "adminA", "/subjects")
    assert.equal(r.ok, true, r.error)
    assert.match(r.message, /Added 6 subjects; 2 you already had were kept/)
    const codes = (await subjects(t.schoolA.id)).map((s) => s.code)
    for (const c of ["FIL", "ENG", "AP", "VE", "MAPEH", "TLE", "MATH", "SCI"]) assert.ok(codes.includes(c), c)
    assert.equal(codes.filter((c) => c === "MATH").length, 1)

    const elem = await act("applySubjectTemplate", ["builtin:elementary"], "adminA", "/subjects")
    assert.match(elem.message, /Added 3 subjects; 6 you already had were kept/, "GMRC, EPP, Makabansa are new")
    const { data: mapeh } = await service.from("subjects").select("description").eq("school_id", t.schoolA.id).eq("code", "MAPEH").single()
    assert.match(mapeh.description, /Music, Arts/)
  })

  test("save subjects as a template; other schools and teachers cannot use it", async () => {
    await service.from("subjects").update({ status: "inactive" }).eq("school_id", t.schoolA.id).eq("code", "TLE")
    const saved = await act("saveGradingTemplate", ["subjects", null, null, asForm({ name: "A subjects" })], "adminA", "/subjects")
    assert.equal(saved.ok, true, saved.error)
    const { data: tpl } = await service.from("setup_templates").select("id, items").eq("school_id", t.schoolA.id).eq("kind", "subjects").single()
    assert.ok(!tpl.items.some((s) => s.code === "TLE"), "inactive subjects are not saved")
    assert.equal((await act("applySubjectTemplate", [tpl.id], "adminB", "/subjects")).ok, false)
    assert.equal((await act("applySubjectTemplate", ["builtin:alive"], "teacherA", "/subjects")).ok, false)
    const r = await act("applySubjectTemplate", ["builtin:alive"], "adminB", "/subjects")
    assert.match(r.message, /Added 2 subjects\./)
    const html = await (await http("/subjects", cookie.adminA)).text()
    assert.ok(html.includes("Use a template") && html.includes("Senior High School core subjects"))
  })
})
