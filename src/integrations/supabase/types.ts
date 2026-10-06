export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      booking_assets: {
        Row: {
          asset_id: string
          booking_id: string
          created_at: string
          daily_fee: number
          days: number
          id: string
        }
        Insert: {
          asset_id: string
          booking_id: string
          created_at?: string
          daily_fee?: number
          days?: number
          id?: string
        }
        Update: {
          asset_id?: string
          booking_id?: string
          created_at?: string
          daily_fee?: number
          days?: number
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_assets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "crew_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_assets_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          attendance: string | null
          client_charge: number
          created_at: string
          crew_id: string
          crew_rate: number
          days: number
          id: string
          production_id: string
          role: string
          status: Database["public"]["Enums"]["booking_status"]
          booking_date: string | null
          call_time: string | null
          wrap_time: string | null
          pencil_priority: number | null
          pencil_expires_at: string | null
          created_by: string | null
          cancelled_reason: string | null
          cancelled_by: string | null
          cancelled_at: string | null
        }
        Insert: {
          attendance?: string | null
          client_charge?: number
          created_at?: string
          crew_id: string
          crew_rate?: number
          days?: number
          id?: string
          production_id: string
          role: string
          status?: Database["public"]["Enums"]["booking_status"]
          booking_date?: string | null
          call_time?: string | null
          wrap_time?: string | null
          pencil_priority?: number | null
          pencil_expires_at?: string | null
          created_by?: string | null
          cancelled_reason?: string | null
          cancelled_by?: string | null
          cancelled_at?: string | null
        }
        Update: {
          attendance?: string | null
          client_charge?: number
          created_at?: string
          crew_id?: string
          crew_rate?: number
          days?: number
          id?: string
          production_id?: string
          role?: string
          status?: Database["public"]["Enums"]["booking_status"]
          booking_date?: string | null
          call_time?: string | null
          wrap_time?: string | null
          pencil_priority?: number | null
          pencil_expires_at?: string | null
          created_by?: string | null
          cancelled_reason?: string | null
          cancelled_by?: string | null
          cancelled_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      change_requests: {
        Row: {
          amount: number
          created_at: string
          detail: string
          id: string
          kind: string
          production: string
          state: string
          who: string
          booking_id: string | null
          requested_by: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          detail: string
          id?: string
          kind: string
          production: string
          state?: string
          who: string
          booking_id?: string | null
          requested_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          detail?: string
          id?: string
          kind?: string
          production?: string
          state?: string
          who?: string
          booking_id?: string | null
          requested_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          company: string
          created_at: string
          email: string
          id: string
          name: string
          notes: string
          phone: string
        }
        Insert: {
          company?: string
          created_at?: string
          email?: string
          id?: string
          name: string
          notes?: string
          phone?: string
        }
        Update: {
          company?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          notes?: string
          phone?: string
        }
        Relationships: []
      }
      crew_assets: {
        Row: {
          category: string
          created_at: string
          crew_id: string
          daily_fee: number
          id: string
          name: string
        }
        Insert: {
          category?: string
          created_at?: string
          crew_id: string
          daily_fee?: number
          id?: string
          name: string
        }
        Update: {
          category?: string
          created_at?: string
          crew_id?: string
          daily_fee?: number
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_assets_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_members: {
        Row: {
          available: boolean
          bio: string
          certifications: Json
          created_at: string
          day_rate: number
          department: string
          email: string
          experience: number
          experience_notes: string
          id: string
          kit: string | null
          location: string
          name: string
          pencilled: boolean
          phone: string
          photo_url: string | null
          rating: number
          role: string
          safety_record: number
          skills: string[]
          team_led: number
          user_id: string | null
        }
        Insert: {
          available?: boolean
          bio?: string
          certifications?: Json
          created_at?: string
          day_rate?: number
          department: string
          email?: string
          experience?: number
          experience_notes?: string
          id?: string
          kit?: string | null
          location?: string
          name: string
          pencilled?: boolean
          phone?: string
          photo_url?: string | null
          rating?: number
          role: string
          safety_record?: number
          skills?: string[]
          team_led?: number
          user_id?: string | null
        }
        Update: {
          available?: boolean
          bio?: string
          certifications?: Json
          created_at?: string
          day_rate?: number
          department?: string
          email?: string
          experience?: number
          experience_notes?: string
          id?: string
          kit?: string | null
          location?: string
          name?: string
          pencilled?: boolean
          phone?: string
          photo_url?: string | null
          rating?: number
          role?: string
          safety_record?: number
          skills?: string[]
          team_led?: number
          user_id?: string | null
        }
        Relationships: []
      }
      crew_reviews: {
        Row: {
          comment: string
          created_at: string
          crew_id: string
          id: string
          production_id: string | null
          rating: number
          reviewer_id: string
          reviewer_name: string
        }
        Insert: {
          comment?: string
          created_at?: string
          crew_id: string
          id?: string
          production_id?: string | null
          rating: number
          reviewer_id?: string
          reviewer_name?: string
        }
        Update: {
          comment?: string
          created_at?: string
          crew_id?: string
          id?: string
          production_id?: string | null
          rating?: number
          reviewer_id?: string
          reviewer_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_reviews_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_reviews_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      join_requests: {
        Row: {
          created_at: string
          email: string
          id: string
          job_description: string
          message: string
          name: string
          phone: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          job_description?: string
          message?: string
          name: string
          phone?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          job_description?: string
          message?: string
          name?: string
          phone?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          production_id: string | null
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          production_id?: string | null
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          production_id?: string | null
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      productions: {
        Row: {
          address: string
          budget: number
          client: string
          created_at: string
          crew_booked: number
          crew_needed: number
          date: string | null
          days: number
          geofence_m: number
          id: string
          latitude: number | null
          location: string
          longitude: number | null
          name: string
          secured_funds: number
          status: string
          summary: string
          type: string
        }
        Insert: {
          address?: string
          budget?: number
          client: string
          created_at?: string
          crew_booked?: number
          crew_needed?: number
          date?: string | null
          days?: number
          geofence_m?: number
          id?: string
          latitude?: number | null
          location?: string
          longitude?: number | null
          name: string
          secured_funds?: number
          status?: string
          summary?: string
          type?: string
        }
        Update: {
          address?: string
          budget?: number
          client?: string
          created_at?: string
          crew_booked?: number
          crew_needed?: number
          date?: string | null
          days?: number
          geofence_m?: number
          id?: string
          latitude?: number | null
          location?: string
          longitude?: number | null
          name?: string
          secured_funds?: number
          status?: string
          summary?: string
          type?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string
          id: string
          phone?: string | null
          role?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          role?: string
        }
        Relationships: []
      }
      service_providers: {
        Row: {
          available: boolean
          created_at: string
          email: string
          id: string
          location: string
          name: string
          notes: string
          phone: string
          rate: number
          service_type: string
        }
        Insert: {
          available?: boolean
          created_at?: string
          email?: string
          id?: string
          location?: string
          name: string
          notes?: string
          phone?: string
          rate?: number
          service_type?: string
        }
        Update: {
          available?: boolean
          created_at?: string
          email?: string
          id?: string
          location?: string
          name?: string
          notes?: string
          phone?: string
          rate?: number
          service_type?: string
        }
        Relationships: []
      }
      site_attendance: {
        Row: {
          created_at: string
          crew_id: string | null
          distance_m: number | null
          id: string
          kind: string
          latitude: number | null
          longitude: number | null
          on_site: boolean | null
          person_name: string
          production_id: string
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          crew_id?: string | null
          distance_m?: number | null
          id?: string
          kind: string
          latitude?: number | null
          longitude?: number | null
          on_site?: boolean | null
          person_name?: string
          production_id: string
          source?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          crew_id?: string | null
          distance_m?: number | null
          id?: string
          kind?: string
          latitude?: number | null
          longitude?: number | null
          on_site?: boolean | null
          person_name?: string
          production_id?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_attendance_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_attendance_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      site_documents: {
        Row: {
          category: string
          created_at: string
          id: string
          name: string
          path: string
          production_id: string
          size: number
          uploaded_by: string
          uploader_name: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          name: string
          path: string
          production_id: string
          size?: number
          uploaded_by?: string
          uploader_name?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          path?: string
          production_id?: string
          size?: number
          uploaded_by?: string
          uploader_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_documents_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      site_posts: {
        Row: {
          attachments: Json
          audio_path: string | null
          author_id: string
          author_name: string
          body: string
          created_at: string
          id: string
          production_id: string
          transcript: string | null
        }
        Insert: {
          attachments?: Json
          audio_path?: string | null
          author_id?: string
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          production_id: string
          transcript?: string | null
        }
        Update: {
          attachments?: Json
          audio_path?: string | null
          author_id?: string
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          production_id?: string
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_posts_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      site_tasks: {
        Row: {
          assigned_crew_id: string | null
          created_at: string
          created_by: string
          done: boolean
          due_date: string | null
          id: string
          production_id: string
          title: string
        }
        Insert: {
          assigned_crew_id?: string | null
          created_at?: string
          created_by?: string
          done?: boolean
          due_date?: string | null
          id?: string
          production_id: string
          title: string
        }
        Update: {
          assigned_crew_id?: string | null
          created_at?: string
          created_by?: string
          done?: boolean
          due_date?: string | null
          id?: string
          production_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_tasks_assigned_crew_id_fkey"
            columns: ["assigned_crew_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_tasks_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          id: string
          name: string
          billing_email: string | null
          phone: string | null
          address: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          billing_email?: string | null
          phone?: string | null
          address?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          billing_email?: string | null
          phone?: string | null
          address?: string | null
          created_at?: string
        }
        Relationships: []
      }
      company_users: {
        Row: {
          id: string
          company_id: string
          user_id: string
          company_role: Database["public"]["Enums"]["company_role"]
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          user_id: string
          company_role?: Database["public"]["Enums"]["company_role"]
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          user_id?: string
          company_role?: Database["public"]["Enums"]["company_role"]
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_plans: {
        Row: {
          id: string
          membership_type: Database["public"]["Enums"]["app_role"]
          price_cents: number
          currency: string
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          membership_type: Database["public"]["Enums"]["app_role"]
          price_cents?: number
          currency?: string
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          membership_type?: Database["public"]["Enums"]["app_role"]
          price_cents?: number
          currency?: string
          active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      memberships: {
        Row: {
          id: string
          user_id: string
          membership_type: Database["public"]["Enums"]["app_role"]
          status: string
          plan_id: string | null
          started_at: string | null
          expires_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          membership_type: Database["public"]["Enums"]["app_role"]
          status?: string
          plan_id?: string | null
          started_at?: string | null
          expires_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          membership_type?: Database["public"]["Enums"]["app_role"]
          status?: string
          plan_id?: string | null
          started_at?: string | null
          expires_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_negotiations: {
        Row: {
          id: string
          booking_id: string
          proposed_by: string
          proposed_rate: number
          status: string
          note: string
          created_at: string
        }
        Insert: {
          id?: string
          booking_id: string
          proposed_by?: string
          proposed_rate: number
          status?: string
          note?: string
          created_at?: string
        }
        Update: {
          id?: string
          booking_id?: string
          proposed_by?: string
          proposed_rate?: number
          status?: string
          note?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_negotiations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          value: Json
          updated_at: string
        }
        Insert: {
          key: string
          value: Json
          updated_at?: string
        }
        Update: {
          key?: string
          value?: Json
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_crew_profile: { Args: never; Returns: string }
      crew_on_time_pct: { Args: { _crew_id: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_site_member: { Args: { _prod: string }; Returns: boolean }
      my_crew_id: { Args: never; Returns: string }
      site_members: {
        Args: { _prod: string }
        Returns: {
          booking_status: string
          crew_id: string
          department: string
          name: string
          phone: string
          photo_url: string
          role: string
          user_id: string
        }[]
      }
    }
    Enums: {
      app_role: "producer" | "crew" | "client" | "admin"
      company_role: "owner" | "producer" | "production_manager" | "accounts"
      booking_status: "draft" | "pencil" | "awaiting_crew_confirmation" | "confirmed" | "in_progress" | "awaiting_review" | "payment_released" | "completed" | "cancelled" | "disputed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["producer", "crew", "client", "admin"],
      company_role: ["owner", "producer", "production_manager", "accounts"],
      booking_status: ["draft", "pencil", "awaiting_crew_confirmation", "confirmed", "in_progress", "awaiting_review", "payment_released", "completed", "cancelled", "disputed"],
    },
  },
} as const
