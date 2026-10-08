// Read-only load test: N concurrent simulated users browsing role-appropriate
// pages for a fixed time. Never submits forms or changes data.
//   node --env-file=.env.hosted scripts/load-test.mjs <base-url> [users=50] [seconds=90]
import { createServerClient } from "@supabase/ssr"

const [base, usersArg = "50", secondsArg = "90"] = process.argv.slice(2)
if (!base) throw new Error("usage: load-test.mjs <base-url> [users] [seconds]")
const USERS = Number(usersArg)
const SECONDS = Number(secondsArg)
const PASSWORD = process.env.LOAD_TEST_PASSWORD ?? "Demo-pass-123"

const ROLES = {
  parent: ["/dashboard", "/fees", "/my-children", "/notifications", "/announcements"],
  student: ["/dashboard", "/schedule", "/coursework"], // /fees redirects students to their own account
  teacher: ["/dashboard", "/my-classes", "/attendance", "/grades", "/schedule"],
  admin: ["/dashboard", "/students", "/attendance", "/enrollments", "/announcements"],
  finance: ["/finance", "/finance/payments", "/finance/charges", "/finance/refunds"],
  cashier: ["/finance/payments/new", "/finance/payments", "/finance"],
}
// Realistic mix: mostly families.
const MIX = ["parent", "parent", "parent", "parent", "student", "student", "student", "teacher", "teacher", "admin", "finance", "cashier"]

async function login(email) {
  const jar = new Map()
  const c = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cs) => cs.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))) },
  })
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`${email}: ${error.message}`)
  return [...jar].map(([n, v]) => `${n}=${v}`).join("; ")
}

const cookies = {}
for (const school of ["north", "south"]) for (const role of Object.keys(ROLES)) cookies[`${role}@${school}`] = await login(`${role}@${school}.example`)

const samples = []
const errors = new Map()
const end = Date.now() + SECONDS * 1000

async function user(i) {
  const role = MIX[i % MIX.length]
  const cookie = cookies[`${role}@${i % 2 ? "south" : "north"}`]
  const pages = ROLES[role]
  let n = i
  while (Date.now() < end) {
    const path = pages[n++ % pages.length]
    const t = performance.now()
    try {
      const r = await fetch(base + path, { headers: { cookie }, redirect: "manual" })
      const body = await r.text()
      const ms = performance.now() - t
      const bad = r.status >= 500 || (r.status === 200 && /could not be loaded|Something went wrong/.test(body))
      // Only a rendered page counts: a redirect (e.g. to /login or another domain) is a failure here.
      samples.push({ path, ms, ok: !bad && r.status === 200 })
      if (bad || r.status !== 200) errors.set(`${r.status} ${path}`, (errors.get(`${r.status} ${path}`) ?? 0) + 1)
    } catch (e) {
      samples.push({ path, ms: performance.now() - t, ok: false })
      errors.set(`network ${e.cause?.code ?? e.message}`, (errors.get(`network ${e.cause?.code ?? e.message}`) ?? 0) + 1)
    }
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 1500)) // "reading" time between clicks
  }
}

const started = Date.now()
await Promise.all(Array.from({ length: USERS }, (_, i) => user(i)))
const secs = (Date.now() - started) / 1000

const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))]
const all = samples.map((s) => s.ms).sort((a, b) => a - b)
const fmt = (ms) => `${(ms / 1000).toFixed(2)}s`
console.log(`users=${USERS} duration=${secs.toFixed(0)}s requests=${samples.length} (${(samples.length / secs).toFixed(1)}/s) failed=${samples.filter((s) => !s.ok).length}`)
console.log(`latency  p50=${fmt(pct(all, 50))}  p90=${fmt(pct(all, 90))}  p95=${fmt(pct(all, 95))}  p99=${fmt(pct(all, 99))}  max=${fmt(all.at(-1))}`)
const byPath = new Map()
for (const s of samples) (byPath.get(s.path) ?? byPath.set(s.path, []).get(s.path)).push(s.ms)
console.log("\nper page (p50 / p95, count):")
for (const [p, v] of [...byPath].sort((a, b) => pct(b[1].sort((x, y) => x - y), 95) - pct(a[1].sort((x, y) => x - y), 95))) {
  v.sort((a, b) => a - b)
  console.log(`  ${p.padEnd(24)} ${fmt(pct(v, 50))} / ${fmt(pct(v, 95))}  (${v.length})`)
}
if (errors.size) console.log("\nerrors:", Object.fromEntries(errors))
