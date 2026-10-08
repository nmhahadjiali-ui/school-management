
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
                },"announcement_targets": {
                  Row: {
                    "announcement_id": string,"created_at": string,"id": string,"roles": (Database["public"]['Enums']["app_role"])[] | null,"school_id": string,"target_id": string,"target_type": Database["public"]['Enums']["announcement_target_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "announcement_id": string,"created_at"?: string,"id"?: string,"roles"?: (Database["public"]['Enums']["app_role"])[] | null,"school_id": string,"target_id": string,"target_type": Database["public"]['Enums']["announcement_target_type"]
                  }
                  Update: {
                    "announcement_id"?: string,"created_at"?: string,"id"?: string,"roles"?: (Database["public"]['Enums']["app_role"])[] | null,"school_id"?: string,"target_id"?: string,"target_type"?: Database["public"]['Enums']["announcement_target_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcement_targets_announcement_fkey"
      columns: ["school_id","announcement_id"]
isOneToOne: false
      referencedRelation: "announcements"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "announcement_targets_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"announcements": {
                  Row: {
                    "archived_at": string | null,"author_user_id": string | null,"content": string,"created_at": string,"expires_at": string | null,"id": string,"priority": Database["public"]['Enums']["notification_priority"],"publish_at": string | null,"published_at": string | null,"school_id": string,"status": Database["public"]['Enums']["announcement_status"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"author_user_id"?: string | null,"content": string,"created_at"?: string,"expires_at"?: string | null,"id"?: string,"priority"?: Database["public"]['Enums']["notification_priority"],"publish_at"?: string | null,"published_at"?: string | null,"school_id": string,"status"?: Database["public"]['Enums']["announcement_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"author_user_id"?: string | null,"content"?: string,"created_at"?: string,"expires_at"?: string | null,"id"?: string,"priority"?: Database["public"]['Enums']["notification_priority"],"publish_at"?: string | null,"published_at"?: string | null,"school_id"?: string,"status"?: Database["public"]['Enums']["announcement_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcements_school_id_fkey"
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
                },"discount_types": {
                  Row: {
                    "calculation_type": Database["public"]['Enums']["discount_calculation"],"code": string,"created_at": string,"description": string | null,"id": string,"name": string,"school_id": string,"status": Database["public"]['Enums']["record_status"],"updated_at": string,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "calculation_type": Database["public"]['Enums']["discount_calculation"],"code": string,"created_at"?: string,"description"?: string | null,"id"?: string,"name": string,"school_id": string,"status"?: Database["public"]['Enums']["record_status"],"updated_at"?: string,"value": number
                  }
                  Update: {
                    "calculation_type"?: Database["public"]['Enums']["discount_calculation"],"code"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"name"?: string,"school_id"?: string,"status"?: Database["public"]['Enums']["record_status"],"updated_at"?: string,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "discount_types_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
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
                },"fee_structure_items": {
                  Row: {
                    "amount": number,"created_at": string,"due_date": string | null,"fee_structure_id": string,"fee_type_id": string,"frequency": Database["public"]['Enums']["fee_frequency"],"id": string,"installments": number,"name": string,"school_id": string,"sequence": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"due_date"?: string | null,"fee_structure_id": string,"fee_type_id": string,"frequency"?: Database["public"]['Enums']["fee_frequency"],"id"?: string,"installments"?: number,"name": string,"school_id": string,"sequence"?: number,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"due_date"?: string | null,"fee_structure_id"?: string,"fee_type_id"?: string,"frequency"?: Database["public"]['Enums']["fee_frequency"],"id"?: string,"installments"?: number,"name"?: string,"school_id"?: string,"sequence"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fee_items_structure_fkey"
      columns: ["school_id","fee_structure_id"]
isOneToOne: false
      referencedRelation: "fee_structures"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "fee_items_type_fkey"
      columns: ["school_id","fee_type_id"]
isOneToOne: false
      referencedRelation: "fee_types"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "fee_structure_items_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"fee_structures": {
                  Row: {
                    "academic_year_id": string,"created_at": string,"description": string | null,"grade_level_id": string | null,"id": string,"name": string,"school_id": string,"section_id": string | null,"status": Database["public"]['Enums']["record_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "academic_year_id": string,"created_at"?: string,"description"?: string | null,"grade_level_id"?: string | null,"id"?: string,"name": string,"school_id": string,"section_id"?: string | null,"status"?: Database["public"]['Enums']["record_status"],"updated_at"?: string
                  }
                  Update: {
                    "academic_year_id"?: string,"created_at"?: string,"description"?: string | null,"grade_level_id"?: string | null,"id"?: string,"name"?: string,"school_id"?: string,"section_id"?: string | null,"status"?: Database["public"]['Enums']["record_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fee_structures_grade_fkey"
      columns: ["school_id","grade_level_id"]
isOneToOne: false
      referencedRelation: "grade_levels"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "fee_structures_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fee_structures_section_fkey"
      columns: ["school_id","academic_year_id","section_id"]
isOneToOne: false
      referencedRelation: "sections"
      referencedColumns: ["school_id","academic_year_id","id"]
    },{
      foreignKeyName: "fee_structures_year_fkey"
      columns: ["school_id","academic_year_id"]
isOneToOne: false
      referencedRelation: "academic_years"
      referencedColumns: ["school_id","id"]
    }
                  ]
                },"fee_types": {
                  Row: {
                    "category": string,"code": string,"created_at": string,"description": string | null,"id": string,"name": string,"school_id": string,"status": Database["public"]['Enums']["record_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string,"code": string,"created_at"?: string,"description"?: string | null,"id"?: string,"name": string,"school_id": string,"status"?: Database["public"]['Enums']["record_status"],"updated_at"?: string
                  }
                  Update: {
                    "category"?: string,"code"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"name"?: string,"school_id"?: string,"status"?: Database["public"]['Enums']["record_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fee_types_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"financial_adjustments": {
                  Row: {
                    "adjustment_type": Database["public"]['Enums']["adjustment_type"],"created_at": string,"created_by": string | null,"id": string,"reason": string,"school_id": string,"signed_amount": number,"student_charge_id": string,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "adjustment_type": Database["public"]['Enums']["adjustment_type"],"created_at"?: string,"created_by"?: string | null,"id"?: string,"reason": string,"school_id": string,"signed_amount": number,"student_charge_id": string,"student_id": string
                  }
                  Update: {
                    "adjustment_type"?: Database["public"]['Enums']["adjustment_type"],"created_at"?: string,"created_by"?: string | null,"id"?: string,"reason"?: string,"school_id"?: string,"signed_amount"?: number,"student_charge_id"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "adjustments_charge_fkey"
      columns: ["school_id","student_id","student_charge_id"]
isOneToOne: false
      referencedRelation: "student_charge_balances"
      referencedColumns: ["school_id","student_id","id"]
    },{
      foreignKeyName: "adjustments_charge_fkey"
      columns: ["school_id","student_id","student_charge_id"]
isOneToOne: false
      referencedRelation: "student_charges"
      referencedColumns: ["school_id","student_id","id"]
    },{
      foreignKeyName: "financial_adjustments_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"financial_audit_logs": {
                  Row: {
                    "action": string,"actor_user_id": string | null,"created_at": string,"entity": string,"entity_id": string | null,"id": string,"new_values": Json | null,"old_values": Json | null,"reason": string | null,"school_id": string,"student_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_user_id"?: string | null,"created_at"?: string,"entity": string,"entity_id"?: string | null,"id"?: string,"new_values"?: Json | null,"old_values"?: Json | null,"reason"?: string | null,"school_id": string,"student_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_user_id"?: string | null,"created_at"?: string,"entity"?: string,"entity_id"?: string | null,"id"?: string,"new_values"?: Json | null,"old_values"?: Json | null,"reason"?: string | null,"school_id"?: string,"student_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "financial_audit_logs_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
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
                },"notification_deliveries": {
                  Row: {
                    "attempts": number,"channel": Database["public"]['Enums']["delivery_channel"],"created_at": string,"delivered_at": string | null,"destination": string,"error_message": string | null,"failed_at": string | null,"id": string,"last_attempt_at": string | null,"next_attempt_at": string,"notification_id": string,"provider": string | null,"provider_message_id": string | null,"recipient_user_id": string,"school_id": string,"status": Database["public"]['Enums']["delivery_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"channel": Database["public"]['Enums']["delivery_channel"],"created_at"?: string,"delivered_at"?: string | null,"destination": string,"error_message"?: string | null,"failed_at"?: string | null,"id"?: string,"last_attempt_at"?: string | null,"next_attempt_at"?: string,"notification_id": string,"provider"?: string | null,"provider_message_id"?: string | null,"recipient_user_id": string,"school_id": string,"status"?: Database["public"]['Enums']["delivery_status"],"updated_at"?: string
                  }
                  Update: {
                    "attempts"?: number,"channel"?: Database["public"]['Enums']["delivery_channel"],"created_at"?: string,"delivered_at"?: string | null,"destination"?: string,"error_message"?: string | null,"failed_at"?: string | null,"id"?: string,"last_attempt_at"?: string | null,"next_attempt_at"?: string,"notification_id"?: string,"provider"?: string | null,"provider_message_id"?: string | null,"recipient_user_id"?: string,"school_id"?: string,"status"?: Database["public"]['Enums']["delivery_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_deliveries_notification_fkey"
      columns: ["school_id","notification_id"]
isOneToOne: false
      referencedRelation: "notifications"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "notification_deliveries_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_preferences": {
                  Row: {
                    "created_at": string,"email_enabled": boolean,"id": string,"in_app_enabled": boolean,"notification_type": string,"push_enabled": boolean,"school_id": string,"sms_enabled": boolean,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email_enabled"?: boolean,"id"?: string,"in_app_enabled"?: boolean,"notification_type": string,"push_enabled"?: boolean,"school_id": string,"sms_enabled"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"email_enabled"?: boolean,"id"?: string,"in_app_enabled"?: boolean,"notification_type"?: string,"push_enabled"?: boolean,"school_id"?: string,"sms_enabled"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_preferences_notification_type_fkey"
      columns: ["notification_type"]
isOneToOne: false
      referencedRelation: "notification_types"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "notification_preferences_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_types": {
                  Row: {
                    "category": string,"created_at": string,"default_email": boolean,"default_in_app": boolean,"default_push": boolean,"default_sms": boolean,"description": string | null,"id": string,"key": string,"mandatory": boolean,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"created_at"?: string,"default_email"?: boolean,"default_in_app"?: boolean,"default_push"?: boolean,"default_sms"?: boolean,"description"?: string | null,"id"?: string,"key": string,"mandatory"?: boolean,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"default_email"?: boolean,"default_in_app"?: boolean,"default_push"?: boolean,"default_sms"?: boolean,"description"?: string | null,"id"?: string,"key"?: string,"mandatory"?: boolean,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "actor_user_id": string | null,"created_at": string,"data": NonNullable<Json>,"dismissed_at": string | null,"event_key": string,"expires_at": string | null,"id": string,"message": string,"priority": Database["public"]['Enums']["notification_priority"],"read_at": string | null,"recipient_user_id": string,"school_id": string,"show_in_app": boolean,"title": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_user_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"dismissed_at"?: string | null,"event_key": string,"expires_at"?: string | null,"id"?: string,"message": string,"priority"?: Database["public"]['Enums']["notification_priority"],"read_at"?: string | null,"recipient_user_id": string,"school_id": string,"show_in_app"?: boolean,"title": string,"type": string
                  }
                  Update: {
                    "actor_user_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"dismissed_at"?: string | null,"event_key"?: string,"expires_at"?: string | null,"id"?: string,"message"?: string,"priority"?: Database["public"]['Enums']["notification_priority"],"read_at"?: string | null,"recipient_user_id"?: string,"school_id"?: string,"show_in_app"?: boolean,"title"?: string,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_type_fkey"
      columns: ["type"]
isOneToOne: false
      referencedRelation: "notification_types"
      referencedColumns: ["key"]
    }
                  ]
                },"payment_allocations": {
                  Row: {
                    "amount": number,"created_at": string,"created_by": string | null,"id": string,"payment_id": string,"release_reason": string | null,"released_at": string | null,"released_by": string | null,"school_id": string,"student_charge_id": string,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"payment_id": string,"release_reason"?: string | null,"released_at"?: string | null,"released_by"?: string | null,"school_id": string,"student_charge_id": string,"student_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"payment_id"?: string,"release_reason"?: string | null,"released_at"?: string | null,"released_by"?: string | null,"school_id"?: string,"student_charge_id"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "allocations_charge_fkey"
      columns: ["school_id","student_id","student_charge_id"]
isOneToOne: false
      referencedRelation: "student_charge_balances"
      referencedColumns: ["school_id","student_id","id"]
    },{
      foreignKeyName: "allocations_charge_fkey"
      columns: ["school_id","student_id","student_charge_id"]
isOneToOne: false
      referencedRelation: "student_charges"
      referencedColumns: ["school_id","student_id","id"]
    },{
      foreignKeyName: "allocations_payment_fkey"
      columns: ["school_id","student_id","payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["school_id","student_id","id"]
    },{
      foreignKeyName: "allocations_payment_fkey"
      columns: ["school_id","student_id","payment_id"]
isOneToOne: false
      referencedRelation: "student_payment_credits"
      referencedColumns: ["school_id","student_id","payment_id"]
    },{
      foreignKeyName: "payment_allocations_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_transactions": {
                  Row: {
                    "amount": number,"checkout_url": string | null,"created_at": string,"created_by": string | null,"currency": string,"failure_reason": string | null,"id": string,"metadata": NonNullable<Json>,"provider": string,"provider_transaction_id": string | null,"school_id": string,"status": Database["public"]['Enums']["payment_transaction_status"],"student_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"checkout_url"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency": string,"failure_reason"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"provider": string,"provider_transaction_id"?: string | null,"school_id": string,"status"?: Database["public"]['Enums']["payment_transaction_status"],"student_id": string,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"checkout_url"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"failure_reason"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"provider"?: string,"provider_transaction_id"?: string | null,"school_id"?: string,"status"?: Database["public"]['Enums']["payment_transaction_status"],"student_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_transactions_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_tx_student_ref"
      columns: ["school_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["school_id","id"]
    }
                  ]
                },"payment_webhook_events": {
                  Row: {
                    "attempts": number,"error_message": string | null,"event_id": string,"event_type": string | null,"id": string,"payload": NonNullable<Json>,"processed_at": string | null,"provider": string,"received_at": string,"school_id": string | null,"signature_valid": boolean,"status": string,"transaction_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"error_message"?: string | null,"event_id": string,"event_type"?: string | null,"id"?: string,"payload"?: NonNullable<Json>,"processed_at"?: string | null,"provider": string,"received_at"?: string,"school_id"?: string | null,"signature_valid": boolean,"status"?: string,"transaction_id"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"error_message"?: string | null,"event_id"?: string,"event_type"?: string | null,"id"?: string,"payload"?: NonNullable<Json>,"processed_at"?: string | null,"provider"?: string,"received_at"?: string,"school_id"?: string | null,"signature_valid"?: boolean,"status"?: string,"transaction_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_webhook_events_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_webhook_events_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "payment_transactions"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"created_at": string,"currency": string,"enrollment_id": string | null,"id": string,"idempotency_key": string | null,"notes": string | null,"payment_date": string,"payment_method": Database["public"]['Enums']["payment_method"],"payment_transaction_id": string | null,"received_by": string | null,"reference_number": string | null,"reversal_reason": string | null,"reversed_at": string | null,"reversed_by": string | null,"school_id": string,"status": Database["public"]['Enums']["payment_status"],"student_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"currency": string,"enrollment_id"?: string | null,"id"?: string,"idempotency_key"?: string | null,"notes"?: string | null,"payment_date"?: string,"payment_method": Database["public"]['Enums']["payment_method"],"payment_transaction_id"?: string | null,"received_by"?: string | null,"reference_number"?: string | null,"reversal_reason"?: string | null,"reversed_at"?: string | null,"reversed_by"?: string | null,"school_id": string,"status"?: Database["public"]['Enums']["payment_status"],"student_id": string,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"currency"?: string,"enrollment_id"?: string | null,"id"?: string,"idempotency_key"?: string | null,"notes"?: string | null,"payment_date"?: string,"payment_method"?: Database["public"]['Enums']["payment_method"],"payment_transaction_id"?: string | null,"received_by"?: string | null,"reference_number"?: string | null,"reversal_reason"?: string | null,"reversed_at"?: string | null,"reversed_by"?: string | null,"school_id"?: string,"status"?: Database["public"]['Enums']["payment_status"],"student_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_enrollment_fkey"
      columns: ["school_id","student_id","enrollment_id"]
isOneToOne: false
      referencedRelation: "student_enrollments"
      referencedColumns: ["school_id","student_id","id"]
    },{
      foreignKeyName: "payments_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_student_ref"
      columns: ["school_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "payments_tx_fkey"
      columns: ["school_id","payment_transaction_id"]
isOneToOne: false
      referencedRelation: "payment_transactions"
      referencedColumns: ["school_id","id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_path": string | null,"avatar_url": string | null,"created_at": string,"email": string,"first_name": string,"id": string,"last_name": string,"phone": string | null,"role": Database["public"]['Enums']["app_role"],"school_id": string | null,"status": Database["public"]['Enums']["profile_status"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"avatar_url"?: string | null,"created_at"?: string,"email": string,"first_name"?: string,"id"?: string,"last_name"?: string,"phone"?: string | null,"role": Database["public"]['Enums']["app_role"],"school_id"?: string | null,"status"?: Database["public"]['Enums']["profile_status"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "avatar_path"?: string | null,"avatar_url"?: string | null,"created_at"?: string,"email"?: string,"first_name"?: string,"id"?: string,"last_name"?: string,"phone"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"school_id"?: string | null,"status"?: Database["public"]['Enums']["profile_status"],"updated_at"?: string,"user_id"?: string
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
                },"receipt_sequences": {
                  Row: {
                    "last_number": number,"school_id": string,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "last_number"?: number,"school_id": string,"year": number
                  }
                  Update: {
                    "last_number"?: number,"school_id"?: string,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "receipt_sequences_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"receipts": {
                  Row: {
                    "created_at": string,"id": string,"issued_at": string,"issued_by": string | null,"payment_id": string,"receipt_number": string,"school_id": string,"status": Database["public"]['Enums']["receipt_status"],"void_reason": string | null,"voided_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"issued_at"?: string,"issued_by"?: string | null,"payment_id": string,"receipt_number": string,"school_id": string,"status"?: Database["public"]['Enums']["receipt_status"],"void_reason"?: string | null,"voided_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"issued_at"?: string,"issued_by"?: string | null,"payment_id"?: string,"receipt_number"?: string,"school_id"?: string,"status"?: Database["public"]['Enums']["receipt_status"],"void_reason"?: string | null,"voided_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "receipts_payment_fkey"
      columns: ["school_id","payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "receipts_payment_fkey"
      columns: ["school_id","payment_id"]
isOneToOne: false
      referencedRelation: "student_payment_credits"
      referencedColumns: ["school_id","payment_id"]
    },{
      foreignKeyName: "receipts_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"refunds": {
                  Row: {
                    "amount": number,"approved_by": string | null,"created_at": string,"decided_at": string | null,"decision_note": string | null,"id": string,"payment_id": string,"processed_at": string | null,"processed_by": string | null,"reason": string,"refund_method": Database["public"]['Enums']["payment_method"] | null,"refund_reference": string | null,"requested_by": string | null,"school_id": string,"status": Database["public"]['Enums']["refund_status"],"student_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"approved_by"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decision_note"?: string | null,"id"?: string,"payment_id": string,"processed_at"?: string | null,"processed_by"?: string | null,"reason": string,"refund_method"?: Database["public"]['Enums']["payment_method"] | null,"refund_reference"?: string | null,"requested_by"?: string | null,"school_id": string,"status"?: Database["public"]['Enums']["refund_status"],"student_id": string,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"approved_by"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decision_note"?: string | null,"id"?: string,"payment_id"?: string,"processed_at"?: string | null,"processed_by"?: string | null,"reason"?: string,"refund_method"?: Database["public"]['Enums']["payment_method"] | null,"refund_reference"?: string | null,"requested_by"?: string | null,"school_id"?: string,"status"?: Database["public"]['Enums']["refund_status"],"student_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "refunds_payment_fkey"
      columns: ["school_id","student_id","payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["school_id","student_id","id"]
    },{
      foreignKeyName: "refunds_payment_fkey"
      columns: ["school_id","student_id","payment_id"]
isOneToOne: false
      referencedRelation: "student_payment_credits"
      referencedColumns: ["school_id","student_id","payment_id"]
    },{
      foreignKeyName: "refunds_school_id_fkey"
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
                    "admin_finance_access": Database["public"]['Enums']["finance_access"],"attendance_edit_days": number | null,"branding": NonNullable<Json>,"created_at": string,"currency": string,"email_notifications_enabled": boolean,"enforce_room_conflicts": boolean,"grade_max_score": number,"grade_passing_score": number,"id": string,"notifications_enabled": boolean,"primary_color": string,"push_notifications_enabled": boolean,"receipt_prefix": string,"refunds_require_second_approver": boolean,"school_id": string,"sms_notifications_enabled": boolean,"teachers_can_announce": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_finance_access"?: Database["public"]['Enums']["finance_access"],"attendance_edit_days"?: number | null,"branding"?: NonNullable<Json>,"created_at"?: string,"currency"?: string,"email_notifications_enabled"?: boolean,"enforce_room_conflicts"?: boolean,"grade_max_score"?: number,"grade_passing_score"?: number,"id"?: string,"notifications_enabled"?: boolean,"primary_color"?: string,"push_notifications_enabled"?: boolean,"receipt_prefix"?: string,"refunds_require_second_approver"?: boolean,"school_id": string,"sms_notifications_enabled"?: boolean,"teachers_can_announce"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "admin_finance_access"?: Database["public"]['Enums']["finance_access"],"attendance_edit_days"?: number | null,"branding"?: NonNullable<Json>,"created_at"?: string,"currency"?: string,"email_notifications_enabled"?: boolean,"enforce_room_conflicts"?: boolean,"grade_max_score"?: number,"grade_passing_score"?: number,"id"?: string,"notifications_enabled"?: boolean,"primary_color"?: string,"push_notifications_enabled"?: boolean,"receipt_prefix"?: string,"refunds_require_second_approver"?: boolean,"school_id"?: string,"sms_notifications_enabled"?: boolean,"teachers_can_announce"?: boolean,"updated_at"?: string
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
                },"sms_usage": {
                  Row: {
                    "created_at": string,"id": string,"messages_failed": number,"messages_sent": number,"month": number,"school_id": string,"updated_at": string,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"messages_failed"?: number,"messages_sent"?: number,"month": number,"school_id": string,"updated_at"?: string,"year": number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"messages_failed"?: number,"messages_sent"?: number,"month"?: number,"school_id"?: string,"updated_at"?: string,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "sms_usage_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"student_charges": {
                  Row: {
                    "academic_year_id": string,"amount": number,"cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"created_at": string,"created_by": string | null,"description": string,"due_date": string | null,"enrollment_id": string,"fee_structure_item_id": string | null,"fee_type_id": string,"id": string,"installment_no": number,"school_id": string,"status": Database["public"]['Enums']["charge_status"],"student_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "academic_year_id": string,"amount": number,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"description": string,"due_date"?: string | null,"enrollment_id": string,"fee_structure_item_id"?: string | null,"fee_type_id": string,"id"?: string,"installment_no"?: number,"school_id": string,"status"?: Database["public"]['Enums']["charge_status"],"student_id": string,"updated_at"?: string
                  }
                  Update: {
                    "academic_year_id"?: string,"amount"?: number,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string,"due_date"?: string | null,"enrollment_id"?: string,"fee_structure_item_id"?: string | null,"fee_type_id"?: string,"id"?: string,"installment_no"?: number,"school_id"?: string,"status"?: Database["public"]['Enums']["charge_status"],"student_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "charges_enrollment_fkey"
      columns: ["school_id","academic_year_id","student_id","enrollment_id"]
isOneToOne: false
      referencedRelation: "student_enrollments"
      referencedColumns: ["school_id","academic_year_id","student_id","id"]
    },{
      foreignKeyName: "charges_fee_type_fkey"
      columns: ["school_id","fee_type_id"]
isOneToOne: false
      referencedRelation: "fee_types"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "charges_item_fkey"
      columns: ["school_id","fee_structure_item_id"]
isOneToOne: false
      referencedRelation: "fee_structure_items"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "charges_student_ref"
      columns: ["school_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "student_charges_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"student_discounts": {
                  Row: {
                    "amount": number,"created_at": string,"created_by": string | null,"discount_type_id": string,"enrollment_id": string,"id": string,"percentage": number | null,"reason": string,"revoke_reason": string | null,"revoked_at": string | null,"revoked_by": string | null,"school_id": string,"status": Database["public"]['Enums']["record_status"],"student_charge_id": string,"student_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"created_by"?: string | null,"discount_type_id": string,"enrollment_id": string,"id"?: string,"percentage"?: number | null,"reason": string,"revoke_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"school_id": string,"status"?: Database["public"]['Enums']["record_status"],"student_charge_id": string,"student_id": string,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"created_by"?: string | null,"discount_type_id"?: string,"enrollment_id"?: string,"id"?: string,"percentage"?: number | null,"reason"?: string,"revoke_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"school_id"?: string,"status"?: Database["public"]['Enums']["record_status"],"student_charge_id"?: string,"student_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_discounts_charge_fkey"
      columns: ["school_id","student_id","student_charge_id"]
isOneToOne: false
      referencedRelation: "student_charge_balances"
      referencedColumns: ["school_id","student_id","id"]
    },{
      foreignKeyName: "student_discounts_charge_fkey"
      columns: ["school_id","student_id","student_charge_id"]
isOneToOne: false
      referencedRelation: "student_charges"
      referencedColumns: ["school_id","student_id","id"]
    },{
      foreignKeyName: "student_discounts_enrollment_fkey"
      columns: ["school_id","student_id","enrollment_id"]
isOneToOne: false
      referencedRelation: "student_enrollments"
      referencedColumns: ["school_id","student_id","id"]
    },{
      foreignKeyName: "student_discounts_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_discounts_type_fkey"
      columns: ["school_id","discount_type_id"]
isOneToOne: false
      referencedRelation: "discount_types"
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
                    "address": string | null,"created_at": string,"date_of_birth": string | null,"email": string | null,"first_name": string,"gender": Database["public"]['Enums']["gender"] | null,"id": string,"last_name": string,"middle_name": string | null,"phone": string | null,"photo_path": string | null,"photo_url": string | null,"school_id": string,"search_text": string | null,"status": Database["public"]['Enums']["student_status"],"student_number": string,"suffix": string | null,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"created_at"?: string,"date_of_birth"?: string | null,"email"?: string | null,"first_name": string,"gender"?: Database["public"]['Enums']["gender"] | null,"id"?: string,"last_name": string,"middle_name"?: string | null,"phone"?: string | null,"photo_path"?: string | null,"photo_url"?: string | null,"school_id": string,"search_text"?: never,"status"?: Database["public"]['Enums']["student_status"],"student_number": string,"suffix"?: string | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string,"date_of_birth"?: string | null,"email"?: string | null,"first_name"?: string,"gender"?: Database["public"]['Enums']["gender"] | null,"id"?: string,"last_name"?: string,"middle_name"?: string | null,"phone"?: string | null,"photo_path"?: string | null,"photo_url"?: string | null,"school_id"?: string,"search_text"?: never,"status"?: Database["public"]['Enums']["student_status"],"student_number"?: string,"suffix"?: string | null,"updated_at"?: string,"user_id"?: string | null
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
                },"user_devices": {
                  Row: {
                    "app_version": string | null,"created_at": string,"device_type": Database["public"]['Enums']["device_type"],"id": string,"last_seen_at": string,"push_token": string,"school_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "app_version"?: string | null,"created_at"?: string,"device_type": Database["public"]['Enums']["device_type"],"id"?: string,"last_seen_at"?: string,"push_token": string,"school_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "app_version"?: string | null,"created_at"?: string,"device_type"?: Database["public"]['Enums']["device_type"],"id"?: string,"last_seen_at"?: string,"push_token"?: string,"school_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_devices_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "student_charge_balances": {
                  Row: {
                    "academic_year_id": string | null,"adjustments": number | null,"amount": number | null,"cancelled_at": string | null,"created_at": string | null,"description": string | null,"discounts": number | null,"due_date": string | null,"effective_status": Database["public"]['Enums']["charge_status"] | null,"enrollment_id": string | null,"fee_structure_item_id": string | null,"fee_type_id": string | null,"id": string | null,"net_amount": number | null,"paid": number | null,"remaining": number | null,"school_id": string | null,"status": Database["public"]['Enums']["charge_status"] | null,"student_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "charges_enrollment_fkey"
      columns: ["school_id","academic_year_id","student_id","enrollment_id"]
isOneToOne: false
      referencedRelation: "student_enrollments"
      referencedColumns: ["school_id","academic_year_id","student_id","id"]
    },{
      foreignKeyName: "charges_fee_type_fkey"
      columns: ["school_id","fee_type_id"]
isOneToOne: false
      referencedRelation: "fee_types"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "charges_item_fkey"
      columns: ["school_id","fee_structure_item_id"]
isOneToOne: false
      referencedRelation: "fee_structure_items"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "charges_student_ref"
      columns: ["school_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["school_id","id"]
    },{
      foreignKeyName: "student_charges_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    }
                  ]
                },"student_ledger": {
                  Row: {
                    "academic_year_id": string | null,"amount": number | null,"description": string | null,"entity_id": string | null,"entry_date": string | null,"entry_type": string | null,"occurred_at": string | null,"school_id": string | null,"student_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"student_payment_credits": {
                  Row: {
                    "amount": number | null,"payment_date": string | null,"payment_id": string | null,"school_id": string | null,"student_id": string | null,"unallocated": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "payments_school_id_fkey"
      columns: ["school_id"]
isOneToOne: false
      referencedRelation: "schools"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_student_ref"
      columns: ["school_id","student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["school_id","id"]
    }
                  ]
                }
          }
          Functions: {
            "accept_invitation":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"announcement_audience_count":
{ Args: { "p_id": string }; Returns: number
                           },
"apply_credit":
{ Args: { "p_allocations": Json,"p_payment_id": string }; Returns: number
                           },
"apply_discount":
{ Args: { "p_charge_ids": (string)[],"p_discount_type_id": string,"p_reason": string }; Returns: number
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
"cancel_charge":
{ Args: { "p_charge_id": string,"p_reason": string }; Returns: undefined
                           },
"cancel_refund":
{ Args: { "p_reason": string,"p_refund_id": string }; Returns: undefined
                           },
"claim_notification_deliveries":
{ Args: { "p_limit"?: number }; Returns: {
              "attempts": number,"channel": Database["public"]['Enums']["delivery_channel"],"data": Json,"destination": string,"id": string,"message": string,"notification_id": string,"priority": Database["public"]['Enums']["notification_priority"],"school_id": string,"title": string
            }[]
                           },
"complete_notification_delivery":
{ Args: { "p_error"?: string,"p_id": string,"p_provider": string,"p_provider_message_id"?: string,"p_success": boolean }; Returns: Database["public"]['Enums']["delivery_status"]
                           },
"complete_payment_transaction":
{ Args: { "p_failure_reason"?: string,"p_status": Database["public"]['Enums']["payment_transaction_status"],"p_transaction_id": string,"p_verified_amount"?: number }; Returns: Json
                           },
"create_adjustment":
{ Args: { "p_amount": number,"p_charge_id": string,"p_increase"?: boolean,"p_reason": string,"p_type": Database["public"]['Enums']["adjustment_type"] }; Returns: string
                           },
"create_charge":
{ Args: { "p_academic_year_id"?: string,"p_amount": number,"p_description": string,"p_due_date"?: string,"p_fee_type_id": string,"p_student_id": string }; Returns: string
                           },
"create_payment_intent":
{ Args: { "p_charge_ids": (string)[],"p_provider": string,"p_student_id": string }; Returns: Json
                           },
"decide_refund":
{ Args: { "p_approve": boolean,"p_note"?: string,"p_refund_id": string }; Returns: undefined
                           },
"finance_actor_names":
{ Args: { "p_user_ids": (string)[] }; Returns: {
              "name": string,"user_id": string
            }[]
                           },
"finance_overview":
{ Args: { "p_academic_year_id"?: string,"p_fee_type_id"?: string,"p_from"?: string,"p_grade_level_id"?: string,"p_method"?: Database["public"]['Enums']["payment_method"],"p_school_id": string,"p_section_id"?: string,"p_to"?: string }; Returns: Json
                           },
"finish_webhook_event":
{ Args: { "p_error"?: string,"p_event_row_id": string,"p_status": string }; Returns: undefined
                           },
"generate_charges":
{ Args: { "p_dry_run"?: boolean,"p_structure_id": string }; Returns: Json
                           },
"get_my_context":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"has_feature":
{ Args: { "feature": string }; Returns: boolean
                           },
"hit_rate_limit":
{ Args: { "p_bucket": string,"p_limit": number,"p_window_seconds": number }; Returns: boolean
                           },
"mark_notifications_read":
{ Args: { "p_ids"?: (string)[] }; Returns: number
                           },
"my_finance_level":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"process_refund":
{ Args: { "p_method": Database["public"]['Enums']["payment_method"],"p_reference": string,"p_refund_id": string }; Returns: undefined
                           },
"publish_announcement":
{ Args: { "p_id": string }; Returns: string
                           },
"record_payment":
{ Args: { "p_allocations": Json,"p_amount": number,"p_idempotency_key": string,"p_method": Database["public"]['Enums']["payment_method"],"p_notes": string,"p_payment_date": string,"p_reference": string,"p_student_id": string }; Returns: Json
                           },
"record_webhook_event":
{ Args: { "p_event_id": string,"p_event_type": string,"p_payload": Json,"p_provider": string,"p_signature_valid": boolean,"p_transaction_id"?: string }; Returns: Json
                           },
"register_device":
{ Args: { "p_app_version"?: string,"p_device_type": Database["public"]['Enums']["device_type"],"p_push_token": string }; Returns: string
                           },
"release_allocation":
{ Args: { "p_allocation_id": string,"p_reason": string }; Returns: undefined
                           },
"request_refund":
{ Args: { "p_amount": number,"p_payment_id": string,"p_reason": string }; Returns: string
                           },
"reverse_payment":
{ Args: { "p_payment_id": string,"p_reason": string }; Returns: undefined
                           },
"review_grades":
{ Args: { "p_action": string,"p_ids": (string)[],"p_reason"?: string }; Returns: number
                           },
"revoke_discount":
{ Args: { "p_discount_id": string,"p_reason": string }; Returns: undefined
                           },
"run_communication_jobs":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"run_data_retention":
{ Args: Record<PropertyKey, never>; Returns: Json
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
"set_transaction_checkout":
{ Args: { "p_checkout_url": string,"p_provider_transaction_id": string,"p_transaction_id": string }; Returns: undefined
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
            "academic_year_status": "planned"|"active"|"archived","adjustment_type": "discount"|"waiver"|"penalty"|"credit"|"debit"|"correction","announcement_status": "draft"|"scheduled"|"published"|"archived","announcement_target_type": "school"|"grade_level"|"section"|"class"|"user","app_role": "super_admin"|"school_admin"|"teacher"|"student"|"parent"|"finance_admin"|"finance_staff","attendance_session_status": "open"|"locked","attendance_session_type": "daily"|"subject"|"event"|"custom","attendance_status": "present"|"absent"|"late"|"excused","charge_status": "pending"|"partially_paid"|"paid"|"overdue"|"cancelled","coursework_status": "draft"|"published"|"archived","delivery_channel": "in_app"|"email"|"sms"|"push","delivery_status": "pending"|"processing"|"sent"|"delivered"|"failed"|"cancelled","device_type": "android"|"ios"|"web","discount_calculation": "fixed"|"percentage","enrollment_status": "enrolled"|"completed"|"transferred"|"withdrawn","fee_frequency": "one_time"|"monthly"|"quarterly"|"semester"|"annual"|"custom","finance_access": "full"|"view"|"none","gender": "male"|"female"|"other"|"unspecified","grade_status": "draft"|"submitted"|"approved"|"locked","grading_period_status": "upcoming"|"open"|"closed","guardian_relationship": "mother"|"father"|"guardian"|"grandparent"|"sibling"|"other","notification_priority": "low"|"normal"|"high"|"urgent","payment_method": "cash"|"bank_transfer"|"check"|"card"|"e_wallet"|"online"|"other","payment_status": "completed"|"reversed","payment_transaction_status": "pending"|"processing"|"successful"|"failed"|"cancelled"|"expired"|"refunded","profile_status": "pending"|"active"|"inactive","receipt_status": "issued"|"voided","record_status": "active"|"inactive","refund_status": "requested"|"approved"|"rejected"|"processed"|"cancelled","schedule_status": "active"|"inactive","school_status": "active"|"inactive","student_status": "active"|"inactive"|"graduated"|"transferred"|"withdrawn","submission_status": "submitted"|"late"|"reviewed","teacher_status": "active"|"inactive"|"resigned"|"retired"
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
            "academic_year_status": ["planned", "active", "archived"],"adjustment_type": ["discount", "waiver", "penalty", "credit", "debit", "correction"],"announcement_status": ["draft", "scheduled", "published", "archived"],"announcement_target_type": ["school", "grade_level", "section", "class", "user"],"app_role": ["super_admin", "school_admin", "teacher", "student", "parent", "finance_admin", "finance_staff"],"attendance_session_status": ["open", "locked"],"attendance_session_type": ["daily", "subject", "event", "custom"],"attendance_status": ["present", "absent", "late", "excused"],"charge_status": ["pending", "partially_paid", "paid", "overdue", "cancelled"],"coursework_status": ["draft", "published", "archived"],"delivery_channel": ["in_app", "email", "sms", "push"],"delivery_status": ["pending", "processing", "sent", "delivered", "failed", "cancelled"],"device_type": ["android", "ios", "web"],"discount_calculation": ["fixed", "percentage"],"enrollment_status": ["enrolled", "completed", "transferred", "withdrawn"],"fee_frequency": ["one_time", "monthly", "quarterly", "semester", "annual", "custom"],"finance_access": ["full", "view", "none"],"gender": ["male", "female", "other", "unspecified"],"grade_status": ["draft", "submitted", "approved", "locked"],"grading_period_status": ["upcoming", "open", "closed"],"guardian_relationship": ["mother", "father", "guardian", "grandparent", "sibling", "other"],"notification_priority": ["low", "normal", "high", "urgent"],"payment_method": ["cash", "bank_transfer", "check", "card", "e_wallet", "online", "other"],"payment_status": ["completed", "reversed"],"payment_transaction_status": ["pending", "processing", "successful", "failed", "cancelled", "expired", "refunded"],"profile_status": ["pending", "active", "inactive"],"receipt_status": ["issued", "voided"],"record_status": ["active", "inactive"],"refund_status": ["requested", "approved", "rejected", "processed", "cancelled"],"schedule_status": ["active", "inactive"],"school_status": ["active", "inactive"],"student_status": ["active", "inactive", "graduated", "transferred", "withdrawn"],"submission_status": ["submitted", "late", "reviewed"],"teacher_status": ["active", "inactive", "resigned", "retired"]
          }
        }
} as const
