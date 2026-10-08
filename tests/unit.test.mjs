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
