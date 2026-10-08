
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "academic_years": {
                  Row: {
                    "created_at": string,"end_date": string,"id": string,"is_current": boolean,"name": string,"school_id": string,"start_date": string,"status": Database["public"]['Enums']["academic_year_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"end_date": string,"id"?: string,"is_current"?: boolean,"name": string,"school_id": string,"start_date": string,"status"?: Database["public"]['Enums']["academic_year_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"end_date"?: string,"id"?: string,"is_current"?: boolean,"name"?: string,"school_id"?: string,"start_date"?: string,"status"?: Database["public"]['Enums']["academic_year_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "academic_years_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"assignment_submissions": {
                  Row: {
                    "academic_year_id": string,"assignment_id": string,"content": string | null,"created_at": string,"enrollment_id": string,"file_name": string | null,"file_path": string | null,"id": string,"reviewed_at": string | null,"reviewed_by": string | null,"school_id": string,"section_id": string,"status": Database["public"]['Enums']["submission_status"],"student_id": string,"submitted_at": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "academic_year_id": string,"assignment_id": string,"content"?: string | null,"created_at"?: string,"enrollment_id": string,"file_name"?: string | null,"file_path"?: string | null,"id"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"school_id": string,"section_id": string,"status"?: Database["public"]['Enums']["submission_status"],"student_id": string,"submitted_at"?: string,"updated_at"?: string
                  }
                  Update: {
                    "academic_year_id"?: string,"assignment_id"?: string,"content"?: string | null,"created_at"?: string,"enrollment_id"?: string,"file_name"?: string | null,"file_path"?: string | null,"id"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"school_id"?: string,"section_id"?: string,"status"?: Database["public"]['Enums']["submission_status"],"student_id"?: string,"submitted_at"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assignment_submissions_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "submissions_assignment_fkey"
      columns: ["school_id","academic_year_id","section_id","assignment_id"]
isOneToOne: false
      referencedRelation: "assignments"
      referencedColumns: ["school_id","academic_year_id","section_id","id"]
    },{
      foreignKeyName: "submissions_enrollment_fkey"
      columns: ["school_id","academic_year_id","section_id","enrollment_id"]
isOneToOne: false
      referencedRelation: "student_enrollments"
      referencedColumns: ["school_id","academic_year_id","section_id","id"]
    },{
      foreignKeyName: "submissions_student_fkey"
      columns: ["school_id","student_id","enrollment_id"]
isOneToOne: false
      referencedRelation: "student_enrollments"
      referencedColumns: ["school_id","student_id","id"]
    },{
      foreignKeyName: "submissions_student_ref"
      columns: ["school_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["school_id","id"]
    }
                  ]
                },"assignments": {
                  Row: {
                    "academic_year_id": string,"attachment_name": string | null,"attachment_path": string | null,"created_at": string,"created_by": string | null,"description": string | null,"due_at": string | null,"id": string,"school_id": string,"section_id": string,"status": Database["public"]['Enums']["coursework_status"],"subject_id": string,"teacher_id": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "academic_year_id": string,"attachment_name"?: string | null,"attachment_path"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_at"?: string | null,"id"?: string,"school_id": string,"section_id": string,"status"?: Database["public"]['Enums']["coursework_status"],"subject_id": string,"teacher_id": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "academic_year_id"?: string,"attachment_name"?: string | null,"attachment_path"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_at"?: string | null,"id"?: string,"school_id"?: string,"section_id"?: string,"status"?: Database["public"]['Enums']["coursework_status"],"subject_id"?: string,"teacher_id"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assignments_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assignments_section_ref"
      columns: ["school_id","academic_year_id","section_id"]
isOneToOne: false
      referencedRelation: "sections"
      referencedColumns: ["school_id","academic_year_id","id"]
    },{
      foreignKeyName: "assignments_subject_ref"
      columns: ["school_id","subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "assignments_teacher_ref"
      columns: ["school_id","teacher_id"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "assignments_teaching_fkey"
      columns: ["school_id","academic_year_id","section_id","subject_id","teacher_id"]
isOneToOne: false
      referencedRelation: "teacher_subject_assignments"
      referencedColumns: ["school_id","academic_year_id","section_id","subject_id","teacher_id"]
    }
                  ]
                },"attendance_records": {
                  Row: {
                    "academic_year_id": string,"attendance_session_id": string,"created_at": string,"enrollment_id": string,"id": string,"recorded_at": string,"recorded_by": string | null,"remarks": string | null,"school_id": string,"section_id": string,"status": Database["public"]['Enums']["attendance_status"],"student_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "academic_year_id": string,"attendance_session_id": string,"created_at"?: string,"enrollment_id": string,"id"?: string,"recorded_at"?: string,"recorded_by"?: string | null,"remarks"?: string | null,"school_id": string,"section_id": string,"status": Database["public"]['Enums']["attendance_status"],"student_id": string,"updated_at"?: string
                  }
                  Update: {
                    "academic_year_id"?: string,"attendance_session_id"?: string,"created_at"?: string,"enrollment_id"?: string,"id"?: string,"recorded_at"?: string,"recorded_by"?: string | null,"remarks"?: string | null,"school_id"?: string,"section_id"?: string,"status"?: Database["public"]['Enums']["attendance_status"],"student_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_records_enrollment_fkey"
      columns: ["school_id","academic_year_id","section_id","enrollment_id"]
isOneToOne: false
      referencedRelation: "student_enrollments"
      referencedColumns: ["school_id","academic_year_id","section_id","id"]
    },{
      foreignKeyName: "attendance_records_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_records_session_fkey"
      columns: ["school_id","academic_year_id","section_id","attendance_session_id"]
isOneToOne: false
      referencedRelation: "attendance_sessions"
      referencedColumns: ["school_id","academic_year_id","section_id","id"]
    },{
      foreignKeyName: "attendance_records_student_fkey"
      columns: ["school_id","student_id","enrollment_id"]
isOneToOne: false
      referencedRelation: "student_enrollments"
      referencedColumns: ["school_id","student_id","id"]
    },{
      foreignKeyName: "attendance_records_student_ref"
      columns: ["school_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["school_id","id"]
    }
                  ]
                },"attendance_sessions": {
                  Row: {
                    "academic_year_id": string,"attendance_date": string,"created_at": string,"created_by": string | null,"id": string,"locked_at": string | null,"locked_by": string | null,"school_id": string,"section_id": string,"session_type": Database["public"]['Enums']["attendance_session_type"],"status": Database["public"]['Enums']["attendance_session_status"],"subject_id": string | null,"teacher_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "academic_year_id": string,"attendance_date": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"locked_at"?: string | null,"locked_by"?: string | null,"school_id": string,"section_id": string,"session_type"?: Database["public"]['Enums']["attendance_session_type"],"status"?: Database["public"]['Enums']["attendance_session_status"],"subject_id"?: string | null,"teacher_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "academic_year_id"?: string,"attendance_date"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"locked_at"?: string | null,"locked_by"?: string | null,"school_id"?: string,"section_id"?: string,"session_type"?: Database["public"]['Enums']["attendance_session_type"],"status"?: Database["public"]['Enums']["attendance_session_status"],"subject_id"?: string | null,"teacher_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_sessions_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_sessions_section_fkey"
      columns: ["school_id","academic_year_id","section_id"]
isOneToOne: false
      referencedRelation: "sections"
      referencedColumns: ["school_id","academic_year_id","id"]
    },{
      foreignKeyName: "attendance_sessions_subject_fkey"
      columns: ["school_id","subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "attendance_sessions_teacher_fkey"
      columns: ["school_id","teacher_id"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["school_id","id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_user_id": string | null,"created_at": string,"entity": string,"entity_id": string | null,"id": string,"metadata": NonNullable<Json>,"school_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_user_id"?: string | null,"created_at"?: string,"entity": string,"entity_id"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"school_id": string
                  }
                  Update: {
                    "action"?: string,"actor_user_id"?: string | null,"created_at"?: string,"entity"?: string,"entity_id"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"school_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"class_schedules": {
                  Row: {
                    "academic_year_id": string,"created_at": string,"day_of_week": number,"end_time": string,"id": string,"minutes": unknown,"room": string | null,"school_id": string,"section_id": string,"start_time": string,"status": Database["public"]['Enums']["schedule_status"],"subject_id": string,"teacher_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "academic_year_id": string,"created_at"?: string,"day_of_week": number,"end_time": string,"id"?: string,"minutes"?: never,"room"?: string | null,"school_id": string,"section_id": string,"start_time": string,"status"?: Database["public"]['Enums']["schedule_status"],"subject_id": string,"teacher_id": string,"updated_at"?: string
                  }
                  Update: {
                    "academic_year_id"?: string,"created_at"?: string,"day_of_week"?: number,"end_time"?: string,"id"?: string,"minutes"?: never,"room"?: string | null,"school_id"?: string,"section_id"?: string,"start_time"?: string,"status"?: Database["public"]['Enums']["schedule_status"],"subject_id"?: string,"teacher_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "class_schedules_assignment_fkey"
      columns: ["school_id","academic_year_id","section_id","subject_id","teacher_id"]
isOneToOne: false
      referencedRelation: "teacher_subject_assignments"
      referencedColumns: ["school_id","academic_year_id","section_id","subject_id","teacher_id"]
    },{
      foreignKeyName: "class_schedules_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "class_schedules_section_ref"
      columns: ["school_id","academic_year_id","section_id"]
isOneToOne: false
      referencedRelation: "sections"
      referencedColumns: ["school_id","academic_year_id","id"]
    },{
      foreignKeyName: "class_schedules_subject_ref"
      columns: ["school_id","subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "class_schedules_teacher_ref"
      columns: ["school_id","teacher_id"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["school_id","id"]
    }
                  ]
                },"features": {
                  Row: {
                    "created_at": string,"default_enabled": boolean,"description": string | null,"id": string,"key": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"default_enabled"?: boolean,"description"?: string | null,"id"?: string,"key": string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"default_enabled"?: boolean,"description"?: string | null,"id"?: string,"key"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"grade_change_logs": {
                  Row: {
                    "changed_at": string,"changed_by": string | null,"grade_record_id": string,"id": string,"new_score": number | null,"new_status": Database["public"]['Enums']["grade_status"] | null,"old_score": number | null,"old_status": Database["public"]['Enums']["grade_status"] | null,"reason": string | null,"school_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_at"?: string,"changed_by"?: string | null,"grade_record_id": string,"id"?: string,"new_score"?: number | null,"new_status"?: Database["public"]['Enums']["grade_status"] | null,"old_score"?: number | null,"old_status"?: Database["public"]['Enums']["grade_status"] | null,"reason"?: string | null,"school_id": string
                  }
                  Update: {
                    "changed_at"?: string,"changed_by"?: string | null,"grade_record_id"?: string,"id"?: string,"new_score"?: number | null,"new_status"?: Database["public"]['Enums']["grade_status"] | null,"old_score"?: number | null,"old_status"?: Database["public"]['Enums']["grade_status"] | null,"reason"?: string | null,"school_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "grade_change_logs_grade_record_id_fkey"
      columns: ["grade_record_id"]
isOneToOne: false
      referencedRelation: "grade_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "grade_change_logs_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"grade_levels": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"name": string,"school_id": string,"sort_order": number,"status": Database["public"]['Enums']["record_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"name": string,"school_id": string,"sort_order"?: number,"status"?: Database["public"]['Enums']["record_status"],"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"name"?: string,"school_id"?: string,"sort_order"?: number,"status"?: Database["public"]['Enums']["record_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "grade_levels_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"grade_records": {
                  Row: {
                    "academic_year_id": string,"approved_at": string | null,"approved_by": string | null,"change_reason": string | null,"created_at": string,"created_by": string | null,"enrollment_id": string,"grading_period_id": string,"id": string,"locked_at": string | null,"remarks": string | null,"school_id": string,"score": number,"section_id": string,"status": Database["public"]['Enums']["grade_status"],"student_id": string,"subject_id": string,"submitted_at": string | null,"teacher_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "academic_year_id": string,"approved_at"?: string | null,"approved_by"?: string | null,"change_reason"?: string | null,"created_at"?: string,"created_by"?: string | null,"enrollment_id": string,"grading_period_id": string,"id"?: string,"locked_at"?: string | null,"remarks"?: string | null,"school_id": string,"score": number,"section_id": string,"status"?: Database["public"]['Enums']["grade_status"],"student_id": string,"subject_id": string,"submitted_at"?: string | null,"teacher_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "academic_year_id"?: string,"approved_at"?: string | null,"approved_by"?: string | null,"change_reason"?: string | null,"created_at"?: string,"created_by"?: string | null,"enrollment_id"?: string,"grading_period_id"?: string,"id"?: string,"locked_at"?: string | null,"remarks"?: string | null,"school_id"?: string,"score"?: number,"section_id"?: string,"status"?: Database["public"]['Enums']["grade_status"],"student_id"?: string,"subject_id"?: string,"submitted_at"?: string | null,"teacher_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "grade_records_assignment_fkey"
      columns: ["school_id","academic_year_id","section_id","subject_id","teacher_id"]
isOneToOne: false
      referencedRelation: "teacher_subject_assignments"
      referencedColumns: ["school_id","academic_year_id","section_id","subject_id","teacher_id"]
    },{
      foreignKeyName: "grade_records_enrollment_fkey"
      columns: ["school_id","academic_year_id","section_id","enrollment_id"]
isOneToOne: false
      referencedRelation: "student_enrollments"
      referencedColumns: ["school_id","academic_year_id","section_id","id"]
    },{
      foreignKeyName: "grade_records_period_fkey"
      columns: ["school_id","academic_year_id","grading_period_id"]
isOneToOne: false
      referencedRelation: "grading_periods"
      referencedColumns: ["school_id","academic_year_id","id"]
    },{
      foreignKeyName: "grade_records_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "grade_records_section_ref"
      columns: ["school_id","academic_year_id","section_id"]
isOneToOne: false
      referencedRelation: "sections"
      referencedColumns: ["school_id","academic_year_id","id"]
    },{
      foreignKeyName: "grade_records_student_fkey"
      columns: ["school_id","student_id","enrollment_id"]
isOneToOne: false
      referencedRelation: "student_enrollments"
      referencedColumns: ["school_id","student_id","id"]
    },{
      foreignKeyName: "grade_records_student_ref"
      columns: ["school_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "grade_records_subject_ref"
      columns: ["school_id","subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "grade_records_teacher_ref"
      columns: ["school_id","teacher_id"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["school_id","id"]
    }
                  ]
                },"grading_periods": {
                  Row: {
                    "academic_year_id": string,"code": string,"created_at": string,"end_date": string,"id": string,"name": string,"school_id": string,"sequence": number,"start_date": string,"status": Database["public"]['Enums']["grading_period_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "academic_year_id": string,"code": string,"created_at"?: string,"end_date": string,"id"?: string,"name": string,"school_id": string,"sequence": number,"start_date": string,"status"?: Database["public"]['Enums']["grading_period_status"],"updated_at"?: string
                  }
                  Update: {
                    "academic_year_id"?: string,"code"?: string,"created_at"?: string,"end_date"?: string,"id"?: string,"name"?: string,"school_id"?: string,"sequence"?: number,"start_date"?: string,"status"?: Database["public"]['Enums']["grading_period_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "grading_periods_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "grading_periods_year_fkey"
      columns: ["school_id","academic_year_id"]
isOneToOne: false
      referencedRelation: "academic_years"
      referencedColumns: ["school_id","id"]
    }
                  ]
                },"grading_scales": {
                  Row: {
                    "created_at": string,"description": string | null,"equivalent": string | null,"id": string,"is_passing": boolean,"maximum_score": number,"minimum_score": number,"name": string,"school_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"equivalent"?: string | null,"id"?: string,"is_passing"?: boolean,"maximum_score": number,"minimum_score": number,"name": string,"school_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"equivalent"?: string | null,"id"?: string,"is_passing"?: boolean,"maximum_score"?: number,"minimum_score"?: number,"name"?: string,"school_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "grading_scales_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"guardians": {
                  Row: {
                    "address": string | null,"created_at": string,"email": string | null,"first_name": string,"id": string,"last_name": string,"middle_name": string | null,"occupation": string | null,"phone": string | null,"school_id": string,"search_text": string | null,"status": Database["public"]['Enums']["record_status"],"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"created_at"?: string,"email"?: string | null,"first_name": string,"id"?: string,"last_name": string,"middle_name"?: string | null,"occupation"?: string | null,"phone"?: string | null,"school_id": string,"search_text"?: never,"status"?: Database["public"]['Enums']["record_status"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string,"email"?: string | null,"first_name"?: string,"id"?: string,"last_name"?: string,"middle_name"?: string | null,"occupation"?: string | null,"phone"?: string | null,"school_id"?: string,"search_text"?: never,"status"?: Database["public"]['Enums']["record_status"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "guardians_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"created_at": string,"email": string,"expires_at": string,"guardian_id": string | null,"id": string,"invited_by": string | null,"revoked_at": string | null,"role": Database["public"]['Enums']["app_role"],"school_id": string,"student_id": string | null,"teacher_id": string | null,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string,"email": string,"expires_at": string,"guardian_id"?: string | null,"id"?: string,"invited_by"?: string | null,"revoked_at"?: string | null,"role": Database["public"]['Enums']["app_role"],"school_id": string,"student_id"?: string | null,"teacher_id"?: string | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"guardian_id"?: string | null,"id"?: string,"invited_by"?: string | null,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"school_id"?: string,"student_id"?: string | null,"teacher_id"?: string | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_guardian_fkey"
      columns: ["school_id","guardian_id"]
isOneToOne: false
      referencedRelation: "guardians"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "invitations_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_student_fkey"
      columns: ["school_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "invitations_teacher_fkey"
      columns: ["school_id","teacher_id"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["school_id","id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "created_at": string,"data": NonNullable<Json>,"id": string,"message": string,"read_at": string | null,"recipient_user_id": string,"school_id": string,"title": string,"type": Database["public"]['Enums']["notification_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"message": string,"read_at"?: string | null,"recipient_user_id": string,"school_id": string,"title": string,"type": Database["public"]['Enums']["notification_type"]
                  }
                  Update: {
                    "created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"message"?: string,"read_at"?: string | null,"recipient_user_id"?: string,"school_id"?: string,"title"?: string,"type"?: Database["public"]['Enums']["notification_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"email": string,"first_name": string,"id": string,"last_name": string,"phone": string | null,"role": Database["public"]['Enums']["app_role"],"school_id": string | null,"status": Database["public"]['Enums']["profile_status"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"email": string,"first_name"?: string,"id"?: string,"last_name"?: string,"phone"?: string | null,"role": Database["public"]['Enums']["app_role"],"school_id"?: string | null,"status"?: Database["public"]['Enums']["profile_status"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"email"?: string,"first_name"?: string,"id"?: string,"last_name"?: string,"phone"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"school_id"?: string | null,"status"?: Database["public"]['Enums']["profile_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"school_features": {
                  Row: {
                    "configuration": NonNullable<Json>,"created_at": string,"enabled": boolean,"feature_key": string,"id": string,"school_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "configuration"?: NonNullable<Json>,"created_at"?: string,"enabled"?: boolean,"feature_key": string,"id"?: string,"school_id": string,"updated_at"?: string
                  }
                  Update: {
                    "configuration"?: NonNullable<Json>,"created_at"?: string,"enabled"?: boolean,"feature_key"?: string,"id"?: string,"school_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "school_features_feature_key_fkey"
      columns: ["feature_key"]
isOneToOne: false
      referencedRelation: "features"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "school_features_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"school_settings": {
                  Row: {
                    "attendance_edit_days": number | null,"branding": NonNullable<Json>,"created_at": string,"enforce_room_conflicts": boolean,"grade_max_score": number,"grade_passing_score": number,"id": string,"primary_color": string,"school_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attendance_edit_days"?: number | null,"branding"?: NonNullable<Json>,"created_at"?: string,"enforce_room_conflicts"?: boolean,"grade_max_score"?: number,"grade_passing_score"?: number,"id"?: string,"primary_color"?: string,"school_id": string,"updated_at"?: string
                  }
                  Update: {
                    "attendance_edit_days"?: number | null,"branding"?: NonNullable<Json>,"created_at"?: string,"enforce_room_conflicts"?: boolean,"grade_max_score"?: number,"grade_passing_score"?: number,"id"?: string,"primary_color"?: string,"school_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "school_settings_school_id_fkey"
      columns: ["school_id"]
isOneToOne: true
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"schools": {
                  Row: {
                    "address": string | null,"code": string,"contact_email": string | null,"contact_phone": string | null,"created_at": string,"id": string,"logo_url": string | null,"name": string,"status": Database["public"]['Enums']["school_status"],"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"code": string,"contact_email"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"id"?: string,"logo_url"?: string | null,"name": string,"status"?: Database["public"]['Enums']["school_status"],"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"code"?: string,"contact_email"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"id"?: string,"logo_url"?: string | null,"name"?: string,"status"?: Database["public"]['Enums']["school_status"],"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sections": {
                  Row: {
                    "academic_year_id": string,"adviser_teacher_id": string | null,"capacity": number | null,"code": string | null,"created_at": string,"grade_level_id": string,"id": string,"name": string,"room": string | null,"school_id": string,"status": Database["public"]['Enums']["record_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "academic_year_id": string,"adviser_teacher_id"?: string | null,"capacity"?: number | null,"code"?: string | null,"created_at"?: string,"grade_level_id": string,"id"?: string,"name": string,"room"?: string | null,"school_id": string,"status"?: Database["public"]['Enums']["record_status"],"updated_at"?: string
                  }
                  Update: {
                    "academic_year_id"?: string,"adviser_teacher_id"?: string | null,"capacity"?: number | null,"code"?: string | null,"created_at"?: string,"grade_level_id"?: string,"id"?: string,"name"?: string,"room"?: string | null,"school_id"?: string,"status"?: Database["public"]['Enums']["record_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sections_adviser_fkey"
      columns: ["school_id","adviser_teacher_id"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "sections_grade_level_fkey"
      columns: ["school_id","grade_level_id"]
isOneToOne: false
      referencedRelation: "grade_levels"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "sections_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sections_year_fkey"
      columns: ["school_id","academic_year_id"]
isOneToOne: false
      referencedRelation: "academic_years"
      referencedColumns: ["school_id","id"]
    }
                  ]
                },"student_enrollments": {
                  Row: {
                    "academic_year_id": string,"created_at": string,"enrollment_date": string,"enrollment_status": Database["public"]['Enums']["enrollment_status"],"exit_date": string | null,"grade_level_id": string,"id": string,"school_id": string,"section_id": string | null,"student_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "academic_year_id": string,"created_at"?: string,"enrollment_date"?: string,"enrollment_status"?: Database["public"]['Enums']["enrollment_status"],"exit_date"?: string | null,"grade_level_id": string,"id"?: string,"school_id": string,"section_id"?: string | null,"student_id": string,"updated_at"?: string
                  }
                  Update: {
                    "academic_year_id"?: string,"created_at"?: string,"enrollment_date"?: string,"enrollment_status"?: Database["public"]['Enums']["enrollment_status"],"exit_date"?: string | null,"grade_level_id"?: string,"id"?: string,"school_id"?: string,"section_id"?: string | null,"student_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_enrollments_grade_level_fkey"
      columns: ["school_id","grade_level_id"]
isOneToOne: false
      referencedRelation: "grade_levels"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "student_enrollments_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_enrollments_section_fkey"
      columns: ["school_id","academic_year_id","grade_level_id","section_id"]
isOneToOne: false
      referencedRelation: "sections"
      referencedColumns: ["school_id","academic_year_id","grade_level_id","id"]
    },{
      foreignKeyName: "student_enrollments_student_fkey"
      columns: ["school_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "student_enrollments_year_fkey"
      columns: ["school_id","academic_year_id"]
isOneToOne: false
      referencedRelation: "academic_years"
      referencedColumns: ["school_id","id"]
    }
                  ]
                },"student_guardians": {
                  Row: {
                    "can_pickup": boolean,"can_receive_notifications": boolean,"created_at": string,"guardian_id": string,"id": string,"is_primary": boolean,"relationship_type": Database["public"]['Enums']["guardian_relationship"],"school_id": string,"student_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "can_pickup"?: boolean,"can_receive_notifications"?: boolean,"created_at"?: string,"guardian_id": string,"id"?: string,"is_primary"?: boolean,"relationship_type": Database["public"]['Enums']["guardian_relationship"],"school_id": string,"student_id": string,"updated_at"?: string
                  }
                  Update: {
                    "can_pickup"?: boolean,"can_receive_notifications"?: boolean,"created_at"?: string,"guardian_id"?: string,"id"?: string,"is_primary"?: boolean,"relationship_type"?: Database["public"]['Enums']["guardian_relationship"],"school_id"?: string,"student_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_guardians_guardian_fkey"
      columns: ["school_id","guardian_id"]
isOneToOne: false
      referencedRelation: "guardians"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "student_guardians_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_guardians_student_fkey"
      columns: ["school_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["school_id","id"]
    }
                  ]
                },"students": {
                  Row: {
                    "address": string | null,"created_at": string,"date_of_birth": string | null,"email": string | null,"first_name": string,"gender": Database["public"]['Enums']["gender"] | null,"id": string,"last_name": string,"middle_name": string | null,"phone": string | null,"photo_url": string | null,"school_id": string,"search_text": string | null,"status": Database["public"]['Enums']["student_status"],"student_number": string,"suffix": string | null,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"created_at"?: string,"date_of_birth"?: string | null,"email"?: string | null,"first_name": string,"gender"?: Database["public"]['Enums']["gender"] | null,"id"?: string,"last_name": string,"middle_name"?: string | null,"phone"?: string | null,"photo_url"?: string | null,"school_id": string,"search_text"?: never,"status"?: Database["public"]['Enums']["student_status"],"student_number": string,"suffix"?: string | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string,"date_of_birth"?: string | null,"email"?: string | null,"first_name"?: string,"gender"?: Database["public"]['Enums']["gender"] | null,"id"?: string,"last_name"?: string,"middle_name"?: string | null,"phone"?: string | null,"photo_url"?: string | null,"school_id"?: string,"search_text"?: never,"status"?: Database["public"]['Enums']["student_status"],"student_number"?: string,"suffix"?: string | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "students_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"subjects": {
                  Row: {
                    "code": string,"created_at": string,"description": string | null,"id": string,"name": string,"school_id": string,"status": Database["public"]['Enums']["record_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"description"?: string | null,"id"?: string,"name": string,"school_id": string,"status"?: Database["public"]['Enums']["record_status"],"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"name"?: string,"school_id"?: string,"status"?: Database["public"]['Enums']["record_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subjects_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"teacher_subject_assignments": {
                  Row: {
                    "academic_year_id": string,"created_at": string,"id": string,"school_id": string,"section_id": string,"subject_id": string,"teacher_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "academic_year_id": string,"created_at"?: string,"id"?: string,"school_id": string,"section_id": string,"subject_id": string,"teacher_id": string,"updated_at"?: string
                  }
                  Update: {
                    "academic_year_id"?: string,"created_at"?: string,"id"?: string,"school_id"?: string,"section_id"?: string,"subject_id"?: string,"teacher_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teacher_subject_assignments_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tsa_section_fkey"
      columns: ["school_id","academic_year_id","section_id"]
isOneToOne: false
      referencedRelation: "sections"
      referencedColumns: ["school_id","academic_year_id","id"]
    },{
      foreignKeyName: "tsa_subject_fkey"
      columns: ["school_id","subject_id"]
isOneToOne: false
      referencedRelation: "subjects"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "tsa_teacher_fkey"
      columns: ["school_id","teacher_id"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "tsa_year_fkey"
      columns: ["school_id","academic_year_id"]
isOneToOne: false
      referencedRelation: "academic_years"
      referencedColumns: ["school_id","id"]
    }
                  ]
                },"teachers": {
                  Row: {
                    "created_at": string,"email": string | null,"employee_number": string | null,"first_name": string,"id": string,"last_name": string,"middle_name": string | null,"phone": string | null,"school_id": string,"search_text": string | null,"specialization": string | null,"status": Database["public"]['Enums']["teacher_status"],"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"employee_number"?: string | null,"first_name": string,"id"?: string,"last_name": string,"middle_name"?: string | null,"phone"?: string | null,"school_id": string,"search_text"?: never,"specialization"?: string | null,"status"?: Database["public"]['Enums']["teacher_status"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"employee_number"?: string | null,"first_name"?: string,"id"?: string,"last_name"?: string,"middle_name"?: string | null,"phone"?: string | null,"school_id"?: string,"search_text"?: never,"specialization"?: string | null,"status"?: Database["public"]['Enums']["teacher_status"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "teachers_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invitation":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"archive_academic_year":
{ Args: { "p_year_id": string }; Returns: undefined
                           },
"attendance_day_totals":
{ Args: { "p_date": string,"p_school_id": string }; Returns: {
              "absent": number,"excused": number,"late": number,"present": number,"sessions": number
            }[]
                           },
"attendance_section_summary":
{ Args: { "p_from": string,"p_section_id": string,"p_to": string }; Returns: {
              "absent": number,"excused": number,"first_name": string,"last_name": string,"late": number,"present": number,"student_id": string,"student_number": string,"total": number
            }[]
                           },
"attendance_student_summary":
{ Args: { "p_academic_year_id": string,"p_student_id": string }; Returns: {
              "absent": number,"excused": number,"late": number,"present": number,"total": number
            }[]
                           },
"get_my_context":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"has_feature":
{ Args: { "feature": string }; Returns: boolean
                           },
"mark_notifications_read":
{ Args: { "p_ids"?: (string)[] }; Returns: number
                           },
"review_grades":
{ Args: { "p_action": string,"p_ids": (string)[],"p_reason"?: string }; Returns: number
                           },
"save_attendance":
{ Args: { "p_date": string,"p_records": Json,"p_section_id": string,"p_subject_id"?: string }; Returns: string
                           },
"save_grades":
{ Args: { "p_entries": Json,"p_period_id": string,"p_section_id": string,"p_subject_id": string,"p_submit"?: boolean }; Returns: Json
                           },
"school_code_is_valid":
{ Args: { "school_code": string }; Returns: boolean
                           },
"set_current_academic_year":
{ Args: { "p_year_id": string }; Returns: undefined
                           },
"transfer_enrollment":
{ Args: { "p_effective_date"?: string,"p_enrollment_id": string,"p_grade_level_id": string,"p_section_id": string }; Returns: string
                           },
"visible_teacher_names":
{ Args: { "p_ids": (string)[] }; Returns: {
              "first_name": string,"id": string,"last_name": string
            }[]
                           }
          }
          Enums: {
            "academic_year_status": "planned"|"active"|"archived","app_role": "super_admin"|"school_admin"|"teacher"|"student"|"parent","attendance_session_status": "open"|"locked","attendance_session_type": "daily"|"subject"|"event"|"custom","attendance_status": "present"|"absent"|"late"|"excused","coursework_status": "draft"|"published"|"archived","enrollment_status": "enrolled"|"completed"|"transferred"|"withdrawn","gender": "male"|"female"|"other"|"unspecified","grade_status": "draft"|"submitted"|"approved"|"locked","grading_period_status": "upcoming"|"open"|"closed","guardian_relationship": "mother"|"father"|"guardian"|"grandparent"|"sibling"|"other","notification_type": "assignment_created"|"assignment_due"|"attendance_recorded"|"grade_published"|"announcement"|"system","profile_status": "pending"|"active"|"inactive","record_status": "active"|"inactive","schedule_status": "active"|"inactive","school_status": "active"|"inactive","student_status": "active"|"inactive"|"graduated"|"transferred"|"withdrawn","submission_status": "submitted"|"late"|"reviewed","teacher_status": "active"|"inactive"|"resigned"|"retired"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "academic_year_status": ["planned", "active", "archived"],"app_role": ["super_admin", "school_admin", "teacher", "student", "parent"],"attendance_session_status": ["open", "locked"],"attendance_session_type": ["daily", "subject", "event", "custom"],"attendance_status": ["present", "absent", "late", "excused"],"coursework_status": ["draft", "published", "archived"],"enrollment_status": ["enrolled", "completed", "transferred", "withdrawn"],"gender": ["male", "female", "other", "unspecified"],"grade_status": ["draft", "submitted", "approved", "locked"],"grading_period_status": ["upcoming", "open", "closed"],"guardian_relationship": ["mother", "father", "guardian", "grandparent", "sibling", "other"],"notification_type": ["assignment_created", "assignment_due", "attendance_recorded", "grade_published", "announcement", "system"],"profile_status": ["pending", "active", "inactive"],"record_status": ["active", "inactive"],"schedule_status": ["active", "inactive"],"school_status": ["active", "inactive"],"student_status": ["active", "inactive", "graduated", "transferred", "withdrawn"],"submission_status": ["submitted", "late", "reviewed"],"teacher_status": ["active", "inactive", "resigned", "retired"]
          }
        }
} as const
