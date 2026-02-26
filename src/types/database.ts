export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          first_name: string
          last_name: string
          role: 'admin' | 'editor' | 'viewer'
          status: 'pending' | 'approved' | 'denied'
          person_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      people: {
        Row: {
          id: string
          first_name: string
          last_name: string
          birth_surname: string | null
          nickname: string | null
          name_variants: string[]
          suffix: string | null
          birth_date: string | null
          birth_place: string | null
          death_date: string | null
          death_place: string | null
          burial_place: string | null
          notes: string | null
          biography: string | null
          primary_photo_id: string | null
          user_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['people']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['people']['Insert']>
      }
      marriages: {
        Row: {
          id: string
          person_a_id: string
          person_b_id: string
          marriage_date: string | null
          marriage_place: string | null
          end_date: string | null
          end_reason: 'divorced' | 'widowed' | 'annulled' | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['marriages']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['marriages']['Insert']>
      }
      parent_child: {
        Row: {
          id: string
          parent_id: string
          child_id: string
          relationship_type: 'biological' | 'adopted' | 'step' | 'half'
          confirmed: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['parent_child']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['parent_child']['Insert']>
      }
      residences: {
        Row: {
          id: string
          person_id: string
          location: string
          from_date: string | null
          to_date: string | null
          is_current: boolean
          sort_order: number
        }
        Insert: Omit<Database['public']['Tables']['residences']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['residences']['Insert']>
      }
      education: {
        Row: {
          id: string
          person_id: string
          institution: string
          institution_type: 'high_school' | 'college' | 'university' | 'vocational' | 'other'
          location: string | null
          start_year: number | null
          end_year: number | null
          graduated: boolean | null
          notes: string | null
        }
        Insert: Omit<Database['public']['Tables']['education']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['education']['Insert']>
      }
      occupations: {
        Row: {
          id: string
          person_id: string
          employer: string | null
          title: string | null
          from_date: string | null
          to_date: string | null
          is_current: boolean
        }
        Insert: Omit<Database['public']['Tables']['occupations']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['occupations']['Insert']>
      }
      military_service: {
        Row: {
          id: string
          person_id: string
          branch: string | null
          rank: string | null
          from_date: string | null
          to_date: string | null
          notes: string | null
        }
        Insert: Omit<Database['public']['Tables']['military_service']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['military_service']['Insert']>
      }
      documents: {
        Row: {
          id: string
          person_id: string
          storage_path: string
          original_filename: string
          mime_type: string
          uploaded_by: string | null
          uploaded_at: string
          extraction_status: 'pending' | 'reviewed' | 'committed'
        }
        Insert: Omit<Database['public']['Tables']['documents']['Row'], 'id' | 'uploaded_at'>
        Update: Partial<Database['public']['Tables']['documents']['Insert']>
      }
      media: {
        Row: {
          id: string
          person_id: string
          storage_path: string
          caption: string | null
          year_approx: number | null
          uploaded_by: string | null
          uploaded_at: string
        }
        Insert: Omit<Database['public']['Tables']['media']['Row'], 'id' | 'uploaded_at'>
        Update: Partial<Database['public']['Tables']['media']['Insert']>
      }
      edit_history: {
        Row: {
          id: string
          table_name: string
          record_id: string
          field_name: string
          old_value: unknown
          new_value: unknown
          changed_by: string | null
          changed_at: string
        }
        Insert: Omit<Database['public']['Tables']['edit_history']['Row'], 'id' | 'changed_at'>
        Update: never
      }
      sources: {
        Row: {
          id: string
          person_id: string
          title: string
          citation: string
          url: string | null
          document_id: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['sources']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['sources']['Insert']>
      }
    }
  }
}
