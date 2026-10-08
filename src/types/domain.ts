import type { Enums, Tables } from "./database"

export type AppRole = Enums<"app_role">
export type ProfileStatus = Enums<"profile_status">
export type SchoolStatus = Enums<"school_status">
export type AcademicYearStatus = Enums<"academic_year_status">
export type RecordStatus = Enums<"record_status">
export type StudentStatus = Enums<"student_status">
export type TeacherStatus = Enums<"teacher_status">
export type EnrollmentStatus = Enums<"enrollment_status">
export type Gender = Enums<"gender">
export type GuardianRelationship = Enums<"guardian_relationship">
export type GradingPeriodStatus = Enums<"grading_period_status">
export type AttendanceStatus = Enums<"attendance_status">
export type GradeStatus = Enums<"grade_status">
export type CourseworkStatus = Enums<"coursework_status">
export type SubmissionStatus = Enums<"submission_status">
export type NotificationType = Enums<"notification_type">

export type School = Tables<"schools">
export type Profile = Tables<"profiles">
export type SchoolSettings = Tables<"school_settings">
export type Feature = Tables<"features">
export type SchoolFeature = Tables<"school_features">
export type AcademicYear = Tables<"academic_years">
export type GradeLevel = Tables<"grade_levels">
export type Subject = Tables<"subjects">
export type Section = Tables<"sections">
export type Teacher = Tables<"teachers">
export type Student = Tables<"students">
export type Guardian = Tables<"guardians">
export type StudentGuardian = Tables<"student_guardians">
export type Enrollment = Tables<"student_enrollments">
export type TeacherAssignment = Tables<"teacher_subject_assignments">
export type Invitation = Tables<"invitations">
export type GradingPeriod = Tables<"grading_periods">
export type GradingScale = Tables<"grading_scales">
export type ClassSchedule = Tables<"class_schedules">
export type AttendanceSession = Tables<"attendance_sessions">
export type GradeRecord = Tables<"grade_records">
export type GradeChangeLog = Tables<"grade_change_logs">
export type Coursework = Tables<"assignments">
export type Submission = Tables<"assignment_submissions">
export type Notification = Tables<"notifications">

/** Which school record (if any) a login account is linked to. */
export type LinkedRecord = { type: "teacher" | "student" | "guardian"; id: string }

/** Shape returned by the get_my_context() RPC (shared by web and Flutter). */
export type UserContext = {
  profile: Omit<Profile, "user_id">
  school: Pick<School, "id" | "name" | "code" | "logo_url" | "timezone" | "status"> | null
  settings: Pick<SchoolSettings, "primary_color"> | null
  current_academic_year: Pick<AcademicYear, "id" | "name" | "start_date" | "end_date"> | null
  record: LinkedRecord | null
  /** Profile active AND (super admin OR school active). */
  access_active: boolean
  /** Enabled feature keys for the user's school. */
  features: string[]
}
