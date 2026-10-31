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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          new_value: Json | null
          old_value: Json | null
          record_id: string | null
          record_table: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          record_id?: string | null
          record_table: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          record_id?: string | null
          record_table?: string
          user_id?: string | null
        }
        Relationships: []
      }
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
      booking_day_exclusions: {
        Row: {
          booking_id: string
          created_at: string
          excluded_date: string
          id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          excluded_date: string
          id?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          excluded_date?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_day_exclusions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_terms_acceptances: {
        Row: {
          accepted_at: string
          accepted_by: string
          booking_id: string
          crew_id: string
          id: string
          production_id: string
          terms_version: string
        }
        Insert: {
          accepted_at?: string
          accepted_by: string
          booking_id: string
          crew_id: string
          id?: string
          production_id: string
          terms_version: string
        }
        Update: {
          accepted_at?: string
          accepted_by?: string
          booking_id?: string
          crew_id?: string
          id?: string
          production_id?: string
          terms_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_terms_acceptances_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_terms_acceptances_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_terms_acceptances_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          attendance: string | null
          auto_approved: boolean
          booking_date: string | null
          call_time: string | null
          cancellation_pct: number | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          client_approved: boolean | null
          client_charge: number
          client_reviewed_at: string | null
          created_at: string
          created_by: string | null
          crew_id: string | null
          crew_rate: number
          days: number
          escrow_released_at: string | null
          id: string
          job_completed_at: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          pencil_expires_at: string | null
          pencil_priority: number | null
          postponed_to: string | null
          production_id: string
          review_deadline: string | null
          role: string
          status: Database["public"]["Enums"]["booking_status"]
          wrap_time: string | null
        }
        Insert: {
          attendance?: string | null
          auto_approved?: boolean
          booking_date?: string | null
          call_time?: string | null
          cancellation_pct?: number | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          client_approved?: boolean | null
          client_charge?: number
          client_reviewed_at?: string | null
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          crew_rate?: number
          days?: number
          escrow_released_at?: string | null
          id?: string
          job_completed_at?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pencil_expires_at?: string | null
          pencil_priority?: number | null
          postponed_to?: string | null
          production_id: string
          review_deadline?: string | null
          role: string
          status?: Database["public"]["Enums"]["booking_status"]
          wrap_time?: string | null
        }
        Update: {
          attendance?: string | null
          auto_approved?: boolean
          booking_date?: string | null
          call_time?: string | null
          cancellation_pct?: number | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          client_approved?: boolean | null
          client_charge?: number
          client_reviewed_at?: string | null
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          crew_rate?: number
          days?: number
          escrow_released_at?: string | null
          id?: string
          job_completed_at?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pencil_expires_at?: string | null
          pencil_priority?: number | null
          postponed_to?: string | null
          production_id?: string
          review_deadline?: string | null
          role?: string
          status?: Database["public"]["Enums"]["booking_status"]
          wrap_time?: string | null
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
      brief_matches: {
        Row: {
          brief: string
          client: string
          created_at: string
          created_by: string | null
          id: string
          result: Json
        }
        Insert: {
          brief: string
          client?: string
          created_at?: string
          created_by?: string | null
          id?: string
          result?: Json
        }
        Update: {
          brief?: string
          client?: string
          created_at?: string
          created_by?: string | null
          id?: string
          result?: Json
        }
        Relationships: []
      }
      calendar_feed_tokens: {
        Row: {
          created_at: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          token?: string
          user_id: string
        }
        Update: {
          created_at?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      change_requests: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string
          detail: string
          id: string
          kind: string
          production: string
          requested_by: string | null
          state: string
          who: string
        }
        Insert: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          detail: string
          id?: string
          kind: string
          production: string
          requested_by?: string | null
          state?: string
          who: string
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          detail?: string
          id?: string
          kind?: string
          production?: string
          requested_by?: string | null
          state?: string
          who?: string
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
      checklist_templates: {
        Row: {
          audience: string
          created_at: string
          id: string
          items: Json
          owner_id: string | null
          title: string
        }
        Insert: {
          audience: string
          created_at?: string
          id?: string
          items?: Json
          owner_id?: string | null
          title: string
        }
        Update: {
          audience?: string
          created_at?: string
          id?: string
          items?: Json
          owner_id?: string | null
          title?: string
        }
        Relationships: []
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
      community_gigs: {
        Row: {
          amount: number
          call_time: string
          cancelled_at: string | null
          contact_phone: string
          country: string
          created_at: string
          department: string
          description: string
          end_date: string | null
          event_date: string
          expires_at: string
          id: string
          kit_required: string
          pay_type: string
          penalty_amount: number
          penalty_reason: string | null
          posted_by: string
          poster_name: string
          role: string
          secure_fee: number
          secured_at: string | null
          secured_by: string | null
          secured_name: string | null
          status: string
          title: string
          venue: string
        }
        Insert: {
          amount: number
          call_time: string
          cancelled_at?: string | null
          contact_phone: string
          country: string
          created_at?: string
          department: string
          description: string
          end_date?: string | null
          event_date: string
          expires_at: string
          id?: string
          kit_required?: string
          pay_type: string
          penalty_amount?: number
          penalty_reason?: string | null
          posted_by?: string
          poster_name: string
          role: string
          secure_fee?: number
          secured_at?: string | null
          secured_by?: string | null
          secured_name?: string | null
          status?: string
          title: string
          venue: string
        }
        Update: {
          amount?: number
          call_time?: string
          cancelled_at?: string | null
          contact_phone?: string
          country?: string
          created_at?: string
          department?: string
          description?: string
          end_date?: string | null
          event_date?: string
          expires_at?: string
          id?: string
          kit_required?: string
          pay_type?: string
          penalty_amount?: number
          penalty_reason?: string | null
          posted_by?: string
          poster_name?: string
          role?: string
          secure_fee?: number
          secured_at?: string | null
          secured_by?: string | null
          secured_name?: string | null
          status?: string
          title?: string
          venue?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          address: string | null
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_branch_code: string | null
          bank_name: string | null
          billing_email: string | null
          created_at: string
          email_domain: string | null
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_branch_code?: string | null
          bank_name?: string | null
          billing_email?: string | null
          created_at?: string
          email_domain?: string | null
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_branch_code?: string | null
          bank_name?: string | null
          billing_email?: string | null
          created_at?: string
          email_domain?: string | null
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      company_invites: {
        Row: {
          accepted_at: string | null
          company_id: string
          company_role: Database["public"]["Enums"]["company_role"]
          created_at: string
          email: string
          id: string
          invited_by: string
          role_title: string | null
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          company_role?: Database["public"]["Enums"]["company_role"]
          created_at?: string
          email: string
          id?: string
          invited_by?: string
          role_title?: string | null
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          company_role?: Database["public"]["Enums"]["company_role"]
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          role_title?: string | null
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_join_requests: {
        Row: {
          company_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          email: string
          full_name: string | null
          id: string
          status: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email: string
          full_name?: string | null
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email?: string
          full_name?: string | null
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_join_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_memory: {
        Row: {
          client: string
          profile: Json
          sources: number
          summary: string
          updated_at: string
        }
        Insert: {
          client: string
          profile?: Json
          sources?: number
          summary?: string
          updated_at?: string
        }
        Update: {
          client?: string
          profile?: Json
          sources?: number
          summary?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_users: {
        Row: {
          company_id: string
          company_role: Database["public"]["Enums"]["company_role"]
          created_at: string
          id: string
          is_admin: boolean
          user_id: string
        }
        Insert: {
          company_id: string
          company_role?: Database["public"]["Enums"]["company_role"]
          created_at?: string
          id?: string
          is_admin?: boolean
          user_id: string
        }
        Update: {
          company_id?: string
          company_role?: Database["public"]["Enums"]["company_role"]
          created_at?: string
          id?: string
          is_admin?: boolean
          user_id?: string
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
      crew_checklist_items: {
        Row: {
          checklist_id: string
          done: boolean
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          checklist_id: string
          done?: boolean
          id?: string
          label: string
          sort_order?: number
        }
        Update: {
          checklist_id?: string
          done?: boolean
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "crew_checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "crew_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_checklists: {
        Row: {
          created_at: string
          crew_id: string
          id: string
          title: string
        }
        Insert: {
          created_at?: string
          crew_id: string
          id?: string
          title: string
        }
        Update: {
          created_at?: string
          crew_id?: string
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_checklists_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_group_members: {
        Row: {
          crew_id: string
          group_id: string
        }
        Insert: {
          crew_id: string
          group_id: string
        }
        Update: {
          crew_id?: string
          group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_group_members_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "crew_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_groups: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      crew_invoice_settings: {
        Row: {
          accent_color: string
          bank_details: string
          business_address: string
          business_name: string
          crew_id: string
          footer_text: string
          invoice_prefix: string
          logo_url: string
          tax_number: string
          vat_registered: boolean
          vat_rate: number
          tax_country: string
          customer_tax_number: string
          updated_at: string
        }
        Insert: {
          accent_color?: string
          bank_details?: string
          business_address?: string
          business_name?: string
          crew_id: string
          footer_text?: string
          invoice_prefix?: string
          logo_url?: string
          tax_number?: string
          vat_registered?: boolean
          vat_rate?: number
          tax_country?: string
          customer_tax_number?: string
          updated_at?: string
        }
        Update: {
          accent_color?: string
          bank_details?: string
          business_address?: string
          business_name?: string
          crew_id?: string
          footer_text?: string
          invoice_prefix?: string
          logo_url?: string
          tax_number?: string
          vat_registered?: boolean
          vat_rate?: number
          tax_country?: string
          customer_tax_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_invoice_settings_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: true
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
          instagram_url: string | null
          kit: string | null
          location: string
          name: string
          pencilled: boolean
          phone: string
          photo_url: string | null
          portfolio_url: string | null
          rating: number
          role: string
          safety_record: number
          skills: string[]
          team_led: number
          user_id: string | null
          vimeo_url: string | null
          youtube_url: string | null
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
          instagram_url?: string | null
          kit?: string | null
          location?: string
          name: string
          pencilled?: boolean
          phone?: string
          photo_url?: string | null
          portfolio_url?: string | null
          rating?: number
          role: string
          safety_record?: number
          skills?: string[]
          team_led?: number
          user_id?: string | null
          vimeo_url?: string | null
          youtube_url?: string | null
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
          instagram_url?: string | null
          kit?: string | null
          location?: string
          name?: string
          pencilled?: boolean
          phone?: string
          photo_url?: string | null
          portfolio_url?: string | null
          rating?: number
          role?: string
          safety_record?: number
          skills?: string[]
          team_led?: number
          user_id?: string | null
          vimeo_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      crew_reviews: {
        Row: {
          comment: string
          created_at: string
          crew_id: string
          criterion_comments: Json
          framework: string | null
          id: string
          overall_score: number | null
          production_id: string | null
          rating: number
          reviewer_id: string
          reviewer_name: string
          scores: Json
          work_again: string | null
        }
        Insert: {
          comment?: string
          created_at?: string
          crew_id: string
          criterion_comments?: Json
          framework?: string | null
          id?: string
          overall_score?: number | null
          production_id?: string | null
          rating: number
          reviewer_id?: string
          reviewer_name?: string
          scores?: Json
          work_again?: string | null
        }
        Update: {
          comment?: string
          created_at?: string
          crew_id?: string
          criterion_comments?: Json
          framework?: string | null
          id?: string
          overall_score?: number | null
          production_id?: string | null
          rating?: number
          reviewer_id?: string
          reviewer_name?: string
          scores?: Json
          work_again?: string | null
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
      disputes: {
        Row: {
          admin_decision: string | null
          amount_disputed: number
          booking_id: string
          created_at: string
          description: string
          evidence: string | null
          id: string
          opened_by: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          admin_decision?: string | null
          amount_disputed?: number
          booking_id: string
          created_at?: string
          description: string
          evidence?: string | null
          id?: string
          opened_by?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          admin_decision?: string | null
          amount_disputed?: number
          booking_id?: string
          created_at?: string
          description?: string
          evidence?: string | null
          id?: string
          opened_by?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      document_checklist_template_items: {
        Row: {
          amount: number | null
          id: string
          label: string
          sort_order: number
          template_id: string
        }
        Insert: {
          amount?: number | null
          id?: string
          label: string
          sort_order?: number
          template_id: string
        }
        Update: {
          amount?: number | null
          id?: string
          label?: string
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_checklist_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      document_checklist_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          kind: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          kind?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          kind?: string
          name?: string
        }
        Relationships: []
      }
      favourites: {
        Row: {
          created_at: string
          crew_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          crew_id: string
          id?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          crew_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favourites_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
        ]
      }
      gig_penalties: {
        Row: {
          amount: number
          charged_at: string | null
          created_at: string
          failure: string | null
          gig_id: string
          id: string
          reason: string | null
          reference: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          charged_at?: string | null
          created_at?: string
          failure?: string | null
          gig_id: string
          id?: string
          reason?: string | null
          reference?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          charged_at?: string | null
          created_at?: string
          failure?: string | null
          gig_id?: string
          id?: string
          reason?: string | null
          reference?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gig_penalties_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "community_gigs"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_checkouts: {
        Row: {
          checked_out_at: string
          checked_out_to: string
          created_at: string
          expected_return_at: string | null
          id: string
          item_id: string
          production_id: string | null
          quantity: number
          returned_at: string | null
        }
        Insert: {
          checked_out_at?: string
          checked_out_to?: string
          created_at?: string
          expected_return_at?: string | null
          id?: string
          item_id: string
          production_id?: string | null
          quantity?: number
          returned_at?: string | null
        }
        Update: {
          checked_out_at?: string
          checked_out_to?: string
          created_at?: string
          expected_return_at?: string | null
          id?: string
          item_id?: string
          production_id?: string | null
          quantity?: number
          returned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_checkouts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_checkouts_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category: string
          created_at: string
          id: string
          name: string
          notes: string
          total_count: number
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          name: string
          notes?: string
          total_count?: number
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string
          total_count?: number
        }
        Relationships: []
      }
      gig_negotiations: {
        Row: {
          agreed_rate: number | null
          booking_id: string
          created_at: string
          crew_id: string
          id: string
          latest_by: string
          latest_rate: number
          production_id: string
          status: string
          updated_at: string
        }
        Insert: {
          agreed_rate?: number | null
          booking_id: string
          created_at?: string
          crew_id: string
          id?: string
          latest_by: string
          latest_rate: number
          production_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          agreed_rate?: number | null
          booking_id?: string
          created_at?: string
          crew_id?: string
          id?: string
          latest_by?: string
          latest_rate?: number
          production_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gig_negotiations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_negotiations_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_negotiations_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_no_shows: {
        Row: {
          booking_id: string
          crew_id: string
          expires_at: string
          id: string
          occurred_on: string
          production_id: string
          replacement_booking_id: string | null
          reported_at: string
          reported_by: string
        }
        Insert: {
          booking_id: string
          crew_id: string
          expires_at: string
          id?: string
          occurred_on: string
          production_id: string
          replacement_booking_id?: string | null
          reported_at?: string
          reported_by: string
        }
        Update: {
          booking_id?: string
          crew_id?: string
          expires_at?: string
          id?: string
          occurred_on?: string
          production_id?: string
          replacement_booking_id?: string | null
          reported_at?: string
          reported_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_no_shows_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_no_shows_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_no_shows_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          booking_id: string
          created_at: string
          crew_confirmed_at: string | null
          crew_confirmed_by: string | null
          crew_id: string
          day_rate: number
          days: number
          equipment_amount: number
          id: string
          invoice_number: string
          issuer_snapshot: Json
          overtime_amount: number
          production_id: string
          service_description: string
          status: string
          subtotal: number
          total: number
          vat_amount: number
          vat_rate: number
          wrap_calculated_at: string | null
          wrap_fee: number
          wrap_hourly_rate: number
          wrap_minutes: number
        }
        Insert: {
          booking_id: string
          created_at?: string
          crew_confirmed_at?: string | null
          crew_confirmed_by?: string | null
          crew_id: string
          day_rate?: number
          days?: number
          equipment_amount?: number
          id?: string
          invoice_number?: string
          issuer_snapshot?: Json
          overtime_amount?: number
          production_id: string
          service_description?: string
          status?: string
          subtotal?: number
          total?: number
          vat_amount?: number
          vat_rate?: number
          wrap_calculated_at?: string | null
          wrap_fee?: number
          wrap_hourly_rate?: number
          wrap_minutes?: number
        }
        Update: {
          booking_id?: string
          created_at?: string
          crew_confirmed_at?: string | null
          crew_confirmed_by?: string | null
          crew_id?: string
          day_rate?: number
          days?: number
          equipment_amount?: number
          id?: string
          invoice_number?: string
          issuer_snapshot?: Json
          overtime_amount?: number
          production_id?: string
          service_description?: string
          status?: string
          subtotal?: number
          total?: number
          vat_amount?: number
          vat_rate?: number
          wrap_calculated_at?: string | null
          wrap_fee?: number
          wrap_hourly_rate?: number
          wrap_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_production_id_fkey"
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
      legal_acceptances: {
        Row: {
          accepted_at: string
          document_id: string
          id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          document_id: string
          id?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          document_id?: string
          id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_acceptances_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          active: boolean
          content: string
          created_at: string
          doc_type: string
          id: string
          title: string
          version: string
        }
        Insert: {
          active?: boolean
          content?: string
          created_at?: string
          doc_type: string
          id?: string
          title: string
          version: string
        }
        Update: {
          active?: boolean
          content?: string
          created_at?: string
          doc_type?: string
          id?: string
          title?: string
          version?: string
        }
        Relationships: []
      }
      membership_plans: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          id: string
          membership_type: Database["public"]["Enums"]["app_role"]
          price_cents: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          id?: string
          membership_type: Database["public"]["Enums"]["app_role"]
          price_cents?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          id?: string
          membership_type?: Database["public"]["Enums"]["app_role"]
          price_cents?: number
        }
        Relationships: []
      }
      memberships: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          membership_type: Database["public"]["Enums"]["app_role"]
          plan_id: string | null
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          membership_type: Database["public"]["Enums"]["app_role"]
          plan_id?: string | null
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          membership_type?: Database["public"]["Enums"]["app_role"]
          plan_id?: string | null
          started_at?: string | null
          status?: string
          user_id?: string
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
      messages: {
        Row: {
          body: string
          booking_id: string | null
          created_at: string
          id: string
          production_id: string
          sender_id: string
          sender_name: string
        }
        Insert: {
          body: string
          booking_id?: string | null
          created_at?: string
          id?: string
          production_id: string
          sender_id?: string
          sender_name?: string
        }
        Update: {
          body?: string
          booking_id?: string | null
          created_at?: string
          id?: string
          production_id?: string
          sender_id?: string
          sender_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_acknowledgement_audit: {
        Row: {
          activity_type: string
          actor_id: string
          actor_name: string
          id: string
          notification_id: string
          notification_title: string
          occurred_at: string
          production_id: string | null
        }
        Insert: {
          activity_type?: string
          actor_id: string
          actor_name: string
          id?: string
          notification_id: string
          notification_title: string
          occurred_at?: string
          production_id?: string | null
        }
        Update: {
          activity_type?: string
          actor_id?: string
          actor_name?: string
          id?: string
          notification_id?: string
          notification_title?: string
          occurred_at?: string
          production_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_acknowledgement_audit_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_acknowledgement_audit_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          body: string
          created_at: string
          id: string
          production_id: string | null
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          body?: string
          created_at?: string
          id?: string
          production_id?: string | null
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
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
      overtime_requests: {
        Row: {
          accepted_at: string | null
          crew_id: string
          decline_reason: string | null
          ended_at: string | null
          id: string
          production_id: string
          requested_at: string
          requested_by: string
          responded_at: string | null
          shift: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          crew_id: string
          decline_reason?: string | null
          ended_at?: string | null
          id?: string
          production_id: string
          requested_at?: string
          requested_by?: string
          responded_at?: string | null
          shift?: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          crew_id?: string
          decline_reason?: string | null
          ended_at?: string | null
          id?: string
          production_id?: string
          requested_at?: string
          requested_by?: string
          responded_at?: string | null
          shift?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "overtime_requests_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_requests_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_cards: {
        Row: {
          authorization_code: string
          bank: string | null
          card_type: string | null
          email: string
          last4: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          authorization_code: string
          bank?: string | null
          card_type?: string | null
          email: string
          last4?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          authorization_code?: string
          bank?: string | null
          card_type?: string | null
          email?: string
          last4?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      production_checklist_item_photos: {
        Row: {
          created_at: string
          id: string
          item_id: string
          path: string
          sort_order: number
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          path: string
          sort_order?: number
          uploaded_by?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          path?: string
          sort_order?: number
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_checklist_item_photos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "production_checklist_items"
            referencedColumns: ["id"]
          },
        ]
      }
      production_checklist_items: {
        Row: {
          checklist_id: string
          created_at: string
          created_by: string
          done: boolean
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          checklist_id: string
          created_at?: string
          created_by?: string
          done?: boolean
          id?: string
          label: string
          sort_order?: number
        }
        Update: {
          checklist_id?: string
          created_at?: string
          created_by?: string
          done?: boolean
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "production_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      production_checklists: {
        Row: {
          created_at: string
          created_by: string
          id: string
          production_id: string
          sort_order: number
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          production_id: string
          sort_order?: number
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          production_id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_checklists_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      production_document_items: {
        Row: {
          created_at: string
          id: string
          label: string
          production_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          production_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          production_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_document_items_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      production_escrow: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          escrow_transaction_id: string | null
          production_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          escrow_transaction_id?: string | null
          production_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          escrow_transaction_id?: string | null
          production_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_escrow_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: true
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      production_location_fees: {
        Row: {
          fee: number
          location_id: string
          production_id: string
          updated_at: string
        }
        Insert: {
          fee?: number
          location_id: string
          production_id: string
          updated_at?: string
        }
        Update: {
          fee?: number
          location_id?: string
          production_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_location_fees_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "production_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_location_fees_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      production_location_photos: {
        Row: {
          created_at: string
          id: string
          location_id: string
          path: string
          production_id: string
          sort_order: number
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          path: string
          production_id: string
          sort_order?: number
          uploaded_by?: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          path?: string
          production_id?: string
          sort_order?: number
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_location_photos_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "production_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_location_photos_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      production_locations: {
        Row: {
          address: string
          created_at: string
          ends_at: string | null
          id: string
          label: string
          latitude: number | null
          longitude: number | null
          production_id: string
          recce_date: string | null
          recce_end_time: string | null
          recce_start_time: string | null
          sort_order: number
          starts_at: string | null
        }
        Insert: {
          address?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          label: string
          latitude?: number | null
          longitude?: number | null
          production_id: string
          recce_date?: string | null
          recce_end_time?: string | null
          recce_start_time?: string | null
          sort_order?: number
          starts_at?: string | null
        }
        Update: {
          address?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          label?: string
          latitude?: number | null
          longitude?: number | null
          production_id?: string
          recce_date?: string | null
          recce_end_time?: string | null
          recce_start_time?: string | null
          sort_order?: number
          starts_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_locations_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      production_retrospectives: {
        Row: {
          client: string
          created_at: string
          created_by: string | null
          form: Json
          id: string
          lessons: string
          memory: Json
          production_id: string
          updated_at: string
        }
        Insert: {
          client?: string
          created_at?: string
          created_by?: string | null
          form?: Json
          id?: string
          lessons?: string
          memory?: Json
          production_id: string
          updated_at?: string
        }
        Update: {
          client?: string
          created_at?: string
          created_by?: string | null
          form?: Json
          id?: string
          lessons?: string
          memory?: Json
          production_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_retrospectives_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: true
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      production_risks: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          location_id: string | null
          production_id: string
          text: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string | null
          production_id: string
          text: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string | null
          production_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_risks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "production_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_risks_production_id_fkey"
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
          company_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          crew_booked: number
          crew_needed: number
          currency: string
          date: string | null
          days: number
          end_date: string | null
          external_ref: string | null
          gear_dropoff_date: string | null
          gear_dropoff_time: string | null
          gear_pickup_date: string | null
          gear_pickup_time: string | null
          geofence_m: number
          id: string
          image_path: string | null
          job_id: string
          latitude: number | null
          location: string
          longitude: number | null
          name: string
          post_rules: string
          post_rules_hidden: boolean
          recce_date: string | null
          recce_end_time: string | null
          recce_start_time: string | null
          secured_funds: number
          status: string
          summary: string
          timezone: string
          type: string
        }
        Insert: {
          address?: string
          budget?: number
          client: string
          company_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          crew_booked?: number
          crew_needed?: number
          currency?: string
          date?: string | null
          days?: number
          end_date?: string | null
          external_ref?: string | null
          gear_dropoff_date?: string | null
          gear_dropoff_time?: string | null
          gear_pickup_date?: string | null
          gear_pickup_time?: string | null
          geofence_m?: number
          id?: string
          image_path?: string | null
          job_id: string
          latitude?: number | null
          location?: string
          longitude?: number | null
          name: string
          post_rules?: string
          post_rules_hidden?: boolean
          recce_date?: string | null
          recce_end_time?: string | null
          recce_start_time?: string | null
          secured_funds?: number
          status?: string
          summary?: string
          timezone?: string
          type?: string
        }
        Update: {
          address?: string
          budget?: number
          client?: string
          company_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          crew_booked?: number
          crew_needed?: number
          currency?: string
          date?: string | null
          days?: number
          end_date?: string | null
          external_ref?: string | null
          gear_dropoff_date?: string | null
          gear_dropoff_time?: string | null
          gear_pickup_date?: string | null
          gear_pickup_time?: string | null
          geofence_m?: number
          id?: string
          image_path?: string | null
          job_id?: string
          latitude?: number | null
          location?: string
          longitude?: number | null
          name?: string
          post_rules?: string
          post_rules_hidden?: boolean
          recce_date?: string | null
          recce_end_time?: string | null
          recce_start_time?: string | null
          secured_funds?: number
          status?: string
          summary?: string
          timezone?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "productions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          country: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          role: string
          skills: string[]
          social_opt_in: boolean
          spotlight_featured_at: string | null
          suspended: boolean
          whatsapp_number: string | null
        }
        Insert: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          email: string
          full_name?: string
          id: string
          phone?: string | null
          role?: string
          skills?: string[]
          social_opt_in?: boolean
          spotlight_featured_at?: string | null
          suspended?: boolean
          whatsapp_number?: string | null
        }
        Update: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          role?: string
          skills?: string[]
          social_opt_in?: boolean
          spotlight_featured_at?: string | null
          suspended?: boolean
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      rate_negotiations: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          note: string
          proposed_by: string
          proposed_rate: number
          status: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          note?: string
          proposed_by?: string
          proposed_rate: number
          status?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          note?: string
          proposed_by?: string
          proposed_rate?: number
          status?: string
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
          checklist_item_id: string | null
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
          checklist_item_id?: string | null
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
          checklist_item_id?: string | null
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
            foreignKeyName: "site_documents_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "production_document_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_documents_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      site_photo_groups: {
        Row: {
          created_at: string
          created_by: string
          group_date: string | null
          id: string
          name: string
          production_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          group_date?: string | null
          id?: string
          name: string
          production_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          group_date?: string | null
          id?: string
          name?: string
          production_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_photo_groups_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      site_photo_tags: {
        Row: {
          created_at: string
          crew_id: string
          photo_id: string
          production_id: string
          tagged_by: string
        }
        Insert: {
          created_at?: string
          crew_id: string
          photo_id: string
          production_id: string
          tagged_by?: string
        }
        Update: {
          created_at?: string
          crew_id?: string
          photo_id?: string
          production_id?: string
          tagged_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_photo_tags_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_photo_tags_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "site_photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_photo_tags_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      site_photos: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          location_id: string | null
          path: string
          production_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          location_id?: string | null
          path: string
          production_id: string
          uploaded_by?: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          location_id?: string | null
          path?: string
          production_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_photos_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "site_photo_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_photos_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "production_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_photos_production_id_fkey"
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
          is_public: boolean
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
          is_public?: boolean
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
          is_public?: boolean
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
      site_wraps: {
        Row: {
          created_at: string
          crew_id: string
          id: string
          left_at: string | null
          production_id: string
          wrapped_at: string
          wrapped_by: string
        }
        Insert: {
          created_at?: string
          crew_id: string
          id?: string
          left_at?: string | null
          production_id: string
          wrapped_at?: string
          wrapped_by?: string
        }
        Update: {
          created_at?: string
          crew_id?: string
          id?: string
          left_at?: string | null
          production_id?: string
          wrapped_at?: string
          wrapped_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_wraps_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_wraps_production_id_fkey"
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
      whatsapp_outbox: {
        Row: {
          body: string
          created_at: string
          id: string
          phone: string | null
          status: string
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          phone?: string | null
          status?: string
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          phone?: string | null
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_booking_with_terms: {
        Args: { p_booking_id: string; p_terms_version: string }
        Returns: undefined
      }
      acknowledge_notification: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      apply_checklist_template: {
        Args: {
          p_crew_id?: string
          p_production_id?: string
          p_template_id: string
        }
        Returns: undefined
      }
      approve_job: { Args: { _booking: string }; Returns: undefined }
      auto_approve_reviews: { Args: never; Returns: undefined }
      cancel_booking: {
        Args: { _booking: string; _postponed_to?: string; _reason: string }
        Returns: undefined
      }
      claim_crew_profile: { Args: never; Returns: string }
      claim_gig: { Args: { _booking: string }; Returns: undefined }
      claim_gig_with_terms: {
        Args: { p_booking_id: string; p_terms_version: string }
        Returns: undefined
      }
      company_should_auto_admin: {
        Args: { _company: string }
        Returns: boolean
      }
      company_team: {
        Args: { _company: string }
        Returns: {
          company_role: Database["public"]["Enums"]["company_role"]
          email: string
          full_name: string
          is_admin: boolean
          user_id: string
        }[]
      }
      complete_gig: { Args: { _gig: string }; Returns: undefined }
      complete_production: {
        Args: { p_production_id: string }
        Returns: undefined
      }
      crew_on_time_pct: { Args: { _crew_id: string }; Returns: number }
      decide_join_request: {
        Args: { _approve: boolean; _request: string }
        Returns: undefined
      }
      email_domain_of: { Args: { _email: string }; Returns: string }
      expire_pencils: { Args: never; Returns: undefined }
      generate_invoice: { Args: { _booking: string }; Returns: string }
      get_invite: {
        Args: { _token: string }
        Returns: {
          company_name: string
          company_role: Database["public"]["Enums"]["company_role"]
          email: string
          valid: boolean
        }[]
      }
      gig_setting: { Args: { _default: number; _key: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_admin: {
        Args: { _company: string; _user: string }
        Returns: boolean
      }
      is_company_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_company_owner: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_site_member: { Args: { _prod: string }; Returns: boolean }
      mark_payment_received: { Args: { _booking: string }; Returns: undefined }
      my_crew_id: { Args: never; Returns: string }
      open_gigs: {
        Args: never
        Returns: {
          address: string
          booking_date: string
          call_time: string
          crew_rate: number
          days: number
          id: string
          latitude: number
          location: string
          longitude: number
          production_id: string
          production_name: string
          role: string
        }[]
      }
      release_payment: { Args: { _booking: string }; Returns: string }
      report_gig_no_show: { Args: { _gig: string }; Returns: number }
      secure_gig: { Args: { _gig: string }; Returns: undefined }
      secure_gig_paid: {
        Args: { _gig: string; _user: string }
        Returns: undefined
      }
      set_company_admin: {
        Args: { _admin: boolean; _company: string; _user: string }
        Returns: undefined
      }
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
      withdraw_from_gig: { Args: { _gig: string }; Returns: number }
    }
    Enums: {
      app_role: "producer" | "crew" | "client" | "admin"
      booking_status:
        | "draft"
        | "pencil"
        | "awaiting_crew_confirmation"
        | "confirmed"
        | "in_progress"
        | "awaiting_review"
        | "payment_released"
        | "completed"
        | "cancelled"
        | "disputed"
        | "open"
      company_role:
        | "owner"
        | "producer"
        | "production_manager"
        | "accounts"
        | "other"
      payment_status:
        | "not_required"
        | "payment_required"
        | "payment_received"
        | "funds_held"
        | "awaiting_release"
        | "release_authorised"
        | "payment_released"
        | "payment_failed"
        | "payment_disputed"
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
      booking_status: [
        "draft",
        "pencil",
        "awaiting_crew_confirmation",
        "confirmed",
        "in_progress",
        "awaiting_review",
        "payment_released",
        "completed",
        "cancelled",
        "disputed",
        "open",
      ],
      company_role: [
        "owner",
        "producer",
        "production_manager",
        "accounts",
        "other",
      ],
      payment_status: [
        "not_required",
        "payment_required",
        "payment_received",
        "funds_held",
        "awaiting_release",
        "release_authorised",
        "payment_released",
        "payment_failed",
        "payment_disputed",
      ],
    },
  },
} as const
