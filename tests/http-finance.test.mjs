// Phase 5 over HTTP against a running build (TEST_APP_URL): finance pages per
// role, payment entry actions, receipts, CSV exports, and the online payment
// flow end-to-end through the signed webhook endpoint.
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { createHash, createHmac } from "node:crypto"
import { existsSync } from "node:fs"
import { APP_URL, buildAcademic, buildFinance, buildStructure, buildTenants, callAction, http, service, sessionCookie, signedIn } from "./helpers.mjs"

const built = existsSync(new URL("../.next/server/server-reference-manifest.json", import.meta.url))
const secret = process.env.PAYMENT_SIMULATOR_SECRET
const skip = !APP_URL ? "TEST_APP_URL not set" : !built ? "no build found (run npm run build)" : !secret ? "PAYMENT_SIMULATOR_SECRET not set" : false
let t, A, B, F, cookie

before(async () => {
  if (skip) return
  t = await buildTenants()
  const S = await buildAcademic(await buildStructure(t))
  A = S.A
  B = S.B
  F = await buildFinance(t, S)
  const fin = await signedIn(F.financeA.email)
  for (const [client, id] of [[fin, A.structure.id], [await signedIn(F.financeB.email), B.structure.id]]) {
    const { error } = await client.rpc("generate_charges", { p_structure_id: id })
    if (error) throw error
  }
  const users = { ...t.users, ...F }
  cookie = Object.fromEntries(await Promise.all(Object.entries(users).map(async ([k, u]) => [k, await sessionCookie(u.email)])))
})

const status = async (path, who) => (await http(path, who ? cookie[who] : undefined)).status
const act = (name, args, who, path) => callAction(name, args, cookie[who], path)
const chargeFor = async (studentId, itemId, inst = 1) =>
  (await service.from("student_charges").select("id, amount").eq("student_id", studentId).eq("fee_structure_item_id", itemId).eq("installment_no", inst).single()).data
const payment = (studentId, allocations, extra = {}) => ({
  student_id: studentId, amount: "1500.00", payment_method: "cash", reference_number: "", payment_date: "2026-10-01", notes: "",
  allocations, idempotency_key: `key-${crypto.randomUUID()}`, ...extra,
})
/** Transaction id from a startOnlinePayment redirect ("<url>/pay/simulator/<id>;push"). */
const txFrom = (r) => r.redirect?.split(";")[0].split("/").pop()
const webhook = (body, headers = {}) => fetch(`${APP_URL}/api/payments/webhooks/simulator`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body })
const signed = (event) => {
  const body = JSON.stringify(event)
  const ts = String(Math.floor(Date.now() / 1000))
  return { body, headers: { "x-payment-timestamp": ts, "x-payment-signature": createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex") } }
}

describe("finance pages by role", { skip }, () => {
  test("finance admins reach every finance page", async () => {
    for (const p of ["/finance", "/finance/charges", "/finance/payments", "/finance/payments/new", "/finance/refunds", "/finance/receipts", "/finance/fee-structures", `/finance/fee-structures/${A.structure.id}`, "/finance/reports", "/finance/settings", "/finance/audit", `/finance/students/${A.student.id}`, "/dashboard"]) {
      assert.equal(await status(p, "financeA"), 200, p)
    }
  })

  test("finance staff collect but cannot reach admin pages", async () => {
    for (const p of ["/finance", "/finance/payments/new", "/finance/charges"]) assert.equal(await status(p, "staffA"), 200, p)
    for (const p of ["/finance/settings", "/finance/audit"]) assert.equal(await status(p, "staffA"), 307, p)
  })

  test("teachers, parents and students are kept out of the finance area", async () => {
    for (const who of ["teacherA", "parentA", "studentA"]) assert.equal(await status("/finance", who), 307, who)
    assert.equal(await status("/finance/payments", undefined), 307, "signed out")
  })

  test("other schools' records are not found", async () => {
    const cb = await chargeFor(B.student.id, B.labItem.id)
    assert.equal(await status(`/finance/charges/${cb.id}`, "financeA"), 404)
    assert.equal(await status(`/finance/students/${B.student.id}`, "financeA"), 404)
  })

  test("parents see their own children's accounts only", async () => {
    assert.equal(await status("/fees", "parentA"), 200)
    assert.equal(await status(`/fees/${A.student.id}`, "parentA"), 200)
    assert.equal(await status(`/fees/${A.other.id}`, "parentA"), 404, "unrelated child")
    assert.equal(await status(`/fees/${B.student.id}`, "parentA"), 404, "other school")
    assert.equal(await status("/fees", "teacherA"), 307, "teacher")
  })
})

describe("payment entry over HTTP", { skip }, () => {
  let paymentId
  test("a cashier records a payment; a double submit returns the same payment", async () => {
    const lab = await chargeFor(A.student.id, A.labItem.id)
    const input = payment(A.student.id, [{ charge_id: lab.id, amount: "1500.00" }], { idempotency_key: `dbl-${crypto.randomUUID()}` })
    const first = await act("recordPayment", [input], "staffA", "/finance/payments/new")
    assert.match(first.redirect ?? "", /^\/finance\/payments\/[0-9a-f-]{36}\?recorded=1/, JSON.stringify(first.result))
    const second = await act("recordPayment", [input], "staffA", "/finance/payments/new")
    assert.equal(second.redirect, first.redirect, "same payment")
    paymentId = first.redirect.split("/")[3].split("?")[0]
    assert.equal(await status(`/finance/payments/${paymentId}`, "staffA"), 200)
  })

  test("unauthorized roles and forged input are refused", async () => {
    const tuition = await chargeFor(A.other.id, A.tuitionItem.id)
    const r1 = await act("recordPayment", [payment(A.other.id, [{ charge_id: tuition.id, amount: "1500.00" }])], "teacherA")
    assert.equal(r1.result?.ok, false)
    const foreign = await chargeFor(B.student.id, B.tuitionItem.id)
    const r2 = await act("recordPayment", [payment(A.other.id, [{ charge_id: foreign.id, amount: "1500.00" }])], "staffA")
    assert.equal(r2.result?.ok, false, "another school's charge")
    const r3 = await act("recordPayment", [payment(A.other.id, [], { payment_method: "online" })], "staffA")
    assert.equal(r3.result?.ok, false, "cannot record an 'online' payment by hand")
    const r4 = await act("recordPayment", [payment(A.other.id, [], { amount: "10.005" })], "staffA")
    assert.equal(r4.result?.ok, false, "sub-cent amount")
  })

  test("staff cannot reverse payments or change finance settings", async () => {
    const r = await act("reversePayment", [paymentId, null, { __form: { reason: "Testing" } }].map((a) => a), "staffA")
    assert.equal(r.result?.ok, false)
    const s = await act("saveFinanceSettings", [null, { __form: { currency: "USD", receipt_prefix: "X" } }], "staffA")
    assert.equal(s.result?.ok, false)
  })

  test("receipts: the family and finance users only", async () => {
    const { data: rec } = await service.from("receipts").select("id").eq("payment_id", paymentId).single()
    assert.equal(await status(`/receipts/${rec.id}`, "staffA"), 200)
    assert.equal(await status(`/receipts/${rec.id}`, "parentA"), 200)
    assert.equal(await status(`/receipts/${rec.id}`, "parentB"), 404)
    assert.equal(await status(`/receipts/${rec.id}`, "teacherA"), 307)
  })
})

describe("CSV exports", { skip }, () => {
  test("finance users only, and spreadsheet formulas are neutralised", async () => {
    const c = await chargeFor(A.sibling.id, A.labItem.id)
    const r = await act("recordPayment", [payment(A.sibling.id, [{ charge_id: c.id, amount: "100.00" }], { amount: "100.00", payment_method: "check", reference_number: "=HYPERLINK(\"http://evil\")" })], "staffA")
    assert.ok(r.redirect, JSON.stringify(r.result))
    const res = await http("/api/finance/export/payments", cookie.staffA)
    assert.equal(res.status, 200)
    assert.match(res.headers.get("content-type"), /text\/csv/)
    const csv = await res.text()
    assert.ok(csv.includes(`"'=HYPERLINK(""http://evil"")"`), "formula escaped")
    const { count } = await service.from("payments").select("id", { count: "exact", head: true }).eq("school_id", t.schoolA.id)
    assert.equal(csv.trim().split("\r\n").length - 1, count, "exactly School A's payments")
    assert.equal((await http("/api/finance/export/payments", cookie.teacherA)).status, 403)
    assert.equal((await http("/api/finance/export/payments", cookie.parentA)).status, 403)
    assert.equal((await http("/api/finance/export/payments")).status, 401)
    assert.equal((await http("/api/finance/export/secrets", cookie.staffA)).status, 404)
  })
})

describe("online payments end-to-end", { skip }, () => {
  let tx
  test("a parent starts a payment; the database prices it", async () => {
    const c = await chargeFor(A.student.id, A.actItem.id, 1)
    const r = await act("startOnlinePayment", [{ student_id: A.student.id, charge_ids: [c.id] }], "parentA", `/fees/${A.student.id}`)
    assert.match(r.redirect ?? "", /^http.*\/pay\/simulator\/[0-9a-f-]{36}(;push)?$/, JSON.stringify(r.result))
    tx = txFrom(r)
    const { data } = await service.from("payment_transactions").select("amount, status, provider_transaction_id").eq("id", tx).single()
    assert.deepEqual([Number(data.amount).toFixed(2), data.status], ["333.33", "pending"])
    assert.ok(data.provider_transaction_id)
    assert.equal(await status(`/pay/simulator/${tx}`, "parentA"), 200)
    assert.equal(await status(`/fees/payments/${tx}`, "parentA"), 200, "return page only reads the status")
  })

  test("a parent cannot pay for an unrelated child", async () => {
    const c = await chargeFor(A.other.id, A.labItem.id)
    const r = await act("startOnlinePayment", [{ student_id: A.other.id, charge_ids: [c.id] }], "parentA")
    assert.equal(r.result?.ok, false)
  })

  test("unsigned, forged and stale webhooks are rejected and change nothing", async () => {
    const event = { id: `evt_${crypto.randomUUID()}`, type: "payment.successful", transactionId: tx, providerTransactionId: "x", outcome: "successful", amount: "333.33", currency: "PHP" }
    assert.equal((await webhook(JSON.stringify(event))).status, 401, "no signature")
    const forged = signed(event)
    forged.headers["x-payment-signature"] = "0".repeat(64)
    assert.equal((await webhook(forged.body, forged.headers)).status, 401, "wrong signature")
    const s = signed(event)
    assert.equal((await webhook(s.body.replace("333.33", "1.00"), s.headers)).status, 401, "tampered body")
    const stale = signed(event)
    const old = String(Math.floor(Date.now() / 1000) - 3600)
    stale.headers["x-payment-timestamp"] = old
    stale.headers["x-payment-signature"] = createHmac("sha256", secret).update(`${old}.${stale.body}`).digest("hex")
    assert.equal((await webhook(stale.body, stale.headers)).status, 401, "replayed old event")
    const { data } = await service.from("payment_transactions").select("status").eq("id", tx).single()
    assert.equal(data.status, "pending")
    // Rejections are recorded under a hash of the body: the unsigned, forged and
    // stale requests carried the same body (one row, 3 attempts); the tampered one its own.
    const hash = (body) => `rejected:${createHash("sha256").update(body).digest("hex")}`
    const { data: rows } = await service.from("payment_webhook_events").select("event_id, status, attempts, signature_valid")
      .in("event_id", [hash(JSON.stringify(event)), hash(s.body.replace("333.33", "1.00"))])
    const byId = Object.fromEntries(rows.map((r) => [r.event_id, r]))
    assert.deepEqual(byId[hash(JSON.stringify(event))] && [byId[hash(JSON.stringify(event))].status, byId[hash(JSON.stringify(event))].attempts, byId[hash(JSON.stringify(event))].signature_valid], ["rejected", 3, false])
    assert.equal(byId[hash(s.body.replace("333.33", "1.00"))]?.status, "rejected")
  })

  test("the provider's signed confirmation records exactly one payment", async () => {
    const r = await act("simulateCheckout", [tx, "successful"], "parentA", `/pay/simulator/${tx}`)
    assert.equal(r.redirect?.split(";")[0], `/fees/payments/${tx}`, JSON.stringify(r.result))
    const { data: p } = await service.from("payments").select("id, amount, payment_method, status").eq("payment_transaction_id", tx).single()
    assert.deepEqual([Number(p.amount).toFixed(2), p.payment_method, p.status], ["333.33", "online", "completed"])
    // The provider retries the same event: acknowledged, nothing new.
    const { data: ev } = await service.from("payment_webhook_events").select("event_id, payload").eq("transaction_id", tx).eq("status", "processed").single()
    const again = signed(ev.payload)
    const res = await webhook(again.body, again.headers)
    assert.equal(res.status, 200)
    assert.equal((await res.json()).duplicate, true)
    const { count } = await service.from("payments").select("id", { count: "exact", head: true }).eq("payment_transaction_id", tx)
    assert.equal(count, 1)
    // A later, different "success" event for the same transaction cannot create a second payment either.
    const other = signed({ ...ev.payload, id: `evt_${crypto.randomUUID()}` })
    assert.equal((await webhook(other.body, other.headers)).status, 200)
    const { count: after } = await service.from("payments").select("id", { count: "exact", head: true }).eq("payment_transaction_id", tx)
    assert.equal(after, 1)
  })

  test("a signed event with the wrong amount fails the transaction", async () => {
    const c = await chargeFor(A.sibling.id, A.tuitionItem.id)
    const r = await act("startOnlinePayment", [{ student_id: A.sibling.id, charge_ids: [c.id] }], "parentA")
    const tx2 = txFrom(r)
    const s = signed({ id: `evt_${crypto.randomUUID()}`, type: "payment.successful", transactionId: tx2, providerTransactionId: "x", outcome: "successful", amount: "1.00", currency: "PHP" })
    assert.equal((await webhook(s.body, s.headers)).status, 200)
    const { data } = await service.from("payment_transactions").select("status").eq("id", tx2).single()
    assert.equal(data.status, "failed")
    const { count } = await service.from("payments").select("id", { count: "exact", head: true }).eq("payment_transaction_id", tx2)
    assert.equal(count, 0)
  })

  test("only the student's family can drive the simulator checkout", async () => {
    const c = await chargeFor(A.sibling.id, A.labItem.id)
    const r = await act("startOnlinePayment", [{ student_id: A.sibling.id, charge_ids: [c.id] }], "parentA")
    const tx3 = txFrom(r)
    assert.ok(tx3, JSON.stringify(r.result))
    const bad = await act("simulateCheckout", [tx3, "successful"], "parentB")
    assert.equal(bad.result?.ok, false)
    assert.equal(await status(`/pay/simulator/${tx3}`, "parentB"), 404)
    const { data } = await service.from("payment_transactions").select("status").eq("id", tx3).single()
    assert.equal(data.status, "pending")
  })
})
