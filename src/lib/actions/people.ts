"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { denied, formToObject, invalid, type ActionResult } from "@/lib/action-result"
import { dbFail, manage, schoolAdmin } from "@/lib/actions/helpers"
import { getUserId } from "@/lib/auth/session"
import { uuidSchema } from "@/lib/validations"
import {
  guardianLinkSchema,
  guardianLinkUpdateSchema,
  guardianSchema,
  linkAccountSchema,
  studentSchema,
  teacherSchema,
} from "@/lib/validations/school"
import * as people from "@/services/people"
import * as invitations from "@/services/invitations"
import type { RecordType } from "@/services/people"

const none = z.object({})
const badId = { ok: false as const, error: "The record was not found or you do not have access to it." }
const valid = (...ids: string[]) => ids.every((id) => uuidSchema.safeParse(id).success)
const RECORD_PATH: Record<RecordType, string> = { teacher: "/teachers", student: "/students", guardian: "/guardians" }
const isRecordType = (t: string): t is RecordType => t in RECORD_PATH

// --- Create (then open the new profile) -----------------------------------------------
async function createAndOpen<S extends z.ZodType>(
  fd: FormData,
  schema: S,
  insert: (data: z.infer<S>, schoolId: string) => PromiseLike<{ data: { id: string } | null; error: { code?: string; message?: string } | null }>,
  path: string,
  context: string
): Promise<ActionResult> {
  const ctx = await schoolAdmin()
  if (!ctx) return denied()
  const parsed = schema.safeParse(formToObject(fd))
  if (!parsed.success) return invalid(parsed.error)
  const { data, error } = await insert(parsed.data, ctx.schoolId)
  if (error || !data) return dbFail(error, context)
  revalidatePath(path, "layout")
  redirect(`${path}/${data.id}?created=1`)
}

export async function createStudent(_p: ActionResult | null, fd: FormData) {
  return createAndOpen(fd, studentSchema, (d, schoolId) => people.createStudent({ ...d, school_id: schoolId }), "/students", "createStudent")
}

export async function createTeacher(_p: ActionResult | null, fd: FormData) {
  return createAndOpen(fd, teacherSchema, (d, schoolId) => people.createTeacher({ ...d, school_id: schoolId }), "/teachers", "createTeacher")
}

export async function createGuardian(_p: ActionResult | null, fd: FormData) {
  return createAndOpen(fd, guardianSchema, (d, schoolId) => people.createGuardian({ ...d, school_id: schoolId }), "/guardians", "createGuardian")
}

// --- Update ------------------------------------------------------------------------------
export async function updateStudent(id: string, _p: ActionResult | null, fd: FormData) {
  if (!valid(id)) return badId
  return manage(fd, studentSchema, (d) => people.updateStudent(id, d), { context: "updateStudent", success: "Student saved.", revalidate: ["/students"] })
}

export async function updateTeacher(id: string, _p: ActionResult | null, fd: FormData) {
  if (!valid(id)) return badId
  return manage(fd, teacherSchema, (d) => people.updateTeacher(id, d), { context: "updateTeacher", success: "Teacher saved.", revalidate: ["/teachers"] })
}

export async function updateGuardian(id: string, _p: ActionResult | null, fd: FormData) {
  if (!valid(id)) return badId
  return manage(fd, guardianSchema, (d) => people.updateGuardian(id, d), { context: "updateGuardian", success: "Guardian saved.", revalidate: ["/guardians"] })
}

// --- Student <-> guardian links ------------------------------------------------------------
export async function linkGuardian(_p: ActionResult | null, fd: FormData) {
  return manage(
    fd,
    guardianLinkSchema,
    async (d, ctx) => {
      if (d.is_primary) await people.clearPrimaryGuardian(d.student_id)
      return people.createGuardianLink({ ...d, school_id: ctx.schoolId })
    },
    { context: "linkGuardian", success: "Guardian linked.", revalidate: ["/students", "/guardians"] }
  )
}

export async function updateGuardianLink(linkId: string, _p: ActionResult | null, fd: FormData) {
  if (!valid(linkId)) return badId
  return manage(
    fd,
    guardianLinkUpdateSchema,
    async (d) => {
      const { data: link } = await people.getGuardianLink(linkId)
      if (!link) return badId
      if (d.is_primary) await people.clearPrimaryGuardian(link.student_id, linkId)
      return people.updateGuardianLink(linkId, d)
    },
    { context: "updateGuardianLink", success: "Relationship saved.", revalidate: ["/students", "/guardians"] }
  )
}

export async function unlinkGuardian(linkId: string) {
  if (!valid(linkId)) return badId
  return manage(null, none, () => people.deleteGuardianLink(linkId), {
    context: "unlinkGuardian",
    success: "Guardian removed from the student.",
    revalidate: ["/students", "/guardians"],
  })
}

// --- Login accounts ---------------------------------------------------------------------------
export async function linkAccount(type: RecordType, recordId: string, _p: ActionResult | null, fd: FormData) {
  if (!isRecordType(type) || !valid(recordId)) return badId
  // The database checks the account is in this school with the matching role.
  return manage(fd, linkAccountSchema, (d) => people.setRecordAccount(type, recordId, d.user_id), {
    context: "linkAccount",
    success: "Login account linked.",
    revalidate: [RECORD_PATH[type], "/users"],
  })
}

export async function unlinkAccount(type: RecordType, recordId: string) {
  if (!isRecordType(type) || !valid(recordId)) return badId
  return manage(null, none, () => people.setRecordAccount(type, recordId, null), {
    context: "unlinkAccount",
    success: "Login account unlinked. The account itself was not deleted.",
    revalidate: [RECORD_PATH[type], "/users"],
  })
}

export async function inviteAccount(type: RecordType, recordId: string): Promise<ActionResult> {
  if (!isRecordType(type) || !valid(recordId)) return badId
  const ctx = await schoolAdmin()
  if (!ctx) return denied()

  // Loaded through RLS: proves the record belongs to the admin's school.
  const loaders = { teacher: people.getTeacher, student: people.getStudent, guardian: people.getGuardian }
  const { data: record } = await loaders[type](recordId)
  if (!record || record.school_id !== ctx.schoolId) return badId
  if (record.user_id) return { ok: false, error: "This person already has a login account." }
  if (!record.email) return { ok: false, error: "Add an email address to this record before sending an invitation." }

  const h = await headers()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || h.get("origin") || `https://${h.get("host")}`
  const invitedBy = await getUserId()
  if (!invitedBy) return denied()
  const { error } = await invitations.inviteForRecord({ type, record: { ...record, email: record.email }, invitedBy, siteUrl })
  if (error) {
    const code = (error as { code?: string }).code
    const status = (error as { status?: number }).status
    if (code === "email_exists" || status === 422) {
      return { ok: false, error: "An account with this email already exists. Use “Link existing account” instead." }
    }
    return dbFail(error as { code?: string; message?: string }, "inviteAccount")
  }
  revalidatePath(RECORD_PATH[type], "layout")
  return { ok: true, message: `Invitation sent to ${record.email}. The link expires in ${invitations.INVITATION_TTL_HOURS} hours.` }
}

export async function revokeInvitation(invitationId: string): Promise<ActionResult> {
  if (!valid(invitationId)) return badId
  const ctx = await schoolAdmin()
  if (!ctx) return denied()
  const { data: inv } = await invitations.getInvitation(invitationId)
  if (!inv || inv.school_id !== ctx.schoolId) return badId
  if (inv.accepted_at) return { ok: false, error: "This invitation was already accepted." }
  const { error } = await invitations.revokeInvitation(inv)
  if (error) return dbFail(error as { code?: string; message?: string }, "revokeInvitation")
  revalidatePath("/", "layout")
  return { ok: true, message: "Invitation revoked." }
}
