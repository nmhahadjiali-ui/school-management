// Phase 5: fees, billing & payments — attacked directly through the API.
import { before, describe, test } from "node:test"
import assert from "node:assert/strict"
import { anon, buildAcademic, buildFinance, buildStructure, buildTenants, service, signedIn } from "./helpers.mjs"

let t, A, B, as, F

before(async () => {
  t = await buildTenants()
  const S = await buildAcademic(await buildStructure(t))
  A = S.A
  B = S.B
  F = await buildFinance(t, S)
  const all = { ...t.users, ...F }
  as = Object.fromEntries(await Promise.all(Object.entries(all).map(async ([k, u]) => [k, await signedIn(u.email)])))
})

const ok = (r, label) => {
  assert.equal(r.error, null, `${label}: ${r.error?.code} ${r.error?.message}`)
  return r.data
}
const fails = async (promise, label) => {
  const r = await promise
  assert.ok(r.error, `${label}: expected an error, got ${JSON.stringify(r.data)}`)
  return r.error
}
const none = async (promise, label) => {
  const r = await promise
  assert.equal(r.error, null, `${label}: ${r.error?.message}`)
  assert.deepEqual(r.data, [], label)
}
const money = (v) => Number(v).toFixed(2)
const balanceOf = async (chargeId, who = "financeA") => (await as[who].from("student_charge_balances").select("*").eq("id", chargeId).single()).data
const chargeFor = async (studentId, itemId, installment = 1) =>
  (await service.from("student_charges").select("*").eq("student_id", studentId).eq("fee_structure_item_id", itemId).eq("installment_no", installment).single()).data
const pay = (who, studentId, amount, allocations, extra = {}) =>
  as[who].rpc("record_payment", {
    p_student_id: studentId, p_amount: amount, p_method: extra.method ?? "cash", p_reference: extra.reference ?? null,
    p_payment_date: extra.date ?? "2026-10-01", p_notes: null, p_allocations: allocations, p_idempotency_key: extra.key ?? null,
  })
const FIN_TABLES = ["fee_types", "fee_structures", "fee_structure_items", "discount_types", "student_charges", "student_discounts",
  "financial_adjustments", "payments", "payment_allocations", "refunds", "receipts", "payment_transactions", "payment_webhook_events", "financial_audit_logs"]

describe("charges", () => {
  test("a fee structure generates charges; a second run creates none", async () => {
    const dry = ok(await as.financeA.rpc("generate_charges", { p_structure_id: A.structure.id, p_dry_run: true }), "dry run")
    // Grade 6 open enrollments in School A: John (G6-A), Anna (G6-B), Mark (G6-C) = 3 students x 5 charges.
    assert.deepEqual([dry.students, dry.created, dry.already_existed], [3, 15, 0])
    const first = ok(await as.financeA.rpc("generate_charges", { p_structure_id: A.structure.id }), "generate")
    assert.equal(first.created, 15)
    const again = ok(await as.financeA.rpc("generate_charges", { p_structure_id: A.structure.id }), "generate again")
    assert.deepEqual([again.created, again.already_existed], [0, 15])
    const { count } = await service.from("student_charges").select("id", { count: "exact", head: true }).eq("school_id", t.schoolA.id)
    assert.equal(count, 15, "no duplicates")
    ok(await as.financeB.rpc("generate_charges", { p_structure_id: B.structure.id }), "school B")
  })

  test("installments split to the exact cent with stepped due dates", async () => {
    const parts = await Promise.all([1, 2, 3].map((k) => chargeFor(A.student.id, A.actItem.id, k)))
    assert.deepEqual(parts.map((c) => money(c.amount)), ["333.33", "333.33", "333.34"])
    assert.deepEqual(parts.map((c) => c.due_date), ["2026-07-01", "2026-08-01", "2026-09-01"])
    assert.match(parts[0].description, /\(1\/3\)/)
  })

  test("individual charges don't touch the fee structure", async () => {
    const id = ok(await as.financeA.rpc("create_charge", { p_student_id: A.student.id, p_fee_type_id: A.labType.id, p_description: "Additional laboratory fee", p_amount: 500, p_due_date: "2026-10-30" }), "create")
    const c = (await service.from("student_charges").select("*").eq("id", id).single()).data
    assert.deepEqual([c.fee_structure_item_id, money(c.amount), c.school_id], [null, "500.00", t.schoolA.id])
    await fails(as.financeA.rpc("create_charge", { p_student_id: A.student.id, p_fee_type_id: B.labType.id, p_description: "x", p_amount: 1 }), "other school's fee type")
    await fails(as.financeA.rpc("create_charge", { p_student_id: B.student.id, p_fee_type_id: A.labType.id, p_description: "x", p_amount: 1 }), "other school's student")
    await fails(as.financeA.rpc("create_charge", { p_student_id: A.student.id, p_fee_type_id: A.labType.id, p_description: "x", p_amount: 10.005 }), "sub-cent amount")
  })

  test("charge history is permanent", async () => {
    const c = await chargeFor(A.student.id, A.tuitionItem.id)
    await fails(service.from("student_charges").update({ amount: 1 }).eq("id", c.id), "edit amount, even with the service key")
    await fails(service.from("student_charges").delete().eq("id", c.id), "delete")
    await fails(as.financeA.from("student_charges").insert({ ...c, id: undefined }), "direct insert")
  })

  test("only finance managers create charges", async () => {
    for (const who of ["staffA", "teacherA", "parentA", "studentA", "financeB"]) {
      await fails(as[who].rpc("create_charge", { p_student_id: A.student.id, p_fee_type_id: A.labType.id, p_description: "x", p_amount: 1 }), who)
    }
  })
})

describe("discounts and adjustments", () => {
  test("fixed and percentage discounts are separate records; the charge is unchanged", async () => {
    const tuition = await chargeFor(A.student.id, A.tuitionItem.id)
    const lab = await chargeFor(A.student.id, A.labItem.id)
    assert.equal(ok(await as.financeA.rpc("apply_discount", { p_charge_ids: [tuition.id], p_discount_type_id: A.sibling10.id, p_reason: "Two siblings enrolled" }), "fixed"), 1)
    assert.equal(ok(await as.financeA.rpc("apply_discount", { p_charge_ids: [lab.id], p_discount_type_id: A.half.id, p_reason: "Scholarship" }), "percentage"), 1)
    const tb = await balanceOf(tuition.id)
    assert.deepEqual([money(tb.amount), money(tb.discounts), money(tb.remaining)], ["30000.00", "1000.00", "29000.00"])
    const lb = await balanceOf(lab.id)
    assert.deepEqual([money(lb.amount), money(lb.discounts), money(lb.remaining)], ["1500.00", "750.00", "750.00"])
  })

  test("revoking a discount restores the balance and keeps the record", async () => {
    const act = await chargeFor(A.student.id, A.actItem.id, 1)
    ok(await as.financeA.rpc("apply_discount", { p_charge_ids: [act.id], p_discount_type_id: A.half.id, p_reason: "Trial" }), "apply")
    const { data: d } = await as.financeA.from("student_discounts").select("id").eq("student_charge_id", act.id).single()
    ok(await as.financeA.rpc("revoke_discount", { p_discount_id: d.id, p_reason: "Applied in error" }), "revoke")
    assert.equal(money((await balanceOf(act.id)).remaining), "333.33")
    const { data: kept } = await as.financeA.from("student_discounts").select("status, revoke_reason").eq("id", d.id).single()
    assert.deepEqual(kept, { status: "inactive", revoke_reason: "Applied in error" })
  })

  test("adjustments are audited and cannot push a charge below zero", async () => {
    const act = await chargeFor(A.student.id, A.actItem.id, 2)
    ok(await as.financeA.rpc("create_adjustment", { p_charge_id: act.id, p_type: "penalty", p_amount: 50, p_reason: "Late fee" }), "penalty")
    assert.equal(money((await balanceOf(act.id)).remaining), "383.33")
    await fails(as.financeA.rpc("create_adjustment", { p_charge_id: act.id, p_type: "waiver", p_amount: 9999, p_reason: "too much" }), "below zero")
    await fails(as.financeA.rpc("create_adjustment", { p_charge_id: act.id, p_type: "correction", p_amount: 5, p_reason: "which way?" }), "correction needs a direction")
    const { data: log } = await as.financeA.from("financial_audit_logs").select("action, reason, actor_user_id").eq("entity_id", act.id).eq("action", "adjustment.created")
    assert.deepEqual(log.map((l) => [l.reason, l.actor_user_id]), [["Late fee", F.financeA.userId]])
    await fails(service.from("financial_adjustments").update({ signed_amount: 1 }).eq("student_charge_id", act.id), "adjustments are append-only")
  })

  test("unauthorized users cannot apply discounts", async () => {
    const c = await chargeFor(A.sibling.id, A.tuitionItem.id)
    for (const who of ["staffA", "teacherA", "parentA", "financeB"]) {
      await fails(as[who].rpc("apply_discount", { p_charge_ids: [c.id], p_discount_type_id: A.sibling10.id, p_reason: "nope" }), who)
    }
  })
})

describe("payments", () => {
  test("full payment marks the charge paid and issues a numbered receipt", async () => {
    const lab = await chargeFor(A.student.id, A.labItem.id)
    const r = ok(await pay("staffA", A.student.id, 750, [{ charge_id: lab.id, amount: "750.00" }], { reference: "OR-CASH-1" }), "pay")
    assert.match(r.receipt_number, /^PR-\d{4}-000001$/)
    assert.equal((await balanceOf(lab.id)).effective_status, "paid")
  })

  test("partial and multiple payments add up; nothing is stored as a balance", async () => {
    const tuition = await chargeFor(A.student.id, A.tuitionItem.id) // 29,000 after discount
    ok(await pay("staffA", A.student.id, 10000, [{ charge_id: tuition.id, amount: 10000 }]), "1st")
    let b = await balanceOf(tuition.id)
    assert.deepEqual([money(b.paid), money(b.remaining), b.status], ["10000.00", "19000.00", "partially_paid"])
    ok(await pay("staffA", A.student.id, 10000, [{ charge_id: tuition.id, amount: 10000 }]), "2nd")
    ok(await pay("staffA", A.student.id, 9000, [{ charge_id: tuition.id, amount: 9000 }]), "3rd")
    b = await balanceOf(tuition.id)
    assert.deepEqual([money(b.paid), money(b.remaining), b.status], ["29000.00", "0.00", "paid"])
  })

  test("one payment can pay several charges", async () => {
    const [a1, a2] = await Promise.all([chargeFor(A.sibling.id, A.actItem.id, 1), chargeFor(A.sibling.id, A.labItem.id)])
    const r = ok(await pay("staffA", A.sibling.id, 1833.33, [{ charge_id: a1.id, amount: "333.33" }, { charge_id: a2.id, amount: "1500.00" }]), "multi")
    const { data } = await as.financeA.from("payment_allocations").select("amount").eq("payment_id", r.payment_id)
    assert.deepEqual(data.map((x) => money(x.amount)).sort(), ["1500.00", "333.33"])
  })

  test("overpayment becomes a credit that can be applied later", async () => {
    const [x1, x2] = await Promise.all([chargeFor(A.sibling.id, A.actItem.id, 2), chargeFor(A.sibling.id, A.actItem.id, 3)])
    const r = ok(await pay("staffA", A.sibling.id, 500, [{ charge_id: x1.id, amount: "333.33" }]), "overpay")
    assert.equal(money(r.unallocated), "166.67")
    const { data: credit } = await as.financeA.from("student_payment_credits").select("unallocated").eq("payment_id", r.payment_id).single()
    assert.equal(money(credit.unallocated), "166.67")
    ok(await as.staffA.rpc("apply_credit", { p_payment_id: r.payment_id, p_allocations: [{ charge_id: x2.id, amount: "166.67" }] }), "apply credit")
    assert.equal(money((await balanceOf(x2.id)).remaining), "166.67")
  })

  test("allocations can't exceed the payment or what a charge owes", async () => {
    const c = await chargeFor(A.other.id, A.labItem.id)
    await fails(pay("staffA", A.other.id, 100, [{ charge_id: c.id, amount: 200 }]), "more than the payment")
    await fails(pay("staffA", A.other.id, 5000, [{ charge_id: c.id, amount: 1600 }]), "more than the charge owes")
    await fails(pay("staffA", A.other.id, 100, [{ charge_id: (await chargeFor(A.student.id, A.labItem.id)).id, amount: 100 }]), "another student's charge")
    const { count } = await service.from("payments").select("id", { count: "exact", head: true }).eq("student_id", A.other.id)
    assert.equal(count, 0, "a failed payment leaves nothing behind (single transaction)")
  })

  test("a double-submitted form creates one payment", async () => {
    const c = await chargeFor(A.other.id, A.labItem.id)
    const first = ok(await pay("staffA", A.other.id, 100, [{ charge_id: c.id, amount: 100 }], { key: "form-submit-123456" }), "first")
    const second = ok(await pay("staffA", A.other.id, 100, [{ charge_id: c.id, amount: 100 }], { key: "form-submit-123456" }), "second")
    assert.equal(second.payment_id, first.payment_id)
    assert.equal(second.duplicate, true)
  })

  test("teachers, parents and students cannot record payments; online payments can't be faked", async () => {
    for (const who of ["teacherA", "parentA", "studentA", "financeB"]) await fails(pay(who, A.other.id, 1, []), who)
    await fails(pay("staffA", A.other.id, 1, [], { method: "online" }), "manual 'online' payment")
    await fails(pay("staffA", A.other.id, 1, [], { date: "2999-01-01" }), "future date")
  })

  test("a wrong payment is reversed, never edited or deleted", async () => {
    const c = await chargeFor(A.other.id, A.tuitionItem.id)
    const r = ok(await pay("staffA", A.other.id, 3000, [{ charge_id: c.id, amount: 3000 }]), "wrong payment")
    await fails(as.staffA.rpc("reverse_payment", { p_payment_id: r.payment_id, p_reason: "Wrong student" }), "staff cannot reverse")
    ok(await as.financeA.rpc("reverse_payment", { p_payment_id: r.payment_id, p_reason: "Wrong student" }), "reverse")
    const { data: p } = await as.financeA.from("payments").select("amount, status, reversal_reason").eq("id", r.payment_id).single()
    assert.deepEqual([money(p.amount), p.status, p.reversal_reason], ["3000.00", "reversed", "Wrong student"])
    assert.equal(money((await balanceOf(c.id)).remaining), "30000.00", "charge owed again")
    const { data: rec } = await as.financeA.from("receipts").select("status").eq("payment_id", r.payment_id).single()
    assert.equal(rec.status, "voided")
    await fails(as.financeA.rpc("reverse_payment", { p_payment_id: r.payment_id, p_reason: "again" }), "twice")
    await fails(service.from("payments").update({ amount: 1 }).eq("id", r.payment_id), "edit, even with the service key")
    await fails(service.from("payments").delete().eq("id", r.payment_id), "delete")
  })
})

describe("receipts", () => {
  test("numbers are unique per school and sequential; schools number independently", async () => {
    const { data: a } = await as.financeA.from("receipts").select("receipt_number").order("receipt_number")
    const nums = a.map((r) => r.receipt_number)
    assert.equal(new Set(nums).size, nums.length)
    assert.match(nums[0], /-000001$/)
    const cb = await chargeFor(B.student.id, B.labItem.id)
    const rb = ok(await pay("financeB", B.student.id, 100, [{ charge_id: cb.id, amount: 100 }]), "school B")
    assert.match(rb.receipt_number, /-000001$/, "School B starts its own sequence")
    await fails(service.from("receipts").insert({ school_id: t.schoolA.id, payment_id: (await service.from("payments").select("id").eq("school_id", t.schoolA.id).limit(1).single()).data.id, receipt_number: nums[0] }), "duplicate number")
  })

  test("receipts carry the right payment, and only the right people see them", async () => {
    const { data: r } = await as.parentA.from("receipts").select("receipt_number, payments!inner(amount, student_id)").order("receipt_number").limit(1).single()
    assert.equal(r.payments.student_id, A.student.id)
    for (const who of ["teacherA", "parentB", "studentB", "financeB"]) {
      await none(as[who].from("receipts").select("id").eq("school_id", t.schoolA.id), who)
    }
  })
})

describe("refunds", () => {
  let paymentId
  test("refunds come only from unallocated credit", async () => {
    const c = await chargeFor(A.other.id, A.actItem.id, 1)
    const r = ok(await pay("staffA", A.other.id, 1000, [{ charge_id: c.id, amount: "333.33" }]), "overpay")
    paymentId = r.payment_id
    await fails(as.staffA.rpc("request_refund", { p_payment_id: paymentId, p_amount: 700, p_reason: "Overpaid" }), "more than the credit (666.67)")
    ok(await as.staffA.rpc("request_refund", { p_payment_id: paymentId, p_amount: "666.67", p_reason: "Overpaid" }), "request")
  })

  test("approval needs permission and a second person; the payment stays intact", async () => {
    const { data: rf } = await as.financeA.from("refunds").select("id").eq("payment_id", paymentId).single()
    await fails(as.staffA.rpc("decide_refund", { p_refund_id: rf.id, p_approve: true }), "staff cannot approve")
    await fails(as.teacherA.rpc("decide_refund", { p_refund_id: rf.id, p_approve: true }), "teacher")
    ok(await as.financeA.rpc("decide_refund", { p_refund_id: rf.id, p_approve: true, p_note: "OK" }), "approve")
    ok(await as.financeA.rpc("process_refund", { p_refund_id: rf.id, p_method: "cash", p_reference: "RF-1" }), "process")
    const { data: p } = await as.financeA.from("payments").select("amount, status").eq("id", paymentId).single()
    assert.deepEqual([money(p.amount), p.status], ["1000.00", "completed"])
    const { data: led } = await as.financeA.from("student_ledger").select("entry_type, amount").eq("entity_id", rf.id)
    assert.deepEqual(led.map((l) => [l.entry_type, money(l.amount)]), [["refund", "666.67"]])
  })

  test("the requester cannot approve their own refund", async () => {
    const c = await chargeFor(A.other.id, A.actItem.id, 2)
    const r = ok(await pay("financeA", A.other.id, 400, [{ charge_id: c.id, amount: "333.33" }]), "overpay")
    const id = ok(await as.financeA.rpc("request_refund", { p_payment_id: r.payment_id, p_amount: "66.67", p_reason: "Overpaid" }), "request")
    const err = await fails(as.financeA.rpc("decide_refund", { p_refund_id: id, p_approve: true }), "self-approve")
    assert.match(err.message, /someone other than/)
  })
})

describe("ledger and balances", () => {
  test("the ledger sums to the balance (charges − discounts − payments + refunds)", async () => {
    const { data: led } = await as.financeA.from("student_ledger").select("amount").eq("student_id", A.other.id)
    const ledgerTotal = led.reduce((s, l) => s + Math.round(Number(l.amount) * 100), 0)
    const { data: ch } = await as.financeA.from("student_charge_balances").select("remaining").eq("student_id", A.other.id)
    const { data: cr } = await as.financeA.from("student_payment_credits").select("unallocated").eq("student_id", A.other.id)
    const due = ch.reduce((s, c) => s + Math.round(Number(c.remaining) * 100), 0)
    const credit = cr.reduce((s, c) => s + Math.round(Number(c.unallocated) * 100), 0)
    // Requested/approved refunds hold credit but only hit the ledger when processed.
    const { data: rf } = await as.financeA.from("refunds").select("amount").eq("student_id", A.other.id).in("status", ["requested", "approved"])
    const held = rf.reduce((s, r) => s + Math.round(Number(r.amount) * 100), 0)
    assert.equal(ledgerTotal, due - credit - held)
  })

  test("the finance overview aggregates in the database", async () => {
    const o = ok(await as.financeA.rpc("finance_overview", { p_school_id: t.schoolA.id, p_academic_year_id: A.y2026.id }), "overview")
    assert.equal(money(Number(o.total_charges) - Number(o.total_collected)), money(o.outstanding))
    const foreign = ok(await as.financeA.rpc("finance_overview", { p_school_id: t.schoolB.id }), "other school")
    assert.equal(Number(foreign.total_charges), 0, "RLS: School B totals are invisible to School A")
  })
})

describe("parent and student financial access", () => {
  test("a parent sees exactly their verified children's finances", async () => {
    const { data } = await as.parentA.from("student_charges").select("student_id")
    assert.ok(data.length > 0)
    assert.deepEqual([...new Set(data.map((c) => c.student_id))].sort(), [A.student.id, A.sibling.id].sort())
    await none(as.parentA.from("payments").select("id").eq("student_id", A.other.id), "unrelated child")
    await none(as.parentA.from("student_charge_balances").select("id").eq("student_id", B.student.id), "other school")
    await none(as.parentA.from("financial_audit_logs").select("id"), "audit trail")
  })

  test("a student sees only their own", async () => {
    const { data } = await as.studentA.from("payments").select("student_id")
    assert.ok(data.length > 0 && data.every((p) => p.student_id === A.student.id))
  })

  test("teachers have no financial access", async () => {
    for (const table of ["student_charges", "payments", "receipts", "fee_types"]) await none(as.teacherA.from(table).select("id"), table)
  })

  test("the school can turn family finance views off", async () => {
    await service.from("school_features").update({ enabled: false }).eq("school_id", t.schoolA.id).eq("feature_key", "student_finance")
    await none(as.parentA.from("student_charges").select("id"), "parent, feature off")
    await service.from("school_features").update({ enabled: true }).eq("school_id", t.schoolA.id).eq("feature_key", "student_finance")
  })
})

describe("separation of duties", () => {
  test("finance users can bill students but cannot see grades or attendance", async () => {
    const { data: s } = await as.staffA.from("students").select("id")
    assert.ok(s.length >= 3)
    for (const table of ["grade_records", "attendance_records", "guardians"]) await none(as.staffA.from(table).select("id"), table)
  })

  test("only a finance admin sets school admins' finance access", async () => {
    await fails(as.adminA.from("school_settings").update({ admin_finance_access: "view" }).eq("school_id", t.schoolA.id), "school admin")
    ok(await as.financeA.from("school_settings").update({ admin_finance_access: "none" }).eq("school_id", t.schoolA.id).select().single(), "finance admin")
    const { data: audit } = await as.financeA.from("financial_audit_logs").select("old_values, new_values, actor_user_id").eq("action", "settings.finance_changed")
    assert.deepEqual(audit.map((a) => [a.old_values.admin_finance_access, a.new_values.admin_finance_access, a.actor_user_id]), [["full", "none", F.financeA.userId]])
    await none(as.adminA.from("payments").select("id"), "school admin now has no finance access")
    await fails(pay("adminA", A.other.id, 1, []), "and cannot record payments")
    await fails(as.financeA.from("school_settings").update({ primary_color: "#000000" }).eq("school_id", t.schoolA.id), "finance admin cannot change branding")
    ok(await as.financeA.from("school_settings").update({ admin_finance_access: "full" }).eq("school_id", t.schoolA.id).select().single(), "restore")
  })
})

describe("online payments", () => {
  let tx
  test("the amount is computed by the database from the selected charges", async () => {
    const c = await chargeFor(A.student.id, A.actItem.id, 3)
    tx = ok(await as.parentA.rpc("create_payment_intent", { p_student_id: A.student.id, p_charge_ids: [c.id], p_provider: "simulator" }), "intent")
    assert.equal(money(tx.amount), "333.34")
    await fails(as.parentA.rpc("create_payment_intent", { p_student_id: A.other.id, p_charge_ids: [(await chargeFor(A.other.id, A.labItem.id)).id], p_provider: "simulator" }), "unrelated child")
    await fails(as.parentB.rpc("create_payment_intent", { p_student_id: B.student.id, p_charge_ids: [(await chargeFor(B.student.id, B.labItem.id)).id], p_provider: "simulator" }), "school without online payments")
  })

  test("browsers cannot mark a payment successful", async () => {
    for (const who of ["parentA", "financeA", "adminA"]) {
      await fails(as[who].rpc("complete_payment_transaction", { p_transaction_id: tx.transaction_id, p_status: "successful", p_verified_amount: tx.amount }), who)
      await fails(as[who].from("payment_transactions").update({ status: "successful" }).eq("id", tx.transaction_id), `${who} direct update`)
    }
  })

  test("server verification creates exactly one payment, even if repeated", async () => {
    const r1 = ok(await service.rpc("complete_payment_transaction", { p_transaction_id: tx.transaction_id, p_status: "successful", p_verified_amount: tx.amount }), "complete")
    assert.ok(r1.receipt_number)
    const r2 = ok(await service.rpc("complete_payment_transaction", { p_transaction_id: tx.transaction_id, p_status: "successful", p_verified_amount: tx.amount }), "replay")
    assert.deepEqual([r2.duplicate, r2.payment_id], [true, r1.payment_id])
    const { count } = await service.from("payments").select("id", { count: "exact", head: true }).eq("payment_transaction_id", tx.transaction_id)
    assert.equal(count, 1)
    const { data: p } = await as.parentA.from("payments").select("payment_method, amount").eq("id", r1.payment_id).single()
    assert.deepEqual([p.payment_method, money(p.amount)], ["online", "333.34"])
  })

  test("failed, cancelled and mismatched transactions never become payments", async () => {
    for (const [status, amount] of [["failed", null], ["cancelled", null], ["successful", "1.00"]]) {
      const c = await chargeFor(A.sibling.id, A.tuitionItem.id)
      const t2 = ok(await as.parentA.rpc("create_payment_intent", { p_student_id: A.sibling.id, p_charge_ids: [c.id], p_provider: "simulator" }), "intent")
      const r = ok(await service.rpc("complete_payment_transaction", { p_transaction_id: t2.transaction_id, p_status: status, p_verified_amount: amount }), status)
      assert.ok(!r.payment_id, `${status}: no payment`)
      const { data } = await service.from("payment_transactions").select("status").eq("id", t2.transaction_id).single()
      assert.equal(data.status, status === "successful" ? "failed" : status, "amount mismatch is recorded as failed")
    }
  })

  test("webhook events are recorded once; invalid signatures are rejected", async () => {
    const evt = `evt_${crypto.randomUUID()}`
    const e1 = ok(await service.rpc("record_webhook_event", { p_provider: "simulator", p_event_id: evt, p_event_type: "payment.succeeded", p_payload: {}, p_signature_valid: true, p_transaction_id: tx.transaction_id }), "first")
    assert.equal(e1.duplicate, false)
    ok(await service.rpc("finish_webhook_event", { p_event_row_id: e1.event_row_id, p_status: "processed" }), "processed")
    const e2 = ok(await service.rpc("record_webhook_event", { p_provider: "simulator", p_event_id: evt, p_event_type: "payment.succeeded", p_payload: {}, p_signature_valid: true, p_transaction_id: tx.transaction_id }), "retry")
    assert.equal(e2.duplicate, true)
    const bad = ok(await service.rpc("record_webhook_event", { p_provider: "simulator", p_event_id: `${evt}_forged`, p_event_type: "payment.succeeded", p_payload: {}, p_signature_valid: false }), "forged")
    assert.equal(bad.status, "rejected")
    for (const who of ["parentA", "staffA"]) await fails(as[who].rpc("record_webhook_event", { p_provider: "x", p_event_id: "y", p_event_type: "z", p_payload: {}, p_signature_valid: true }), who)
  })
})

describe("tenant isolation (financial tables)", () => {
  test("School A finance users cannot read any School B financial data", async () => {
    for (const table of FIN_TABLES) {
      for (const who of ["financeA", "staffA", "adminA", "parentA", "teacherA"]) {
        await none(as[who].from(table).select("id").eq("school_id", t.schoolB.id), `${who} -> B ${table}`)
      }
    }
    for (const view of ["student_charge_balances", "student_payment_credits", "student_ledger"]) {
      const { data } = await as.financeA.from(view).select("school_id").eq("school_id", t.schoolB.id)
      assert.deepEqual(data, [], view)
    }
  })

  test("anonymous users see nothing", async () => {
    for (const table of [...FIN_TABLES, "student_charge_balances", "student_ledger"]) {
      const { data } = await anon().from(table).select("*").limit(1)
      assert.deepEqual(data ?? [], [], table)
    }
  })
})
