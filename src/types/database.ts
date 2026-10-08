
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
                },"features": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"key": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"key": string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"key"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
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
                    "attendance_config": NonNullable<Json>,"branding": NonNullable<Json>,"created_at": string,"grading_config": NonNullable<Json>,"id": string,"primary_color": string,"school_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attendance_config"?: NonNullable<Json>,"branding"?: NonNullable<Json>,"created_at"?: string,"grading_config"?: NonNullable<Json>,"id"?: string,"primary_color"?: string,"school_id": string,"updated_at"?: string
                  }
                  Update: {
                    "attendance_config"?: NonNullable<Json>,"branding"?: NonNullable<Json>,"created_at"?: string,"grading_config"?: NonNullable<Json>,"id"?: string,"primary_color"?: string,"school_id"?: string,"updated_at"?: string
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
"get_my_context":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"has_feature":
{ Args: { "feature": string }; Returns: boolean
                           },
"school_code_is_valid":
{ Args: { "school_code": string }; Returns: boolean
                           },
"set_current_academic_year":
{ Args: { "p_year_id": string }; Returns: undefined
                           },
"transfer_enrollment":
{ Args: { "p_effective_date"?: string,"p_enrollment_id": string,"p_grade_level_id": string,"p_section_id": string }; Returns: string
                           }
          }
          Enums: {
            "academic_year_status": "planned"|"active"|"archived","app_role": "super_admin"|"school_admin"|"teacher"|"student"|"parent","enrollment_status": "enrolled"|"completed"|"transferred"|"withdrawn","gender": "male"|"female"|"other"|"unspecified","guardian_relationship": "mother"|"father"|"guardian"|"grandparent"|"sibling"|"other","profile_status": "pending"|"active"|"inactive","record_status": "active"|"inactive","school_status": "active"|"inactive","student_status": "active"|"inactive"|"graduated"|"transferred"|"withdrawn","teacher_status": "active"|"inactive"|"resigned"|"retired"
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
            "academic_year_status": ["planned", "active", "archived"],"app_role": ["super_admin", "school_admin", "teacher", "student", "parent"],"enrollment_status": ["enrolled", "completed", "transferred", "withdrawn"],"gender": ["male", "female", "other", "unspecified"],"guardian_relationship": ["mother", "father", "guardian", "grandparent", "sibling", "other"],"profile_status": ["pending", "active", "inactive"],"record_status": ["active", "inactive"],"school_status": ["active", "inactive"],"student_status": ["active", "inactive", "graduated", "transferred", "withdrawn"],"teacher_status": ["active", "inactive", "resigned", "retired"]
          }
        }
} as const
