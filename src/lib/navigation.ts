// Role- and feature-aware navigation. Hiding a link is a convenience, not
// security: every destination re-checks permissions on the server, and RLS
// (including per-school feature flags) applies in the database.
import { can, type Permission } from "@/lib/auth/permissions"
import type { AppRole } from "@/types/domain"

export type NavIcon =
  | "dashboard" | "schools" | "school" | "users" | "settings" | "profile"
  | "calendar" | "layers" | "grid" | "book" | "student" | "teacher" | "family" | "enroll" | "assign" | "classes"
  | "clock" | "check" | "award" | "scale" | "homework" | "bell"

export type NavItem = {
  href: string
  label: string
  icon: NavIcon
  permission: Permission
  group?: string
  /** Shown only when this school feature is enabled. */
  feature?: string
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", permission: "profile.self" },
  // Platform (super admin)
  { href: "/platform/schools", label: "Schools", icon: "schools", permission: "platform.schools.manage" },
  { href: "/platform/users", label: "Users", icon: "users", permission: "platform.users.view" },
  { href: "/platform/settings", label: "Settings", icon: "settings", permission: "platform.settings" },
  // School administration: day-to-day academics
  { href: "/attendance", label: "Attendance", icon: "check", permission: "school.records.manage", group: "Academics", feature: "attendance" },
  { href: "/grades/review", label: "Grades", icon: "award", permission: "school.records.manage", group: "Academics", feature: "grades" },
  { href: "/coursework", label: "Assignments", icon: "homework", permission: "school.records.manage", group: "Academics", feature: "coursework" },
  { href: "/schedules", label: "Schedules", icon: "clock", permission: "school.records.manage", group: "Academics", feature: "schedules" },
  { href: "/enrollments", label: "Enrollments", icon: "enroll", permission: "school.records.manage", group: "Academics" },
  // School administration: setup
  { href: "/academic-years", label: "Academic Years", icon: "calendar", permission: "school.records.manage", group: "Setup" },
  { href: "/grading-periods", label: "Grading Periods", icon: "calendar", permission: "school.records.manage", group: "Setup", feature: "grades" },
  { href: "/grading-scales", label: "Grading Scales", icon: "scale", permission: "school.records.manage", group: "Setup", feature: "grades" },
  { href: "/grade-levels", label: "Grade Levels", icon: "layers", permission: "school.records.manage", group: "Setup" },
  { href: "/sections", label: "Sections", icon: "grid", permission: "school.records.manage", group: "Setup" },
  { href: "/subjects", label: "Subjects", icon: "book", permission: "school.records.manage", group: "Setup" },
  { href: "/teaching-loads", label: "Teaching Loads", icon: "assign", permission: "school.records.manage", group: "Setup" },
  // People
  { href: "/students", label: "Students", icon: "student", permission: "school.records.manage", group: "People" },
  { href: "/teachers", label: "Teachers", icon: "teacher", permission: "school.records.manage", group: "People" },
  { href: "/guardians", label: "Parents & Guardians", icon: "family", permission: "school.records.manage", group: "People" },
  { href: "/users", label: "User Accounts", icon: "users", permission: "school.users.view", group: "People" },
  { href: "/school", label: "School", icon: "school", permission: "school.view", group: "School" },
  { href: "/settings", label: "Settings", icon: "settings", permission: "school.settings.manage", group: "School" },
  // Teacher
  { href: "/my-classes", label: "My Classes", icon: "classes", permission: "teacher.classes" },
  { href: "/schedule", label: "My Schedule", icon: "clock", permission: "teacher.academics", feature: "schedules" },
  { href: "/attendance", label: "Attendance", icon: "check", permission: "teacher.academics", feature: "attendance" },
  { href: "/grades", label: "Grades", icon: "award", permission: "teacher.academics", feature: "grades" },
  { href: "/coursework", label: "Assignments", icon: "homework", permission: "teacher.academics", feature: "coursework" },
  // Student
  { href: "/schedule", label: "My Schedule", icon: "clock", permission: "student.academics", feature: "schedules" },
  { href: "/coursework", label: "Assignments", icon: "homework", permission: "student.academics", feature: "coursework" },
  // Parent
  { href: "/my-children", label: "My Children", icon: "family", permission: "parent.children" },
  // Everyone in a school
  { href: "/notifications", label: "Notifications", icon: "bell", permission: "notifications.view", feature: "notifications" },
  { href: "/profile", label: "Profile", icon: "profile", permission: "profile.self" },
]

export function navForRole(role: AppRole, features: string[] = []): NavItem[] {
  return NAV_ITEMS.filter((item) => can(role, item.permission) && (!item.feature || features.includes(item.feature)))
}
