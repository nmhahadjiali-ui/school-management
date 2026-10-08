// Role-aware navigation. Hiding a link is a convenience, not security:
// every destination re-checks permissions on the server and RLS applies.
import { can, type Permission } from "@/lib/auth/permissions"
import type { AppRole } from "@/types/domain"

export type NavIcon =
  | "dashboard" | "schools" | "school" | "users" | "settings" | "profile"
  | "calendar" | "layers" | "grid" | "book" | "student" | "teacher" | "family" | "enroll" | "assign" | "classes"

export type NavItem = { href: string; label: string; icon: NavIcon; permission: Permission; group?: string }

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", permission: "profile.self" },
  // Platform (super admin)
  { href: "/platform/schools", label: "Schools", icon: "schools", permission: "platform.schools.manage" },
  { href: "/platform/users", label: "Users", icon: "users", permission: "platform.users.view" },
  { href: "/platform/settings", label: "Settings", icon: "settings", permission: "platform.settings" },
  // School administration
  { href: "/academic-years", label: "Academic Years", icon: "calendar", permission: "school.records.manage", group: "Academics" },
  { href: "/grade-levels", label: "Grade Levels", icon: "layers", permission: "school.records.manage", group: "Academics" },
  { href: "/sections", label: "Sections", icon: "grid", permission: "school.records.manage", group: "Academics" },
  { href: "/subjects", label: "Subjects", icon: "book", permission: "school.records.manage", group: "Academics" },
  { href: "/enrollments", label: "Enrollments", icon: "enroll", permission: "school.records.manage", group: "Academics" },
  { href: "/assignments", label: "Teacher Assignments", icon: "assign", permission: "school.records.manage", group: "Academics" },
  { href: "/students", label: "Students", icon: "student", permission: "school.records.manage", group: "People" },
  { href: "/teachers", label: "Teachers", icon: "teacher", permission: "school.records.manage", group: "People" },
  { href: "/guardians", label: "Parents & Guardians", icon: "family", permission: "school.records.manage", group: "People" },
  { href: "/users", label: "User Accounts", icon: "users", permission: "school.users.view", group: "People" },
  { href: "/school", label: "School", icon: "school", permission: "school.view", group: "School" },
  { href: "/settings", label: "Settings", icon: "settings", permission: "school.settings.manage", group: "School" },
  // Teacher / parent
  { href: "/my-classes", label: "My Classes", icon: "classes", permission: "teacher.classes" },
  { href: "/my-children", label: "My Children", icon: "family", permission: "parent.children" },
  // Everyone
  { href: "/profile", label: "Profile", icon: "profile", permission: "profile.self" },
]

export function navForRole(role: AppRole): NavItem[] {
  return NAV_ITEMS.filter((item) => can(role, item.permission))
}
