// Application-level permission map. Used to decide what the UI offers and as a
// first server-side check in pages and actions. It is NOT the security
// boundary: Row Level Security in the database enforces every rule again.
import type { AppRole } from "@/types/domain"

export const ROLES: readonly AppRole[] = ["super_admin", "school_admin", "finance_admin", "finance_staff", "teacher", "student", "parent"]

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Platform Admin",
  school_admin: "School Admin",
  finance_admin: "Finance Admin",
  finance_staff: "Finance Staff",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent",
}

/** Roles a school admin may assign. Admin roles are granted by the platform only. */
export const SCHOOL_MEMBER_ROLES = ["teacher", "student", "parent"] as const satisfies readonly AppRole[]
/**
 * Roles a super admin may provision for a school. Finance roles are granted by
 * the platform only, so a school admin cannot create (and know the password
 * of) a finance account and bypass the school's finance-access setting.
 */
export const PROVISIONABLE_ROLES = ["school_admin", "finance_admin", "finance_staff", ...SCHOOL_MEMBER_ROLES] as const satisfies readonly AppRole[]

export type Permission =
  | "platform.dashboard"
  | "platform.schools.manage"
  | "platform.users.view"
  | "platform.settings"
  | "school.dashboard"
  | "school.view"
  | "school.manage"
  | "school.users.view"
  | "school.users.manage"
  | "school.settings.manage"
  | "school.records.manage"
  | "member.dashboard"
  | "teacher.classes"
  | "teacher.academics"
  | "student.academics"
  | "parent.children"
  | "notifications.view"
  | "profile.self"
  /** Finance area; the exact level (view / staff / admin) comes from the database. */
  | "finance.access"
  /** Own / children's fees and payments. */
  | "finance.family"

const ROLE_PERMISSIONS: Record<AppRole, readonly Permission[]> = {
  super_admin: [
    "platform.dashboard",
    "platform.schools.manage",
    "platform.users.view",
    "platform.settings",
    "profile.self",
  ],
  school_admin: [
    "school.dashboard",
    "school.view",
    "school.manage",
    "school.users.view",
    "school.users.manage",
    "school.settings.manage",
    "school.records.manage",
    "finance.access",
    "notifications.view",
    "profile.self",
  ],
  finance_admin: ["finance.access", "notifications.view", "profile.self"],
  finance_staff: ["finance.access", "notifications.view", "profile.self"],
  teacher: ["member.dashboard", "teacher.classes", "teacher.academics", "notifications.view", "profile.self"],
  student: ["member.dashboard", "student.academics", "finance.family", "notifications.view", "profile.self"],
  parent: ["member.dashboard", "parent.children", "finance.family", "notifications.view", "profile.self"],
}

export function can(role: AppRole | null | undefined, permission: Permission): boolean {
  return role ? ROLE_PERMISSIONS[role].includes(permission) : false
}

export const isSchoolMemberRole = (role: string): role is (typeof SCHOOL_MEMBER_ROLES)[number] =>
  (SCHOOL_MEMBER_ROLES as readonly string[]).includes(role)
