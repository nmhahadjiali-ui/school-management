// Pure-function checks (no database needed).
import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// utils.ts has no imports, so Node's type stripping can load it directly.
const { safeRedirectPath } = await import("../src/lib/utils.ts")

describe("safeRedirectPath (open-redirect protection)", () => {
  test("keeps in-app paths", () => {
    assert.equal(safeRedirectPath("/users?status=pending"), "/users?status=pending")
  })
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "/\t/evil.com", "", null, undefined]) {
    test(`rejects ${JSON.stringify(bad)}`, () => assert.equal(safeRedirectPath(bad), "/dashboard"))
  }
})

describe("secrets hygiene", () => {
  test("the service-role client is server-only", () => {
    const src = readFileSync(new URL("../src/lib/supabase/admin.ts", import.meta.url), "utf8")
    assert.match(src, /^import "server-only"/m)
  })
  test("the service-role key is never exposed with a NEXT_PUBLIC_ prefix", () => {
    const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8")
    assert.doesNotMatch(example, /NEXT_PUBLIC_[A-Z_]*SERVICE/)
  })
})

describe("grading templates (date arithmetic, presets)", async () => {
  const { presetPeriods, periodsToItems, itemsToPeriods, presetBands } = await import("../src/lib/grading-templates.ts")

  test("built-in presets split the year into consecutive periods covering every day", () => {
    for (const [key, n] of [["builtin:quarters", 4], ["builtin:semesters", 2], ["builtin:trimesters", 3]]) {
      const rows = presetPeriods(key, "2026-06-15", "2027-03-31")
      assert.equal(rows.length, n)
      assert.equal(rows[0].start_date, "2026-06-15")
      assert.equal(rows.at(-1).end_date, "2027-03-31")
      for (let i = 1; i < rows.length; i++) {
        const prevEnd = new Date(`${rows[i - 1].end_date}T00:00:00Z`)
        assert.equal(new Date(prevEnd.getTime() + 864e5).toISOString().slice(0, 10), rows[i].start_date, `${key} gap/overlap at ${i}`)
      }
    }
    assert.deepEqual(presetPeriods("builtin:quarters", "2026-06-15", "2027-03-31").map((r) => [r.name, r.code, r.sequence]), [["1st Quarter", "Q1", 1], ["2nd Quarter", "Q2", 2], ["3rd Quarter", "Q3", 3], ["4th Quarter", "Q4", 4]])
    assert.equal(presetPeriods("builtin:nope", "2026-06-15", "2027-03-31"), null)
  })

  test("saved periods keep their position in the year and fit another year", () => {
    const items = periodsToItems([{ name: "Term 1", code: "T1", sequence: 1, start_date: "2026-06-15", end_date: "2026-10-31" }, { name: "Term 2", code: "T2", sequence: 2, start_date: "2026-11-01", end_date: "2027-03-31" }], "2026-06-15")
    assert.deepEqual(items.map((i) => [i.start_offset, i.end_offset]), [[0, 138], [139, 289]])
    const next = itemsToPeriods(items, "2027-06-14", "2028-03-31")
    assert.deepEqual(next.rows.map((r) => [r.start_date, r.end_date]), [["2027-06-14", "2027-10-30"], ["2027-10-31", "2028-03-29"]], "same positions (2028 is a leap year)")
    const shorter = itemsToPeriods(items, "2027-06-14", "2028-02-28")
    assert.equal(shorter.rows[1].end_date, "2028-02-28", "end moved to the year's last day")
    assert.match(itemsToPeriods(items, "2027-06-14", "2027-09-30").error, /would start after this academic year ends/)
  })

  test("DepEd bands scale to the school's maximum score", () => {
    const b100 = presetBands("builtin:deped", 100)
    assert.deepEqual(b100.map((b) => [b.minimum_score, b.maximum_score, b.is_passing]), [[90, 100, true], [85, 89, true], [80, 84, true], [75, 79, true], [0, 74, false]])
    assert.deepEqual(presetBands("builtin:deped", 50).map((b) => b.minimum_score), [45, 42.5, 40, 37.5, 0])
  })
})
