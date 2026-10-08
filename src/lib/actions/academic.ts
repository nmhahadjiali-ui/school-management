"use server"

import { z } from "zod"
import type { ActionResult } from "@/lib/action-result"
import { manage } from "@/lib/actions/helpers"
import { uuidSchema } from "@/lib/validations"
import {
  academicYearSchema,
  assignSectionSchema,
  assignmentSchema,
  closeEnrollmentSchema,
  enrollmentSchema,
  gradeLevelSchema,
  sectionSchema,
  subjectSchema,
  transferSchema,
} from "@/lib/validations/school"
import * as academic from "@/services/academic"
import type { RecordStatus } from "@/types/domain"

const none = z.object({})
const badId = { ok: false as const, error: "The record was not found or you do not have access to it." }
const valid = (...ids: string[]) => ids.every((id) => uuidSchema.safeParse(id).success)
const recordStatus = (s: string): s is RecordStatus => s === "active" || s === "inactive"

// --- Academic years ----------------------------------------------------------------
const YEARS = ["/academic-years", "/dashboard"]

export async function createAcademicYear(_p: ActionResult | null, fd: FormData) {
  return manage(fd, academicYearSchema, (d, ctx) => academic.createAcademicYear({ ...d, school_id: ctx.schoolId, status: "planned" }), {
    context: "createAcademicYear",
    success: "Academic year created.",
    revalidate: YEARS,
  })
}

export async function updateAcademicYear(id: string, _p: ActionResult | null, fd: FormData) {
  if (!valid(id)) return badId
  return manage(fd, academicYearSchema, (d) => academic.updateAcademicYear(id, d), {
    context: "updateAcademicYear",
    success: "Academic year saved.",
    revalidate: YEARS,
  })
}

export async function activateAcademicYear(id: string) {
  if (!valid(id)) return badId
  return manage(null, none, () => academic.updateAcademicYear(id, { status: "active" }), {
    context: "activateAcademicYear",
    success: "Academic year activated.",
    revalidate: YEARS,
  })
}

export async function setCurrentAcademicYear(id: string) {
  if (!valid(id)) return badId
  return manage(null, none, () => academic.setCurrentAcademicYear(id), {
    context: "setCurrentAcademicYear",
    success: "Current academic year updated.",
    revalidate: ["/"],
  })
}

export async function archiveAcademicYear(id: string) {
  if (!valid(id)) return badId
  return manage(null, none, () => academic.archiveAcademicYear(id), {
    context: "archiveAcademicYear",
    success: "Academic year archived. Open enrollments were marked completed.",
    revalidate: ["/"],
  })
}

// --- Grade levels ----------------------------------------------------------------------
export async function createGradeLevel(_p: ActionResult | null, fd: FormData) {
  return manage(fd, gradeLevelSchema, (d, ctx) => academic.createGradeLevel({ ...d, school_id: ctx.schoolId }), {
    context: "createGradeLevel",
    success: "Grade level created.",
    revalidate: ["/grade-levels"],
  })
}

export async function updateGradeLevel(id: string, _p: ActionResult | null, fd: FormData) {
  if (!valid(id)) return badId
  return manage(fd, gradeLevelSchema, (d) => academic.updateGradeLevel(id, d), {
    context: "updateGradeLevel",
    success: "Grade level saved.",
    revalidate: ["/grade-levels"],
  })
}

export async function setGradeLevelStatus(id: string, status: RecordStatus) {
  if (!valid(id) || !recordStatus(status)) return badId
  return manage(null, none, () => academic.updateGradeLevel(id, { status }), {
    context: "setGradeLevelStatus",
    success: status === "active" ? "Grade level reactivated." : "Grade level deactivated.",
    revalidate: ["/grade-levels"],
  })
}

// --- Subjects ------------------------------------------------------------------------------
export async function createSubject(_p: ActionResult | null, fd: FormData) {
  return manage(fd, subjectSchema, (d, ctx) => academic.createSubject({ ...d, school_id: ctx.schoolId }), {
    context: "createSubject",
    success: "Subject created.",
    revalidate: ["/subjects"],
  })
}

export async function updateSubject(id: string, _p: ActionResult | null, fd: FormData) {
  if (!valid(id)) return badId
  return manage(fd, subjectSchema, (d) => academic.updateSubject(id, d), {
    context: "updateSubject",
    success: "Subject saved.",
    revalidate: ["/subjects"],
  })
}

export async function setSubjectStatus(id: string, status: RecordStatus) {
  if (!valid(id) || !recordStatus(status)) return badId
  return manage(null, none, () => academic.updateSubject(id, { status }), {
    context: "setSubjectStatus",
    success: status === "active" ? "Subject reactivated." : "Subject deactivated.",
    revalidate: ["/subjects"],
  })
}

// --- Sections ------------------------------------------------------------------------------------
export async function createSection(_p: ActionResult | null, fd: FormData) {
  return manage(fd, sectionSchema, (d, ctx) => academic.createSection({ ...d, school_id: ctx.schoolId }), {
    context: "createSection",
    success: "Section created.",
    revalidate: ["/sections"],
  })
}

export async function updateSection(id: string, _p: ActionResult | null, fd: FormData) {
  if (!valid(id)) return badId
  // Year and grade define the section's identity (enrollments depend on them).
  const editable = sectionSchema.omit({ academic_year_id: true, grade_level_id: true })
  return manage(fd, editable, (d) => academic.updateSection(id, d), {
    context: "updateSection",
    success: "Section saved.",
    revalidate: ["/sections"],
  })
}

export async function setSectionStatus(id: string, status: RecordStatus) {
  if (!valid(id) || !recordStatus(status)) return badId
  return manage(null, none, () => academic.updateSection(id, { status }), {
    context: "setSectionStatus",
    success: status === "active" ? "Section reactivated." : "Section deactivated.",
    revalidate: ["/sections"],
  })
}

// --- Enrollments --------------------------------------------------------------------------------------
async function checkSectionFits(sectionId: string | null, yearId: string, gradeId: string): Promise<ActionResult | null> {
  if (!sectionId) return null
  const { data: section } = await academic.getSection(sectionId)
  if (!section || section.academic_year_id !== yearId || section.grade_level_id !== gradeId) {
    return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: { section_id: ["Choose a section of the selected grade level and year"] } }
  }
  return null
}

export async function enrollStudent(_p: ActionResult | null, fd: FormData) {
  return manage(
    fd,
    enrollmentSchema,
    async (d, ctx) =>
      (await checkSectionFits(d.section_id, d.academic_year_id, d.grade_level_id)) ??
      academic.createEnrollment({ ...d, school_id: ctx.schoolId, enrollment_status: "enrolled" }),
    { context: "enrollStudent", success: "Student enrolled.", revalidate: ["/enrollments", "/students", "/sections"] }
  )
}

export async function assignEnrollmentSection(enrollmentId: string, _p: ActionResult | null, fd: FormData) {
  if (!valid(enrollmentId)) return badId
  return manage(
    fd,
    assignSectionSchema,
    async (d) => {
      const { data: enr } = await academic.getEnrollment(enrollmentId)
      if (!enr) return badId
      return (await checkSectionFits(d.section_id, enr.academic_year_id, enr.grade_level_id)) ?? academic.updateEnrollment(enrollmentId, d)
    },
    { context: "assignEnrollmentSection", success: "Section assigned.", revalidate: ["/enrollments", "/students", "/sections"] }
  )
}

export async function transferStudent(enrollmentId: string, _p: ActionResult | null, fd: FormData) {
  if (!valid(enrollmentId)) return badId
  return manage(
    fd,
    transferSchema,
    async (d) => {
      const { data: enr } = await academic.getEnrollment(enrollmentId)
      if (!enr) return badId
      return (
        (await checkSectionFits(d.section_id, enr.academic_year_id, d.grade_level_id)) ??
        academic.transferEnrollment(enrollmentId, d.grade_level_id, d.section_id, d.effective_date)
      )
    },
    { context: "transferStudent", success: "Transfer recorded. The previous placement is kept in the history.", revalidate: ["/enrollments", "/students", "/sections"] }
  )
}

export async function closeEnrollment(enrollmentId: string, _p: ActionResult | null, fd: FormData) {
  if (!valid(enrollmentId)) return badId
  return manage(fd, closeEnrollmentSchema, (d) => academic.updateEnrollment(enrollmentId, d), {
    context: "closeEnrollment",
    success: "Enrollment closed.",
    revalidate: ["/enrollments", "/students", "/sections"],
  })
}

// --- Teacher assignments ---------------------------------------------------------------------------------
export async function createAssignment(_p: ActionResult | null, fd: FormData) {
  return manage(fd, assignmentSchema, (d, ctx) => academic.createAssignment({ ...d, school_id: ctx.schoolId }), {
    context: "createAssignment",
    success: "Teacher assigned.",
    revalidate: ["/assignments", "/teachers", "/sections"],
  })
}

export async function deleteAssignment(id: string) {
  if (!valid(id)) return badId
  return manage(null, none, () => academic.deleteAssignment(id), {
    context: "deleteAssignment",
    success: "Assignment removed.",
    revalidate: ["/assignments", "/teachers", "/sections"],
  })
}
