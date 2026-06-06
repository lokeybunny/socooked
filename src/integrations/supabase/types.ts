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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          meta: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          meta?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          meta?: Json
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      af_agent_contacts: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          is_valid: boolean
          phone: string
          phone_type: string
          source: string | null
          validated_at: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          is_valid?: boolean
          phone: string
          phone_type?: string
          source?: string | null
          validated_at?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          is_valid?: boolean
          phone?: string
          phone_type?: string
          source?: string | null
          validated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "af_agent_contacts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "af_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      af_agent_listings: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          listing_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          listing_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          listing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "af_agent_listings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "af_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "af_agent_listings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "af_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      af_agents: {
        Row: {
          agent_profile_url: string | null
          agent_zuid: string | null
          brokerage: string | null
          city: string | null
          created_at: string
          email: string | null
          id: string
          is_premier_agent: boolean | null
          last_profile_scraped_at: string | null
          name: string
          normalized_key: string
          profile_url: string | null
          skip_reason: string | null
          source: string
          zuid: string | null
        }
        Insert: {
          agent_profile_url?: string | null
          agent_zuid?: string | null
          brokerage?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_premier_agent?: boolean | null
          last_profile_scraped_at?: string | null
          name: string
          normalized_key: string
          profile_url?: string | null
          skip_reason?: string | null
          source?: string
          zuid?: string | null
        }
        Update: {
          agent_profile_url?: string | null
          agent_zuid?: string | null
          brokerage?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_premier_agent?: boolean | null
          last_profile_scraped_at?: string | null
          name?: string
          normalized_key?: string
          profile_url?: string | null
          skip_reason?: string | null
          source?: string
          zuid?: string | null
        }
        Relationships: []
      }
      af_listings: {
        Row: {
          address: string | null
          city: string | null
          id: string
          listing_url: string | null
          price: number | null
          scraped_at: string
          state: string | null
          zip: string | null
          zpid: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          id?: string
          listing_url?: string | null
          price?: number | null
          scraped_at?: string
          state?: string | null
          zip?: string | null
          zpid: string
        }
        Update: {
          address?: string | null
          city?: string | null
          id?: string
          listing_url?: string | null
          price?: number | null
          scraped_at?: string
          state?: string | null
          zip?: string | null
          zpid?: string
        }
        Relationships: []
      }
      af_scrape_jobs: {
        Row: {
          completed_at: string | null
          error_log: string | null
          id: string
          new_agents: number
          new_listings: number
          new_valid_mobiles: number
          pages_scraped: number
          started_at: string
          status: string
          target_location: string | null
        }
        Insert: {
          completed_at?: string | null
          error_log?: string | null
          id?: string
          new_agents?: number
          new_listings?: number
          new_valid_mobiles?: number
          pages_scraped?: number
          started_at?: string
          status?: string
          target_location?: string | null
        }
        Update: {
          completed_at?: string | null
          error_log?: string | null
          id?: string
          new_agents?: number
          new_listings?: number
          new_valid_mobiles?: number
          pages_scraped?: number
          started_at?: string
          status?: string
          target_location?: string | null
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string
          event_label: string | null
          event_name: string
          event_value: number | null
          id: string
          meta: Json
          path: string | null
          session_id: string | null
          visitor_id: string
        }
        Insert: {
          created_at?: string
          event_label?: string | null
          event_name: string
          event_value?: number | null
          id?: string
          meta?: Json
          path?: string | null
          session_id?: string | null
          visitor_id: string
        }
        Update: {
          created_at?: string
          event_label?: string | null
          event_name?: string
          event_value?: number | null
          id?: string
          meta?: Json
          path?: string | null
          session_id?: string | null
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "analytics_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_pageviews: {
        Row: {
          created_at: string
          id: string
          path: string
          referrer: string | null
          scroll_depth_pct: number | null
          session_id: string
          time_on_page_seconds: number | null
          title: string | null
          visitor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          path: string
          referrer?: string | null
          scroll_depth_pct?: number | null
          session_id: string
          time_on_page_seconds?: number | null
          title?: string | null
          visitor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          path?: string
          referrer?: string | null
          scroll_depth_pct?: number | null
          session_id?: string
          time_on_page_seconds?: number | null
          title?: string | null
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_pageviews_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "analytics_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_sessions: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          created_at: string
          customer_id: string | null
          device_type: string | null
          duration_seconds: number | null
          ended_at: string | null
          events_count: number | null
          exit_path: string | null
          id: string
          ip_hash: string | null
          is_bounce: boolean | null
          landing_path: string | null
          last_seen_at: string
          meta: Json
          os: string | null
          page_views_count: number | null
          referrer: string | null
          referrer_domain: string | null
          region: string | null
          started_at: string
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          customer_id?: string | null
          device_type?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          events_count?: number | null
          exit_path?: string | null
          id?: string
          ip_hash?: string | null
          is_bounce?: boolean | null
          landing_path?: string | null
          last_seen_at?: string
          meta?: Json
          os?: string | null
          page_views_count?: number | null
          referrer?: string | null
          referrer_domain?: string | null
          region?: string | null
          started_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id: string
        }
        Update: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          customer_id?: string | null
          device_type?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          events_count?: number | null
          exit_path?: string | null
          id?: string
          ip_hash?: string | null
          is_bounce?: boolean | null
          landing_path?: string | null
          last_seen_at?: string
          meta?: Json
          os?: string | null
          page_views_count?: number | null
          referrer?: string | null
          referrer_domain?: string | null
          region?: string | null
          started_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      api_previews: {
        Row: {
          archived_at: string | null
          bot_task_id: string | null
          created_at: string
          customer_id: string | null
          edit_url: string | null
          id: string
          meta: Json
          preview_url: string | null
          prompt: string | null
          source: string
          status: string
          thread_id: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          bot_task_id?: string | null
          created_at?: string
          customer_id?: string | null
          edit_url?: string | null
          id?: string
          meta?: Json
          preview_url?: string | null
          prompt?: string | null
          source?: string
          status?: string
          thread_id?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          bot_task_id?: string | null
          created_at?: string
          customer_id?: string | null
          edit_url?: string | null
          id?: string
          meta?: Json
          preview_url?: string | null
          prompt?: string | null
          source?: string
          status?: string
          thread_id?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_previews_bot_task_id_fkey"
            columns: ["bot_task_id"]
            isOneToOne: false
            referencedRelation: "bot_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_previews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_previews_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      apify_blocked_workers: {
        Row: {
          actor_shortcode: string
          blocked_at: string
          id: string
          reason: string | null
        }
        Insert: {
          actor_shortcode: string
          blocked_at?: string
          id?: string
          reason?: string | null
        }
        Update: {
          actor_shortcode?: string
          blocked_at?: string
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      apify_config: {
        Row: {
          api_key: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          updated_at: string
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      arbitrage_items: {
        Row: {
          asking_price: number | null
          blur_image_url: string | null
          condition_notes: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          extra_images: string[] | null
          id: string
          item_name: string
          meta: Json
          nobg_image_url: string | null
          original_image_url: string | null
          pawn_shop_address: string | null
          sku: string | null
          status: string
          store_id: string | null
          updated_at: string
          wiggle_room_price: number | null
        }
        Insert: {
          asking_price?: number | null
          blur_image_url?: string | null
          condition_notes?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          extra_images?: string[] | null
          id?: string
          item_name?: string
          meta?: Json
          nobg_image_url?: string | null
          original_image_url?: string | null
          pawn_shop_address?: string | null
          sku?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
          wiggle_room_price?: number | null
        }
        Update: {
          asking_price?: number | null
          blur_image_url?: string | null
          condition_notes?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          extra_images?: string[] | null
          id?: string
          item_name?: string
          meta?: Json
          nobg_image_url?: string | null
          original_image_url?: string | null
          pawn_shop_address?: string | null
          sku?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
          wiggle_room_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "arbitrage_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "arbitrage_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      arbitrage_reminders: {
        Row: {
          created_at: string
          id: string
          is_dismissed: boolean
          item_id: string
          notes: string | null
          reminder_date: string
          reminder_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_dismissed?: boolean
          item_id: string
          notes?: string | null
          reminder_date: string
          reminder_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_dismissed?: boolean
          item_id?: string
          notes?: string | null
          reminder_date?: string
          reminder_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "arbitrage_reminders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "arbitrage_items"
            referencedColumns: ["id"]
          },
        ]
      }
      arbitrage_stores: {
        Row: {
          address: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          email: string | null
          id: string
          meta: Json
          notes: string | null
          store_name: string
          store_number: number
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          email?: string | null
          id?: string
          meta?: Json
          notes?: string | null
          store_name: string
          store_number?: number
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          email?: string | null
          id?: string
          meta?: Json
          notes?: string | null
          store_name?: string
          store_number?: number
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      auto_callback_queue: {
        Row: {
          answered_by: string | null
          attempts: number
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          id: string
          last_error: string | null
          meta: Json
          phone: string
          phone_last10: string
          scheduled_at: string
          source_missed_call_event_id: string | null
          source_vapi_call_id: string | null
          status: string
          twilio_call_sid: string | null
          updated_at: string
        }
        Insert: {
          answered_by?: string | null
          attempts?: number
          created_at?: string
          customer_id?: string | null
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          meta?: Json
          phone: string
          phone_last10: string
          scheduled_at?: string
          source_missed_call_event_id?: string | null
          source_vapi_call_id?: string | null
          status?: string
          twilio_call_sid?: string | null
          updated_at?: string
        }
        Update: {
          answered_by?: string | null
          attempts?: number
          created_at?: string
          customer_id?: string | null
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          meta?: Json
          phone?: string
          phone_last10?: string
          scheduled_at?: string
          source_missed_call_event_id?: string | null
          source_vapi_call_id?: string | null
          status?: string
          twilio_call_sid?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      auto_reply_kill_log: {
        Row: {
          created_at: string
          id: string
          meta: Json | null
          phone: string | null
          reason: string | null
          source: string
        }
        Insert: {
          created_at?: string
          id?: string
          meta?: Json | null
          phone?: string | null
          reason?: string | null
          source: string
        }
        Update: {
          created_at?: string
          id?: string
          meta?: Json | null
          phone?: string | null
          reason?: string | null
          source?: string
        }
        Relationships: []
      }
      automations: {
        Row: {
          actions: Json
          conditions: Json
          created_at: string
          created_by: string | null
          id: string
          is_enabled: boolean
          name: string
          trigger_event: string
          trigger_table: string
        }
        Insert: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_enabled?: boolean
          name: string
          trigger_event: string
          trigger_table: string
        }
        Update: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_enabled?: boolean
          name?: string
          trigger_event?: string
          trigger_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "automations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_slots: {
        Row: {
          created_at: string
          created_by: string | null
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_slots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      boards: {
        Row: {
          category: string | null
          created_at: string
          customer_id: string | null
          deadline: string | null
          description: string | null
          id: string
          name: string
          owner_id: string | null
          visibility: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          customer_id?: string | null
          deadline?: string | null
          description?: string | null
          id?: string
          name: string
          owner_id?: string | null
          visibility?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          customer_id?: string | null
          deadline?: string | null
          description?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "boards_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boards_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          booking_date: string
          created_at: string
          duration_minutes: number
          end_time: string
          guest_email: string
          guest_name: string
          guest_phone: string | null
          id: string
          meeting_id: string | null
          meeting_type: string
          notes: string | null
          room_code: string | null
          start_time: string
          status: string
          updated_at: string
        }
        Insert: {
          booking_date: string
          created_at?: string
          duration_minutes?: number
          end_time: string
          guest_email: string
          guest_name: string
          guest_phone?: string | null
          id?: string
          meeting_id?: string | null
          meeting_type?: string
          notes?: string | null
          room_code?: string | null
          start_time: string
          status?: string
          updated_at?: string
        }
        Update: {
          booking_date?: string
          created_at?: string
          duration_minutes?: number
          end_time?: string
          guest_email?: string
          guest_name?: string
          guest_phone?: string | null
          id?: string
          meeting_id?: string | null
          meeting_type?: string
          notes?: string | null
          room_code?: string | null
          start_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_tasks: {
        Row: {
          bot_agent: string
          created_at: string
          customer_id: string | null
          description: string | null
          due_date: string | null
          id: string
          meta: Json
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          bot_agent: string
          created_at?: string
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          meta?: Json
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          bot_agent?: string
          created_at?: string
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          meta?: Json
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
          category: string | null
          color: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string | null
          end_time: string | null
          id: string
          location: string | null
          recurrence: string | null
          reminder_minutes: number | null
          source: string
          source_id: string | null
          start_time: string
          title: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          category?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          location?: string | null
          recurrence?: string | null
          reminder_minutes?: number | null
          source?: string
          source_id?: string | null
          start_time: string
          title: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          category?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          location?: string | null
          recurrence?: string | null
          reminder_minutes?: number | null
          source?: string
          source_id?: string | null
          start_time?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_activity_log: {
        Row: {
          contact_id: string | null
          created_at: string
          id: string
          is_test: boolean
          level: string
          message: string | null
          meta: Json | null
          step: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          id?: string
          is_test?: boolean
          level?: string
          message?: string | null
          meta?: Json | null
          step?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          id?: string
          is_test?: boolean
          level?: string
          message?: string | null
          meta?: Json | null
          step?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_activity_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "campaign_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_contacts: {
        Row: {
          campaign_date: string
          city: string | null
          created_at: string
          email: string | null
          email_sent_at: string | null
          email_status: string | null
          email_variant: number | null
          error_message: string | null
          first_name: string | null
          id: string
          is_test: boolean
          last_step: string | null
          lead_id: string | null
          phone_e164: string | null
          property_address: string | null
          retry_count: number
          sms_retry_count: number
          sms_sent_at: string | null
          sms_status: string | null
          sms_variant: number | null
          state: string | null
          status: string
          updated_at: string
        }
        Insert: {
          campaign_date?: string
          city?: string | null
          created_at?: string
          email?: string | null
          email_sent_at?: string | null
          email_status?: string | null
          email_variant?: number | null
          error_message?: string | null
          first_name?: string | null
          id?: string
          is_test?: boolean
          last_step?: string | null
          lead_id?: string | null
          phone_e164?: string | null
          property_address?: string | null
          retry_count?: number
          sms_retry_count?: number
          sms_sent_at?: string | null
          sms_status?: string | null
          sms_variant?: number | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_date?: string
          city?: string | null
          created_at?: string
          email?: string | null
          email_sent_at?: string | null
          email_status?: string | null
          email_variant?: number | null
          error_message?: string | null
          first_name?: string | null
          id?: string
          is_test?: boolean
          last_step?: string | null
          lead_id?: string | null
          phone_e164?: string | null
          property_address?: string | null
          retry_count?: number
          sms_retry_count?: number
          sms_sent_at?: string | null
          sms_status?: string | null
          sms_variant?: number | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "state_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_daily_stats: {
        Row: {
          campaign_date: string
          emails_failed: number
          emails_sent: number
          sms_failed: number
          sms_sent: number
          updated_at: string
        }
        Insert: {
          campaign_date?: string
          emails_failed?: number
          emails_sent?: number
          sms_failed?: number
          sms_sent?: number
          updated_at?: string
        }
        Update: {
          campaign_date?: string
          emails_failed?: number
          emails_sent?: number
          sms_failed?: number
          sms_sent?: number
          updated_at?: string
        }
        Relationships: []
      }
      campaign_sent_log: {
        Row: {
          channel: string
          contact_id: string | null
          created_at: string
          email: string | null
          id: string
          lead_id: string | null
          phone_e164: string | null
          sent_at: string
        }
        Insert: {
          channel: string
          contact_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lead_id?: string | null
          phone_e164?: string | null
          sent_at?: string
        }
        Update: {
          channel?: string
          contact_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lead_id?: string | null
          phone_e164?: string | null
          sent_at?: string
        }
        Relationships: []
      }
      campaign_settings: {
        Row: {
          batch_size: number
          channel_mode: string
          daily_email_cap: number
          daily_sms_cap: number
          drain_active: boolean
          drain_last_tick_at: string | null
          drain_started_at: string | null
          end_hour_pt: number
          failure_threshold_pct: number
          id: number
          is_paused: boolean
          is_production: boolean
          max_delay_seconds: number
          min_delay_seconds: number
          sms_max_gap_seconds: number
          sms_max_retries: number
          sms_min_gap_seconds: number
          start_hour_pt: number
          stop_requested: boolean
          updated_at: string
        }
        Insert: {
          batch_size?: number
          channel_mode?: string
          daily_email_cap?: number
          daily_sms_cap?: number
          drain_active?: boolean
          drain_last_tick_at?: string | null
          drain_started_at?: string | null
          end_hour_pt?: number
          failure_threshold_pct?: number
          id?: number
          is_paused?: boolean
          is_production?: boolean
          max_delay_seconds?: number
          min_delay_seconds?: number
          sms_max_gap_seconds?: number
          sms_max_retries?: number
          sms_min_gap_seconds?: number
          start_hour_pt?: number
          stop_requested?: boolean
          updated_at?: string
        }
        Update: {
          batch_size?: number
          channel_mode?: string
          daily_email_cap?: number
          daily_sms_cap?: number
          drain_active?: boolean
          drain_last_tick_at?: string | null
          drain_started_at?: string | null
          end_hour_pt?: number
          failure_threshold_pct?: number
          id?: number
          is_paused?: boolean
          is_production?: boolean
          max_delay_seconds?: number
          min_delay_seconds?: number
          sms_max_gap_seconds?: number
          sms_max_retries?: number
          sms_min_gap_seconds?: number
          start_hour_pt?: number
          stop_requested?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      card_attachments: {
        Row: {
          card_id: string
          created_at: string
          id: string
          storage_path: string | null
          title: string | null
          type: string
          url: string | null
        }
        Insert: {
          card_id: string
          created_at?: string
          id?: string
          storage_path?: string | null
          title?: string | null
          type: string
          url?: string | null
        }
        Update: {
          card_id?: string
          created_at?: string
          id?: string
          storage_path?: string | null
          title?: string | null
          type?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "card_attachments_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      card_comments: {
        Row: {
          author_id: string | null
          body: string
          card_id: string
          created_at: string
          id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          card_id: string
          created_at?: string
          id?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          card_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_comments_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      card_labels: {
        Row: {
          card_id: string
          label_id: string
        }
        Insert: {
          card_id: string
          label_id: string
        }
        Update: {
          card_id?: string
          label_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_labels_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          assigned_to: string | null
          board_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          deal_id: string | null
          description: string | null
          due_date: string | null
          external_id: string | null
          id: string
          list_id: string
          position: number
          priority: string
          source: string | null
          source_url: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          board_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          external_id?: string | null
          id?: string
          list_id: string
          position?: number
          priority?: string
          source?: string | null
          source_url?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          board_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          external_id?: string | null
          id?: string
          list_id?: string
          position?: number
          priority?: string
          source?: string | null
          source_url?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          checklist_id: string
          content: string
          created_at: string
          id: string
          is_done: boolean
          position: number
        }
        Insert: {
          checklist_id: string
          content: string
          created_at?: string
          id?: string
          is_done?: boolean
          position?: number
        }
        Update: {
          checklist_id?: string
          content?: string
          created_at?: string
          id?: string
          is_done?: boolean
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      checklists: {
        Row: {
          card_id: string
          created_at: string
          id: string
          title: string
        }
        Insert: {
          card_id: string
          created_at?: string
          id?: string
          title?: string
        }
        Update: {
          card_id?: string
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklists_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_scrapes: {
        Row: {
          apify_run_id: string | null
          community_url: string
          created_at: string
          id: string
          member_count: number
          members: Json
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          apify_run_id?: string | null
          community_url: string
          created_at?: string
          id?: string
          member_count?: number
          members?: Json
          name?: string
          status?: string
          updated_at?: string
        }
        Update: {
          apify_run_id?: string | null
          community_url?: string
          created_at?: string
          id?: string
          member_count?: number
          members?: Json
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      communications: {
        Row: {
          body: string | null
          created_at: string
          customer_id: string | null
          direction: string
          duration_seconds: number | null
          external_id: string | null
          from_address: string | null
          id: string
          media_urls: Json | null
          metadata: Json
          phone_number: string | null
          provider: string | null
          status: string
          subject: string | null
          to_address: string | null
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          customer_id?: string | null
          direction?: string
          duration_seconds?: number | null
          external_id?: string | null
          from_address?: string | null
          id?: string
          media_urls?: Json | null
          metadata?: Json
          phone_number?: string | null
          provider?: string | null
          status?: string
          subject?: string | null
          to_address?: string | null
          type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          customer_id?: string | null
          direction?: string
          duration_seconds?: number | null
          external_id?: string | null
          from_address?: string | null
          id?: string
          media_urls?: Json | null
          metadata?: Json
          phone_number?: string | null
          provider?: string | null
          status?: string
          subject?: string | null
          to_address?: string | null
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_transcripts: {
        Row: {
          analysis: Json | null
          audio_url: string | null
          chatgpt_prompt: string | null
          client_wants: string[] | null
          conversation_type: string | null
          created_at: string
          duration_seconds: number | null
          filename: string | null
          id: string
          phone_last10: string
          sentiment: string | null
          summary: string | null
          title: string | null
          transcript: string | null
          updated_at: string
          voice_count: number | null
        }
        Insert: {
          analysis?: Json | null
          audio_url?: string | null
          chatgpt_prompt?: string | null
          client_wants?: string[] | null
          conversation_type?: string | null
          created_at?: string
          duration_seconds?: number | null
          filename?: string | null
          id?: string
          phone_last10: string
          sentiment?: string | null
          summary?: string | null
          title?: string | null
          transcript?: string | null
          updated_at?: string
          voice_count?: number | null
        }
        Update: {
          analysis?: Json | null
          audio_url?: string | null
          chatgpt_prompt?: string | null
          client_wants?: string[] | null
          conversation_type?: string | null
          created_at?: string
          duration_seconds?: number | null
          filename?: string | null
          id?: string
          phone_last10?: string
          sentiment?: string | null
          summary?: string | null
          title?: string | null
          transcript?: string | null
          updated_at?: string
          voice_count?: number | null
        }
        Relationships: []
      }
      content_assets: {
        Row: {
          body: string | null
          category: string | null
          created_at: string
          customer_id: string | null
          folder: string | null
          id: string
          owner_id: string | null
          published_at: string | null
          scheduled_for: string | null
          share_token: string | null
          source: string
          status: string
          tags: string[]
          title: string
          type: string
          updated_at: string
          url: string | null
        }
        Insert: {
          body?: string | null
          category?: string | null
          created_at?: string
          customer_id?: string | null
          folder?: string | null
          id?: string
          owner_id?: string | null
          published_at?: string | null
          scheduled_for?: string | null
          share_token?: string | null
          source?: string
          status?: string
          tags?: string[]
          title: string
          type: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          body?: string | null
          category?: string | null
          created_at?: string
          customer_id?: string | null
          folder?: string | null
          id?: string
          owner_id?: string | null
          published_at?: string | null
          scheduled_for?: string | null
          share_token?: string | null
          source?: string
          status?: string
          tags?: string[]
          title?: string
          type?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_assets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_assets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_threads: {
        Row: {
          category: string | null
          channel: string
          created_at: string
          customer_id: string
          id: string
          raw_transcript: string | null
          status: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          channel?: string
          created_at?: string
          customer_id: string
          id?: string
          raw_transcript?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          channel?: string
          created_at?: string
          customer_id?: string
          id?: string
          raw_transcript?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_threads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      course_lessons: {
        Row: {
          created_at: string
          description: string | null
          duration_label: string | null
          id: string
          is_published: boolean
          position: number
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_url: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_label?: string | null
          id?: string
          is_published?: boolean
          position?: number
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_url: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_label?: string | null
          id?: string
          is_published?: boolean
          position?: number
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_url?: string
        }
        Relationships: []
      }
      crypto_wallets: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          token_address: string
          updated_at: string
          user_id: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          token_address?: string
          updated_at?: string
          user_id: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          token_address?: string
          updated_at?: string
          user_id?: string
          wallet_address?: string
        }
        Relationships: []
      }
      custom_categories: {
        Row: {
          category_name: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          category_name: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          category_name?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          assigned_to: string | null
          category: string | null
          company: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          instagram_handle: string | null
          meta: Json
          notes: string | null
          phone: string | null
          source: string | null
          status: string
          tags: string[]
          updated_at: string
          upload_token: string | null
        }
        Insert: {
          address?: string | null
          assigned_to?: string | null
          category?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          instagram_handle?: string | null
          meta?: Json
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          upload_token?: string | null
        }
        Update: {
          address?: string | null
          assigned_to?: string | null
          category?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          instagram_handle?: string | null
          meta?: Json
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          upload_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          category: string | null
          created_at: string
          customer_id: string
          deal_value: number
          expected_close_date: string | null
          id: string
          owner_id: string | null
          pipeline: string
          probability: number
          stage: string
          status: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          customer_id: string
          deal_value?: number
          expected_close_date?: string | null
          id?: string
          owner_id?: string | null
          pipeline?: string
          probability?: number
          stage?: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          customer_id?: string
          deal_value?: number
          expected_close_date?: string | null
          id?: string
          owner_id?: string | null
          pipeline?: string
          probability?: number
          stage?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_ai_narratives: {
        Row: {
          context_data: Json | null
          created_at: string
          id: string
          image_prompt: string | null
          image_url: string | null
          meta_categories: Json | null
          narrative: string
          source_platform: string | null
          source_url: string | null
          token_name: string
          token_symbol: string
        }
        Insert: {
          context_data?: Json | null
          created_at?: string
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          meta_categories?: Json | null
          narrative: string
          source_platform?: string | null
          source_url?: string | null
          token_name: string
          token_symbol: string
        }
        Update: {
          context_data?: Json | null
          created_at?: string
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          meta_categories?: Json | null
          narrative?: string
          source_platform?: string | null
          source_url?: string | null
          token_name?: string
          token_symbol?: string
        }
        Relationships: []
      }
      discord_notify_prefs: {
        Row: {
          created_at: string
          discord_user_id: string
          discord_username: string
          id: string
          notify_discord_dm: boolean
          notify_telegram: boolean
          telegram_username: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          discord_user_id: string
          discord_username?: string
          id?: string
          notify_discord_dm?: boolean
          notify_telegram?: boolean
          telegram_username?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          discord_user_id?: string
          discord_username?: string
          id?: string
          notify_discord_dm?: boolean
          notify_telegram?: boolean
          telegram_username?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          category: string | null
          created_at: string
          customer_id: string
          file_url: string | null
          id: string
          status: string
          storage_path: string | null
          thread_id: string | null
          title: string
          type: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          customer_id: string
          file_url?: string | null
          id?: string
          status?: string
          storage_path?: string | null
          thread_id?: string | null
          title: string
          type: string
        }
        Update: {
          category?: string | null
          created_at?: string
          customer_id?: string
          file_url?: string | null
          id?: string
          status?: string
          storage_path?: string | null
          thread_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      drop_campaigns: {
        Row: {
          audio_url: string
          callback_type: number
          campaign_id: number | null
          campaign_token: string | null
          created_at: string
          default_caller_id: string | null
          delivery_tracking_enabled: boolean
          enable_missed_call: boolean
          id: string
          is_default: boolean
          meta: Json
          name: string
          raw_response: Json | null
          transfer_number: string | null
          updated_at: string
          vm_drop_duration: number | null
          vm_drop_file: string | null
          webhook_url: string | null
        }
        Insert: {
          audio_url: string
          callback_type?: number
          campaign_id?: number | null
          campaign_token?: string | null
          created_at?: string
          default_caller_id?: string | null
          delivery_tracking_enabled?: boolean
          enable_missed_call?: boolean
          id?: string
          is_default?: boolean
          meta?: Json
          name: string
          raw_response?: Json | null
          transfer_number?: string | null
          updated_at?: string
          vm_drop_duration?: number | null
          vm_drop_file?: string | null
          webhook_url?: string | null
        }
        Update: {
          audio_url?: string
          callback_type?: number
          campaign_id?: number | null
          campaign_token?: string | null
          created_at?: string
          default_caller_id?: string | null
          delivery_tracking_enabled?: boolean
          enable_missed_call?: boolean
          id?: string
          is_default?: boolean
          meta?: Json
          name?: string
          raw_response?: Json | null
          transfer_number?: string | null
          updated_at?: string
          vm_drop_duration?: number | null
          vm_drop_file?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      drop_vm_logs: {
        Row: {
          activity_token: string | null
          api_status_code: number | null
          api_status_message: string | null
          campaign_token: string
          created_at: string
          customer_id: string | null
          id: string
          lead_id: string | null
          phone: string
          response: Json | null
          status: string
          vm_drop_status_url: string | null
        }
        Insert: {
          activity_token?: string | null
          api_status_code?: number | null
          api_status_message?: string | null
          campaign_token: string
          created_at?: string
          customer_id?: string | null
          id?: string
          lead_id?: string | null
          phone: string
          response?: Json | null
          status?: string
          vm_drop_status_url?: string | null
        }
        Update: {
          activity_token?: string | null
          api_status_code?: number | null
          api_status_message?: string | null
          campaign_token?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          lead_id?: string | null
          phone?: string
          response?: Json | null
          status?: string
          vm_drop_status_url?: string | null
        }
        Relationships: []
      }
      dropco_logs: {
        Row: {
          activity_token: string | null
          campaign_id: string | null
          campaign_token: string | null
          created_at: string
          customer_id: string | null
          id: string
          lead_id: string | null
          phone: string | null
          raw_payload: Json | null
          status: string
        }
        Insert: {
          activity_token?: string | null
          campaign_id?: string | null
          campaign_token?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          lead_id?: string | null
          phone?: string | null
          raw_payload?: Json | null
          status: string
        }
        Update: {
          activity_token?: string | null
          campaign_id?: string | null
          campaign_token?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          lead_id?: string | null
          phone?: string | null
          raw_payload?: Json | null
          status?: string
        }
        Relationships: []
      }
      generation_jobs: {
        Row: {
          backend_logs: string | null
          batch_id: string | null
          created_at: string
          error_message: string | null
          id: string
          input_audio_url: string | null
          input_image_url: string | null
          negative_prompt: string | null
          output_thumbnail_url: string | null
          output_video_url: string | null
          progress: number
          project_id: string | null
          prompt: string
          settings_json: Json
          status: string
          subproject_id: string | null
          task_type: string
          updated_at: string
          user_id: string
          worker_job_id: string | null
        }
        Insert: {
          backend_logs?: string | null
          batch_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_audio_url?: string | null
          input_image_url?: string | null
          negative_prompt?: string | null
          output_thumbnail_url?: string | null
          output_video_url?: string | null
          progress?: number
          project_id?: string | null
          prompt: string
          settings_json?: Json
          status?: string
          subproject_id?: string | null
          task_type?: string
          updated_at?: string
          user_id: string
          worker_job_id?: string | null
        }
        Update: {
          backend_logs?: string | null
          batch_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_audio_url?: string | null
          input_image_url?: string | null
          negative_prompt?: string | null
          output_thumbnail_url?: string | null
          output_video_url?: string | null
          progress?: number
          project_id?: string | null
          prompt?: string
          settings_json?: Json
          status?: string
          subproject_id?: string | null
          task_type?: string
          updated_at?: string
          user_id?: string
          worker_job_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_jobs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "studio_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "studio_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_jobs_subproject_id_fkey"
            columns: ["subproject_id"]
            isOneToOne: false
            referencedRelation: "studio_subprojects"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_presets: {
        Row: {
          created_at: string
          id: string
          name: string
          preset_json: Json
          task_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          preset_json?: Json
          task_type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          preset_json?: Json
          task_type?: string
          user_id?: string
        }
        Relationships: []
      }
      guru_subscriptions: {
        Row: {
          amount_cents: number
          cancelled_at: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          meta: Json
          plan: string
          square_customer_id: string | null
          square_order_id: string | null
          square_payment_link_id: string | null
          started_at: string | null
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          cancelled_at?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          meta?: Json
          plan?: string
          square_customer_id?: string | null
          square_order_id?: string | null
          square_payment_link_id?: string | null
          started_at?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          cancelled_at?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          meta?: Json
          plan?: string
          square_customer_id?: string | null
          square_order_id?: string | null
          square_payment_link_id?: string | null
          started_at?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      hook_reply_threads: {
        Row: {
          created_at: string
          dnd_reason: string | null
          followup_message_id: string | null
          followup_send_at: string | null
          followup_sent_at: string | null
          id: string
          inbound_at: string | null
          inbound_body: string | null
          inbound_message_id: string | null
          meta: Json
          original_outbound_body: string | null
          original_outbound_id: string | null
          phone: string
          phone_last10: string
          sentiment: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dnd_reason?: string | null
          followup_message_id?: string | null
          followup_send_at?: string | null
          followup_sent_at?: string | null
          id?: string
          inbound_at?: string | null
          inbound_body?: string | null
          inbound_message_id?: string | null
          meta?: Json
          original_outbound_body?: string | null
          original_outbound_id?: string | null
          phone: string
          phone_last10: string
          sentiment?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dnd_reason?: string | null
          followup_message_id?: string | null
          followup_send_at?: string | null
          followup_sent_at?: string | null
          id?: string
          inbound_at?: string | null
          inbound_body?: string | null
          inbound_message_id?: string | null
          meta?: Json
          original_outbound_body?: string | null
          original_outbound_id?: string | null
          phone?: string
          phone_last10?: string
          sentiment?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      hot_reply_imports: {
        Row: {
          ai_classification: string | null
          ai_confidence: number | null
          ai_reason: string | null
          assigned_to: string | null
          call_status: string
          campaign_name: string | null
          created_at: string
          dedupe_key: string | null
          first_name: string | null
          id: string
          imported_at: string
          is_hot: boolean
          is_lead: boolean
          is_opt_out: boolean
          last_name: string | null
          marked_lead_at: string | null
          notes: string | null
          original_date: string | null
          original_time: string | null
          phone: string
          reply_text: string
          sheet_row_id: string | null
          source: string | null
          triage_override: string | null
          updated_at: string
        }
        Insert: {
          ai_classification?: string | null
          ai_confidence?: number | null
          ai_reason?: string | null
          assigned_to?: string | null
          call_status?: string
          campaign_name?: string | null
          created_at?: string
          dedupe_key?: string | null
          first_name?: string | null
          id?: string
          imported_at?: string
          is_hot?: boolean
          is_lead?: boolean
          is_opt_out?: boolean
          last_name?: string | null
          marked_lead_at?: string | null
          notes?: string | null
          original_date?: string | null
          original_time?: string | null
          phone: string
          reply_text: string
          sheet_row_id?: string | null
          source?: string | null
          triage_override?: string | null
          updated_at?: string
        }
        Update: {
          ai_classification?: string | null
          ai_confidence?: number | null
          ai_reason?: string | null
          assigned_to?: string | null
          call_status?: string
          campaign_name?: string | null
          created_at?: string
          dedupe_key?: string | null
          first_name?: string | null
          id?: string
          imported_at?: string
          is_hot?: boolean
          is_lead?: boolean
          is_opt_out?: boolean
          last_name?: string | null
          marked_lead_at?: string | null
          notes?: string | null
          original_date?: string | null
          original_time?: string | null
          phone?: string
          reply_text?: string
          sheet_row_id?: string | null
          source?: string | null
          triage_override?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      hot_reply_notes: {
        Row: {
          created_at: string
          created_by: string | null
          hot_reply_id: string
          id: string
          note: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hot_reply_id: string
          id?: string
          note: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hot_reply_id?: string
          id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "hot_reply_notes_hot_reply_id_fkey"
            columns: ["hot_reply_id"]
            isOneToOne: false
            referencedRelation: "hot_reply_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      hot_reply_sync_settings: {
        Row: {
          created_at: string
          google_sheet_url: string | null
          id: string
          last_sync_at: string | null
          sheet_name: string | null
          sync_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          google_sheet_url?: string | null
          id?: string
          last_sync_at?: string | null
          sheet_name?: string | null
          sync_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          google_sheet_url?: string | null
          id?: string
          last_sync_at?: string | null
          sheet_name?: string | null
          sync_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      hourly_meta_summary: {
        Row: {
          bullish_score: number
          category: string
          created_at: string
          date_hour: string
          hours_today: number
          id: string
          is_green: boolean
          mentions_hour: number
        }
        Insert: {
          bullish_score?: number
          category: string
          created_at?: string
          date_hour: string
          hours_today?: number
          id?: string
          is_green?: boolean
          mentions_hour?: number
        }
        Update: {
          bullish_score?: number
          category?: string
          created_at?: string
          date_hour?: string
          hours_today?: number
          id?: string
          is_green?: boolean
          mentions_hour?: number
        }
        Relationships: []
      }
      interactions: {
        Row: {
          created_by: string | null
          customer_id: string
          direction: string
          id: string
          next_action: string | null
          notes: string | null
          occurred_at: string
          outcome: string | null
          subject: string | null
          type: string
        }
        Insert: {
          created_by?: string | null
          customer_id: string
          direction?: string
          id?: string
          next_action?: string | null
          notes?: string | null
          occurred_at?: string
          outcome?: string | null
          subject?: string | null
          type: string
        }
        Update: {
          created_by?: string | null
          customer_id?: string
          direction?: string
          id?: string
          next_action?: string | null
          notes?: string | null
          occurred_at?: string
          outcome?: string | null
          subject?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          currency: string
          customer_id: string
          deal_id: string | null
          due_date: string | null
          id: string
          invoice_number: string | null
          invoice_url: string | null
          line_items: Json
          notes: string | null
          paid_at: string | null
          payment_url: string | null
          provider: string
          sent_at: string | null
          square_invoice_id: string | null
          square_invoice_version: number | null
          status: string
          subtotal: number
          tax_rate: number
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          customer_id: string
          deal_id?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          invoice_url?: string | null
          line_items?: Json
          notes?: string | null
          paid_at?: string | null
          payment_url?: string | null
          provider?: string
          sent_at?: string | null
          square_invoice_id?: string | null
          square_invoice_version?: number | null
          status?: string
          subtotal?: number
          tax_rate?: number
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          customer_id?: string
          deal_id?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          invoice_url?: string | null
          line_items?: Json
          notes?: string | null
          paid_at?: string | null
          payment_url?: string | null
          provider?: string
          sent_at?: string | null
          square_invoice_id?: string | null
          square_invoice_version?: number | null
          status?: string
          subtotal?: number
          tax_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      labels: {
        Row: {
          board_id: string
          color: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          board_id: string
          color?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          board_id?: string
          color?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "labels_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_timeline_events: {
        Row: {
          created_at: string
          customer_id: string | null
          event_description: string | null
          event_title: string
          event_type: string
          id: string
          lead_id: string | null
          metadata: Json
          provider: string | null
          provider_record_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          event_description?: string | null
          event_title: string
          event_type: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          provider?: string | null
          provider_record_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          event_description?: string | null
          event_title?: string
          event_type?: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          provider?: string | null
          provider_record_id?: string | null
        }
        Relationships: []
      }
      leadsrain_campaigns: {
        Row: {
          audio_url: string | null
          caller_id: string | null
          campaign_name: string
          created_at: string
          id: string
          is_active: boolean
          meta: Json
          provider_campaign_id: string | null
          provider_list_id: string | null
          raw_response: Json | null
          transfer_number: string | null
          updated_at: string
        }
        Insert: {
          audio_url?: string | null
          caller_id?: string | null
          campaign_name: string
          created_at?: string
          id?: string
          is_active?: boolean
          meta?: Json
          provider_campaign_id?: string | null
          provider_list_id?: string | null
          raw_response?: Json | null
          transfer_number?: string | null
          updated_at?: string
        }
        Update: {
          audio_url?: string | null
          caller_id?: string | null
          campaign_name?: string
          created_at?: string
          id?: string
          is_active?: boolean
          meta?: Json
          provider_campaign_id?: string | null
          provider_list_id?: string | null
          raw_response?: Json | null
          transfer_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      leadsrain_drops: {
        Row: {
          caller_id: string | null
          campaign_id: string | null
          created_at: string
          customer_id: string | null
          error_message: string | null
          id: string
          lead_id: string | null
          phone_number: string
          provider_activity_id: string | null
          provider_campaign_id: string | null
          provider_lead_id: string | null
          provider_list_id: string | null
          raw_request: Json | null
          raw_response: Json | null
          status: string
          status_url: string | null
          updated_at: string
          voidfix_sms_error: string | null
          voidfix_sms_message_id: string | null
          voidfix_sms_sent_at: string | null
        }
        Insert: {
          caller_id?: string | null
          campaign_id?: string | null
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          id?: string
          lead_id?: string | null
          phone_number: string
          provider_activity_id?: string | null
          provider_campaign_id?: string | null
          provider_lead_id?: string | null
          provider_list_id?: string | null
          raw_request?: Json | null
          raw_response?: Json | null
          status?: string
          status_url?: string | null
          updated_at?: string
          voidfix_sms_error?: string | null
          voidfix_sms_message_id?: string | null
          voidfix_sms_sent_at?: string | null
        }
        Update: {
          caller_id?: string | null
          campaign_id?: string | null
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          id?: string
          lead_id?: string | null
          phone_number?: string
          provider_activity_id?: string | null
          provider_campaign_id?: string | null
          provider_lead_id?: string | null
          provider_list_id?: string | null
          raw_request?: Json | null
          raw_response?: Json | null
          status?: string
          status_url?: string | null
          updated_at?: string
          voidfix_sms_error?: string | null
          voidfix_sms_message_id?: string | null
          voidfix_sms_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leadsrain_drops_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "leadsrain_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      leadsrain_settings: {
        Row: {
          created_at: string
          default_audio_url: string | null
          default_caller_id: string | null
          default_campaign_external_id: string | null
          default_campaign_id: string | null
          default_list_id: string | null
          enable_transfer: boolean
          enable_voidfix_followup: boolean
          id: string
          is_active: boolean
          proxy_url: string | null
          singleton: boolean
          sms_delay_minutes: number
          transfer_number: string | null
          updated_at: string
          voidfix_template: string
          zapier_mode_enabled: boolean
          zapier_webhook_url: string | null
        }
        Insert: {
          created_at?: string
          default_audio_url?: string | null
          default_caller_id?: string | null
          default_campaign_external_id?: string | null
          default_campaign_id?: string | null
          default_list_id?: string | null
          enable_transfer?: boolean
          enable_voidfix_followup?: boolean
          id?: string
          is_active?: boolean
          proxy_url?: string | null
          singleton?: boolean
          sms_delay_minutes?: number
          transfer_number?: string | null
          updated_at?: string
          voidfix_template?: string
          zapier_mode_enabled?: boolean
          zapier_webhook_url?: string | null
        }
        Update: {
          created_at?: string
          default_audio_url?: string | null
          default_caller_id?: string | null
          default_campaign_external_id?: string | null
          default_campaign_id?: string | null
          default_list_id?: string | null
          enable_transfer?: boolean
          enable_voidfix_followup?: boolean
          id?: string
          is_active?: boolean
          proxy_url?: string | null
          singleton?: boolean
          sms_delay_minutes?: number
          transfer_number?: string | null
          updated_at?: string
          voidfix_template?: string
          zapier_mode_enabled?: boolean
          zapier_webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leadsrain_settings_default_campaign_id_fkey"
            columns: ["default_campaign_id"]
            isOneToOne: false
            referencedRelation: "leadsrain_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      leadsrain_submissions: {
        Row: {
          audio_url: string | null
          caller_id: string | null
          campaign_name: string | null
          contact_id: string | null
          created_at: string
          customer_id: string | null
          error_message: string | null
          id: string
          lead_id: string | null
          leadsrain_lead_id: string | null
          leadsrain_message: string | null
          phone_number: string
          raw_request: Json | null
          raw_response: Json | null
          status: string
          submitted_by: string | null
          updated_at: string
          voidfix_sms_at: string | null
          voidfix_sms_sent: boolean
        }
        Insert: {
          audio_url?: string | null
          caller_id?: string | null
          campaign_name?: string | null
          contact_id?: string | null
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          id?: string
          lead_id?: string | null
          leadsrain_lead_id?: string | null
          leadsrain_message?: string | null
          phone_number: string
          raw_request?: Json | null
          raw_response?: Json | null
          status?: string
          submitted_by?: string | null
          updated_at?: string
          voidfix_sms_at?: string | null
          voidfix_sms_sent?: boolean
        }
        Update: {
          audio_url?: string | null
          caller_id?: string | null
          campaign_name?: string | null
          contact_id?: string | null
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          id?: string
          lead_id?: string | null
          leadsrain_lead_id?: string | null
          leadsrain_message?: string | null
          phone_number?: string
          raw_request?: Json | null
          raw_response?: Json | null
          status?: string
          submitted_by?: string | null
          updated_at?: string
          voidfix_sms_at?: string | null
          voidfix_sms_sent?: boolean
        }
        Relationships: []
      }
      lh_dnc_registry: {
        Row: {
          call_count: number
          created_at: string
          id: string
          last_called_at: string | null
          phone: string
          reason: string
          source_list_id: string | null
        }
        Insert: {
          call_count?: number
          created_at?: string
          id?: string
          last_called_at?: string | null
          phone: string
          reason?: string
          source_list_id?: string | null
        }
        Update: {
          call_count?: number
          created_at?: string
          id?: string
          last_called_at?: string | null
          phone?: string
          reason?: string
          source_list_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lh_dnc_registry_source_list_id_fkey"
            columns: ["source_list_id"]
            isOneToOne: false
            referencedRelation: "lh_saved_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      lh_saved_list_items: {
        Row: {
          address: string | null
          category_name: string | null
          created_at: string
          gmaps_url: string | null
          id: string
          list_id: string
          meta: Json
          name: string | null
          negative_review: string | null
          phone: string
          rating: number | null
          review_count: number | null
          website: string | null
        }
        Insert: {
          address?: string | null
          category_name?: string | null
          created_at?: string
          gmaps_url?: string | null
          id?: string
          list_id: string
          meta?: Json
          name?: string | null
          negative_review?: string | null
          phone: string
          rating?: number | null
          review_count?: number | null
          website?: string | null
        }
        Update: {
          address?: string | null
          category_name?: string | null
          created_at?: string
          gmaps_url?: string | null
          id?: string
          list_id?: string
          meta?: Json
          name?: string | null
          negative_review?: string | null
          phone?: string
          rating?: number | null
          review_count?: number | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lh_saved_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lh_saved_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      lh_saved_lists: {
        Row: {
          created_at: string
          created_by: string
          id: string
          lead_count: number
          meta: Json
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          lead_count?: number
          meta?: Json
          name?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          lead_count?: number
          meta?: Json
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      listing_image_batches: {
        Row: {
          batch_name: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          batch_name?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          batch_name?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      listing_images: {
        Row: {
          ai_description: string | null
          batch_id: string
          confidence: number | null
          created_at: string
          detected_category: string | null
          file_url: string
          final_category: string | null
          id: string
          manual_category: string | null
          original_filename: string | null
          storage_path: string | null
          user_id: string
        }
        Insert: {
          ai_description?: string | null
          batch_id: string
          confidence?: number | null
          created_at?: string
          detected_category?: string | null
          file_url: string
          final_category?: string | null
          id?: string
          manual_category?: string | null
          original_filename?: string | null
          storage_path?: string | null
          user_id: string
        }
        Update: {
          ai_description?: string | null
          batch_id?: string
          confidence?: number | null
          created_at?: string
          detected_category?: string | null
          file_url?: string
          final_category?: string | null
          id?: string
          manual_category?: string | null
          original_filename?: string | null
          storage_path?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_images_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "listing_image_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      lists: {
        Row: {
          board_id: string
          created_at: string
          id: string
          name: string
          position: number
        }
        Insert: {
          board_id: string
          created_at?: string
          id?: string
          name: string
          position?: number
        }
        Update: {
          board_id?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "lists_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      lr_campaign_snapshots: {
        Row: {
          campaign_id: string
          delivered_count: number
          failed_count: number
          id: string
          processed_count: number
          remaining_count: number
          snapshot_at: string
          status: string | null
        }
        Insert: {
          campaign_id: string
          delivered_count?: number
          failed_count?: number
          id?: string
          processed_count?: number
          remaining_count?: number
          snapshot_at?: string
          status?: string | null
        }
        Update: {
          campaign_id?: string
          delivered_count?: number
          failed_count?: number
          id?: string
          processed_count?: number
          remaining_count?: number
          snapshot_at?: string
          status?: string | null
        }
        Relationships: []
      }
      lr_campaigns: {
        Row: {
          caller_id: string | null
          campaign_id: string
          campaign_name: string | null
          completion_percentage: number
          created_at: string
          delivered_leads: number
          estimated_completion_at: string | null
          failed_leads: number
          id: string
          last_synced_at: string | null
          list_id: string | null
          processed_leads: number
          raw: Json
          remaining_leads: number
          started_at: string | null
          status: string | null
          total_leads: number
          updated_at: string
        }
        Insert: {
          caller_id?: string | null
          campaign_id: string
          campaign_name?: string | null
          completion_percentage?: number
          created_at?: string
          delivered_leads?: number
          estimated_completion_at?: string | null
          failed_leads?: number
          id?: string
          last_synced_at?: string | null
          list_id?: string | null
          processed_leads?: number
          raw?: Json
          remaining_leads?: number
          started_at?: string | null
          status?: string | null
          total_leads?: number
          updated_at?: string
        }
        Update: {
          caller_id?: string | null
          campaign_id?: string
          campaign_name?: string | null
          completion_percentage?: number
          created_at?: string
          delivered_leads?: number
          estimated_completion_at?: string | null
          failed_leads?: number
          id?: string
          last_synced_at?: string | null
          list_id?: string | null
          processed_leads?: number
          raw?: Json
          remaining_leads?: number
          started_at?: string | null
          status?: string | null
          total_leads?: number
          updated_at?: string
        }
        Relationships: []
      }
      lr_sync_config: {
        Row: {
          enabled: boolean
          id: number
          interval_minutes: number
          last_run_at: string | null
          next_run_at: string | null
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          id?: number
          interval_minutes?: number
          last_run_at?: string | null
          next_run_at?: string | null
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          id?: number
          interval_minutes?: number
          last_run_at?: string | null
          next_run_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lr_sync_logs: {
        Row: {
          campaigns_changed: number
          campaigns_seen: number
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          http_status: number | null
          id: string
          meta: Json
          started_at: string
          status: string
        }
        Insert: {
          campaigns_changed?: number
          campaigns_seen?: number
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          http_status?: number | null
          id?: string
          meta?: Json
          started_at?: string
          status?: string
        }
        Update: {
          campaigns_changed?: number
          campaigns_seen?: number
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          http_status?: number | null
          id?: string
          meta?: Json
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      lw_buyer_config: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      lw_buyer_discovery_sources: {
        Row: {
          apify_actor_id: string | null
          created_at: string | null
          id: string
          is_enabled: boolean | null
          last_run_at: string | null
          meta: Json | null
          name: string
          platform: string
          run_count: number | null
          schedule_cron: string | null
          search_keywords: string[] | null
          search_urls: string[] | null
          updated_at: string | null
        }
        Insert: {
          apify_actor_id?: string | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          last_run_at?: string | null
          meta?: Json | null
          name: string
          platform: string
          run_count?: number | null
          schedule_cron?: string | null
          search_keywords?: string[] | null
          search_urls?: string[] | null
          updated_at?: string | null
        }
        Update: {
          apify_actor_id?: string | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          last_run_at?: string | null
          meta?: Json | null
          name?: string
          platform?: string
          run_count?: number | null
          schedule_cron?: string | null
          search_keywords?: string[] | null
          search_urls?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      lw_buyer_ingestion_logs: {
        Row: {
          apify_run_id: string | null
          created_at: string | null
          error: string | null
          high_score_count: number | null
          id: string
          meta: Json | null
          platform: string
          records_new: number | null
          records_received: number | null
          records_skipped: number | null
          records_updated: number | null
          source_id: string | null
          status: string | null
        }
        Insert: {
          apify_run_id?: string | null
          created_at?: string | null
          error?: string | null
          high_score_count?: number | null
          id?: string
          meta?: Json | null
          platform: string
          records_new?: number | null
          records_received?: number | null
          records_skipped?: number | null
          records_updated?: number | null
          source_id?: string | null
          status?: string | null
        }
        Update: {
          apify_run_id?: string | null
          created_at?: string | null
          error?: string | null
          high_score_count?: number | null
          id?: string
          meta?: Json | null
          platform?: string
          records_new?: number | null
          records_received?: number | null
          records_skipped?: number | null
          records_updated?: number | null
          source_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lw_buyer_ingestion_logs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "lw_buyer_discovery_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      lw_buyers: {
        Row: {
          acreage_max: number | null
          acreage_min: number | null
          activity_score: number
          budget_max: number | null
          budget_min: number | null
          buyer_score: number | null
          buyer_type: string | null
          city: string | null
          confidence_score: number | null
          created_at: string
          deal_type: string
          email: string | null
          entity_name: string | null
          full_name: string
          id: string
          intent_level: string | null
          intent_summary: string | null
          last_purchase_date: string | null
          last_seen_signal: string | null
          meta: Json
          notes: string | null
          phone: string | null
          pipeline_stage: string | null
          property_type_interest: string[] | null
          purchase_count: number | null
          raw_source_data: Json | null
          reapi_owner_id: string | null
          source: string
          source_platform: string | null
          source_url: string | null
          status: string
          tags: string[] | null
          target_counties: string[]
          target_states: string[]
          target_zoning: string[] | null
          updated_at: string
        }
        Insert: {
          acreage_max?: number | null
          acreage_min?: number | null
          activity_score?: number
          budget_max?: number | null
          budget_min?: number | null
          buyer_score?: number | null
          buyer_type?: string | null
          city?: string | null
          confidence_score?: number | null
          created_at?: string
          deal_type?: string
          email?: string | null
          entity_name?: string | null
          full_name: string
          id?: string
          intent_level?: string | null
          intent_summary?: string | null
          last_purchase_date?: string | null
          last_seen_signal?: string | null
          meta?: Json
          notes?: string | null
          phone?: string | null
          pipeline_stage?: string | null
          property_type_interest?: string[] | null
          purchase_count?: number | null
          raw_source_data?: Json | null
          reapi_owner_id?: string | null
          source?: string
          source_platform?: string | null
          source_url?: string | null
          status?: string
          tags?: string[] | null
          target_counties?: string[]
          target_states?: string[]
          target_zoning?: string[] | null
          updated_at?: string
        }
        Update: {
          acreage_max?: number | null
          acreage_min?: number | null
          activity_score?: number
          budget_max?: number | null
          budget_min?: number | null
          buyer_score?: number | null
          buyer_type?: string | null
          city?: string | null
          confidence_score?: number | null
          created_at?: string
          deal_type?: string
          email?: string | null
          entity_name?: string | null
          full_name?: string
          id?: string
          intent_level?: string | null
          intent_summary?: string | null
          last_purchase_date?: string | null
          last_seen_signal?: string | null
          meta?: Json
          notes?: string | null
          phone?: string | null
          pipeline_stage?: string | null
          property_type_interest?: string[] | null
          purchase_count?: number | null
          raw_source_data?: Json | null
          reapi_owner_id?: string | null
          source?: string
          source_platform?: string | null
          source_url?: string | null
          status?: string
          tags?: string[] | null
          target_counties?: string[]
          target_states?: string[]
          target_zoning?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      lw_call_queue: {
        Row: {
          call_priority: number
          called_at: string | null
          created_at: string
          deal_id: string | null
          id: string
          match_score: number | null
          motivation_score: number | null
          notes: string | null
          outcome: string | null
          owner_name: string | null
          owner_phone: string | null
          property_address: string | null
          queue_date: string
          reason: string
          seller_id: string
          status: string
        }
        Insert: {
          call_priority?: number
          called_at?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          match_score?: number | null
          motivation_score?: number | null
          notes?: string | null
          outcome?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          property_address?: string | null
          queue_date?: string
          reason: string
          seller_id: string
          status?: string
        }
        Update: {
          call_priority?: number
          called_at?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          match_score?: number | null
          motivation_score?: number | null
          notes?: string | null
          outcome?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          property_address?: string | null
          queue_date?: string
          reason?: string
          seller_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lw_call_queue_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "lw_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lw_call_queue_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "lw_sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      lw_client_lead_caps: {
        Row: {
          cap: number
          created_at: string
          id: string
          landing_page_id: string
          leads_delivered: number
          week_start: string
        }
        Insert: {
          cap?: number
          created_at?: string
          id?: string
          landing_page_id: string
          leads_delivered?: number
          week_start: string
        }
        Update: {
          cap?: number
          created_at?: string
          id?: string
          landing_page_id?: string
          leads_delivered?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "lw_client_lead_caps_landing_page_id_fkey"
            columns: ["landing_page_id"]
            isOneToOne: false
            referencedRelation: "lw_landing_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lw_client_lead_caps_landing_page_id_fkey"
            columns: ["landing_page_id"]
            isOneToOne: false
            referencedRelation: "lw_landing_pages_public"
            referencedColumns: ["id"]
          },
        ]
      }
      lw_deals: {
        Row: {
          assigned_to: string | null
          buyer_id: string | null
          buyer_price: number | null
          created_at: string
          deal_type: string
          id: string
          match_score: number
          meta: Json
          notes: string | null
          our_offer: number | null
          priority: string
          seller_ask: number | null
          seller_id: string
          spread: number | null
          stage: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          buyer_id?: string | null
          buyer_price?: number | null
          created_at?: string
          deal_type?: string
          id?: string
          match_score?: number
          meta?: Json
          notes?: string | null
          our_offer?: number | null
          priority?: string
          seller_ask?: number | null
          seller_id: string
          spread?: number | null
          stage?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          buyer_id?: string | null
          buyer_price?: number | null
          created_at?: string
          deal_type?: string
          id?: string
          match_score?: number
          meta?: Json
          notes?: string | null
          our_offer?: number | null
          priority?: string
          seller_ask?: number | null
          seller_id?: string
          spread?: number | null
          stage?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lw_deals_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "lw_buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lw_deals_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "lw_sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      lw_demand_signals: {
        Row: {
          avg_acreage_max: number | null
          avg_acreage_min: number | null
          avg_budget: number | null
          buyer_count: number
          county: string
          created_at: string
          deal_type: string
          demand_rank: number | null
          id: string
          last_refreshed_at: string
          state: string
          zoning_demand: Json | null
        }
        Insert: {
          avg_acreage_max?: number | null
          avg_acreage_min?: number | null
          avg_budget?: number | null
          buyer_count?: number
          county: string
          created_at?: string
          deal_type?: string
          demand_rank?: number | null
          id?: string
          last_refreshed_at?: string
          state: string
          zoning_demand?: Json | null
        }
        Update: {
          avg_acreage_max?: number | null
          avg_acreage_min?: number | null
          avg_budget?: number | null
          buyer_count?: number
          county?: string
          created_at?: string
          deal_type?: string
          demand_rank?: number | null
          id?: string
          last_refreshed_at?: string
          state?: string
          zoning_demand?: Json | null
        }
        Relationships: []
      }
      lw_ingestion_runs: {
        Row: {
          created_at: string
          credits_used: number | null
          error: string | null
          id: string
          params: Json | null
          records_fetched: number | null
          records_new: number | null
          run_type: string
          source: string
          status: string
        }
        Insert: {
          created_at?: string
          credits_used?: number | null
          error?: string | null
          id?: string
          params?: Json | null
          records_fetched?: number | null
          records_new?: number | null
          run_type: string
          source?: string
          status?: string
        }
        Update: {
          created_at?: string
          credits_used?: number | null
          error?: string | null
          id?: string
          params?: Json | null
          records_fetched?: number | null
          records_new?: number | null
          run_type?: string
          source?: string
          status?: string
        }
        Relationships: []
      }
      lw_landing_leads: {
        Row: {
          ai_notes: string | null
          asking_price: number | null
          created_at: string
          drafted_at: string | null
          email: string | null
          full_name: string
          id: string
          landing_page_id: string | null
          lead_score: number | null
          meta: Json
          motivation: string | null
          notes: string | null
          phone: string
          property_address: string
          property_condition: string | null
          status: string
          timeline: string | null
          vapi_call_id: string | null
          vapi_call_status: string | null
          vapi_recording_url: string | null
        }
        Insert: {
          ai_notes?: string | null
          asking_price?: number | null
          created_at?: string
          drafted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          landing_page_id?: string | null
          lead_score?: number | null
          meta?: Json
          motivation?: string | null
          notes?: string | null
          phone: string
          property_address: string
          property_condition?: string | null
          status?: string
          timeline?: string | null
          vapi_call_id?: string | null
          vapi_call_status?: string | null
          vapi_recording_url?: string | null
        }
        Update: {
          ai_notes?: string | null
          asking_price?: number | null
          created_at?: string
          drafted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          landing_page_id?: string | null
          lead_score?: number | null
          meta?: Json
          motivation?: string | null
          notes?: string | null
          phone?: string
          property_address?: string
          property_condition?: string | null
          status?: string
          timeline?: string | null
          vapi_call_id?: string | null
          vapi_call_status?: string | null
          vapi_recording_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lw_landing_leads_landing_page_id_fkey"
            columns: ["landing_page_id"]
            isOneToOne: false
            referencedRelation: "lw_landing_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lw_landing_leads_landing_page_id_fkey"
            columns: ["landing_page_id"]
            isOneToOne: false
            referencedRelation: "lw_landing_pages_public"
            referencedColumns: ["id"]
          },
        ]
      }
      lw_landing_pages: {
        Row: {
          accent_color: string
          client_name: string
          client_password: string | null
          client_user_id: string | null
          created_at: string
          email: string | null
          headline: string
          id: string
          is_active: boolean
          logo_url: string | null
          meta: Json
          phone: string | null
          photo_url: string | null
          reviews: Json
          slug: string
          sub_headline: string | null
          tagline: string
          updated_at: string
          vapi_credit_balance_cents: number
          vapi_total_spent_cents: number
        }
        Insert: {
          accent_color?: string
          client_name: string
          client_password?: string | null
          client_user_id?: string | null
          created_at?: string
          email?: string | null
          headline?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          meta?: Json
          phone?: string | null
          photo_url?: string | null
          reviews?: Json
          slug: string
          sub_headline?: string | null
          tagline?: string
          updated_at?: string
          vapi_credit_balance_cents?: number
          vapi_total_spent_cents?: number
        }
        Update: {
          accent_color?: string
          client_name?: string
          client_password?: string | null
          client_user_id?: string | null
          created_at?: string
          email?: string | null
          headline?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          meta?: Json
          phone?: string | null
          photo_url?: string | null
          reviews?: Json
          slug?: string
          sub_headline?: string | null
          tagline?: string
          updated_at?: string
          vapi_credit_balance_cents?: number
          vapi_total_spent_cents?: number
        }
        Relationships: []
      }
      lw_sellers: {
        Row: {
          acreage: number | null
          address_full: string | null
          apn: string | null
          asking_price: number | null
          assessed_value: number | null
          auction_status: string | null
          bathrooms: number | null
          bedrooms: number | null
          best_contact_confidence: number | null
          buyer_match_score: number | null
          city: string | null
          condition_notes: string | null
          contact_quality_grade: string | null
          contacted_at: string | null
          county: string | null
          created_at: string
          deal_type: string
          distress_grade: string | null
          emails_found_count: number | null
          equity_percent: number | null
          estimated_offer: number | null
          fips: string | null
          foreclosure_status: string | null
          free_and_clear: boolean | null
          has_tax_lien: boolean | null
          id: string
          import_batch_id: string | null
          inherited_flag: boolean | null
          is_absentee_owner: boolean | null
          is_corporate_owned: boolean | null
          is_out_of_state: boolean | null
          is_pre_foreclosure: boolean | null
          is_tax_delinquent: boolean | null
          is_vacant: boolean | null
          latitude: number | null
          lead_temperature: string | null
          lien_count: number | null
          living_sqft: number | null
          longitude: number | null
          lot_sqft: number | null
          market_value: number | null
          meta: Json
          motivation_score: number
          notes: string | null
          opportunity_score: number | null
          owner_email: string | null
          owner_mailing_address: string | null
          owner_name: string | null
          owner_occupied: boolean | null
          owner_phone: string | null
          phones_found_count: number | null
          probate_flag: boolean | null
          property_type: string | null
          reapi_property_id: string | null
          skip_trace_completed_at: string | null
          skip_trace_status: string | null
          skip_trace_submitted_at: string | null
          skip_trace_vendor: string | null
          skip_traced_at: string | null
          source: string
          source_record_id: string | null
          state: string | null
          status: string
          tags: string[] | null
          tax_delinquent_year: string | null
          trust_owned: boolean | null
          updated_at: string
          years_owned: number | null
          zip: string | null
          zoning: string | null
        }
        Insert: {
          acreage?: number | null
          address_full?: string | null
          apn?: string | null
          asking_price?: number | null
          assessed_value?: number | null
          auction_status?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          best_contact_confidence?: number | null
          buyer_match_score?: number | null
          city?: string | null
          condition_notes?: string | null
          contact_quality_grade?: string | null
          contacted_at?: string | null
          county?: string | null
          created_at?: string
          deal_type?: string
          distress_grade?: string | null
          emails_found_count?: number | null
          equity_percent?: number | null
          estimated_offer?: number | null
          fips?: string | null
          foreclosure_status?: string | null
          free_and_clear?: boolean | null
          has_tax_lien?: boolean | null
          id?: string
          import_batch_id?: string | null
          inherited_flag?: boolean | null
          is_absentee_owner?: boolean | null
          is_corporate_owned?: boolean | null
          is_out_of_state?: boolean | null
          is_pre_foreclosure?: boolean | null
          is_tax_delinquent?: boolean | null
          is_vacant?: boolean | null
          latitude?: number | null
          lead_temperature?: string | null
          lien_count?: number | null
          living_sqft?: number | null
          longitude?: number | null
          lot_sqft?: number | null
          market_value?: number | null
          meta?: Json
          motivation_score?: number
          notes?: string | null
          opportunity_score?: number | null
          owner_email?: string | null
          owner_mailing_address?: string | null
          owner_name?: string | null
          owner_occupied?: boolean | null
          owner_phone?: string | null
          phones_found_count?: number | null
          probate_flag?: boolean | null
          property_type?: string | null
          reapi_property_id?: string | null
          skip_trace_completed_at?: string | null
          skip_trace_status?: string | null
          skip_trace_submitted_at?: string | null
          skip_trace_vendor?: string | null
          skip_traced_at?: string | null
          source?: string
          source_record_id?: string | null
          state?: string | null
          status?: string
          tags?: string[] | null
          tax_delinquent_year?: string | null
          trust_owned?: boolean | null
          updated_at?: string
          years_owned?: number | null
          zip?: string | null
          zoning?: string | null
        }
        Update: {
          acreage?: number | null
          address_full?: string | null
          apn?: string | null
          asking_price?: number | null
          assessed_value?: number | null
          auction_status?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          best_contact_confidence?: number | null
          buyer_match_score?: number | null
          city?: string | null
          condition_notes?: string | null
          contact_quality_grade?: string | null
          contacted_at?: string | null
          county?: string | null
          created_at?: string
          deal_type?: string
          distress_grade?: string | null
          emails_found_count?: number | null
          equity_percent?: number | null
          estimated_offer?: number | null
          fips?: string | null
          foreclosure_status?: string | null
          free_and_clear?: boolean | null
          has_tax_lien?: boolean | null
          id?: string
          import_batch_id?: string | null
          inherited_flag?: boolean | null
          is_absentee_owner?: boolean | null
          is_corporate_owned?: boolean | null
          is_out_of_state?: boolean | null
          is_pre_foreclosure?: boolean | null
          is_tax_delinquent?: boolean | null
          is_vacant?: boolean | null
          latitude?: number | null
          lead_temperature?: string | null
          lien_count?: number | null
          living_sqft?: number | null
          longitude?: number | null
          lot_sqft?: number | null
          market_value?: number | null
          meta?: Json
          motivation_score?: number
          notes?: string | null
          opportunity_score?: number | null
          owner_email?: string | null
          owner_mailing_address?: string | null
          owner_name?: string | null
          owner_occupied?: boolean | null
          owner_phone?: string | null
          phones_found_count?: number | null
          probate_flag?: boolean | null
          property_type?: string | null
          reapi_property_id?: string | null
          skip_trace_completed_at?: string | null
          skip_trace_status?: string | null
          skip_trace_submitted_at?: string | null
          skip_trace_vendor?: string | null
          skip_traced_at?: string | null
          source?: string
          source_record_id?: string | null
          state?: string | null
          status?: string
          tags?: string[] | null
          tax_delinquent_year?: string | null
          trust_owned?: boolean | null
          updated_at?: string
          years_owned?: number | null
          zip?: string | null
          zoning?: string | null
        }
        Relationships: []
      }
      market_cap_alerts: {
        Row: {
          audit_data: Json
          audit_status: string
          ca_address: string
          created_at: string
          id: string
          is_j7tracker: boolean
          is_kol: boolean
          is_top_gainer: boolean
          media_url: string | null
          milestone: string
          milestone_value: number
          raw_message: string | null
          source_url: string | null
          telegram_channel_id: number | null
          token_name: string | null
          token_symbol: string | null
          verdict: string | null
        }
        Insert: {
          audit_data?: Json
          audit_status?: string
          ca_address: string
          created_at?: string
          id?: string
          is_j7tracker?: boolean
          is_kol?: boolean
          is_top_gainer?: boolean
          media_url?: string | null
          milestone?: string
          milestone_value?: number
          raw_message?: string | null
          source_url?: string | null
          telegram_channel_id?: number | null
          token_name?: string | null
          token_symbol?: string | null
          verdict?: string | null
        }
        Update: {
          audit_data?: Json
          audit_status?: string
          ca_address?: string
          created_at?: string
          id?: string
          is_j7tracker?: boolean
          is_kol?: boolean
          is_top_gainer?: boolean
          media_url?: string | null
          milestone?: string
          milestone_value?: number
          raw_message?: string | null
          source_url?: string | null
          telegram_channel_id?: number | null
          token_name?: string | null
          token_symbol?: string | null
          verdict?: string | null
        }
        Relationships: []
      }
      meetings: {
        Row: {
          category: string | null
          created_at: string
          customer_id: string | null
          host_id: string | null
          id: string
          room_code: string
          scheduled_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          customer_id?: string | null
          host_id?: string | null
          id?: string
          room_code?: string
          scheduled_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          customer_id?: string | null
          host_id?: string | null
          id?: string
          room_code?: string
          scheduled_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_videos: {
        Row: {
          campaign: string
          created_at: string
          description: string | null
          duration_seconds: number | null
          file_size: number | null
          file_url: string
          id: string
          owner_id: string | null
          storage_path: string
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          campaign?: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          file_size?: number | null
          file_url: string
          id?: string
          owner_id?: string | null
          storage_path: string
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          campaign?: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          file_size?: number | null
          file_url?: string
          id?: string
          owner_id?: string | null
          storage_path?: string
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      meta_mentions: {
        Row: {
          category_normalized: string
          count: number
          created_at: string
          id: string
          message_id: string | null
          source_text_snippet: string | null
          telegram_channel_id: number | null
        }
        Insert: {
          category_normalized: string
          count?: number
          created_at?: string
          id?: string
          message_id?: string | null
          source_text_snippet?: string | null
          telegram_channel_id?: number | null
        }
        Update: {
          category_normalized?: string
          count?: number
          created_at?: string
          id?: string
          message_id?: string | null
          source_text_snippet?: string | null
          telegram_channel_id?: number | null
        }
        Relationships: []
      }
      missed_call_events: {
        Row: {
          auto_reply_communication_id: string | null
          auto_reply_message: string | null
          auto_reply_sent: boolean
          call_log_id: string | null
          callback_status: string
          campaign_source: string | null
          created_at: string
          customer_id: string | null
          error_message: string | null
          id: string
          meta: Json
          phone_last10: string
          phone_number: string
          status: string
          updated_at: string
          voicemail_duration: number | null
          voicemail_received_at: string | null
          voicemail_recording_sid: string | null
          voicemail_recording_url: string | null
          voicemail_transcription: string | null
          voidfix_message_id: string | null
        }
        Insert: {
          auto_reply_communication_id?: string | null
          auto_reply_message?: string | null
          auto_reply_sent?: boolean
          call_log_id?: string | null
          callback_status?: string
          campaign_source?: string | null
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          id?: string
          meta?: Json
          phone_last10: string
          phone_number: string
          status?: string
          updated_at?: string
          voicemail_duration?: number | null
          voicemail_received_at?: string | null
          voicemail_recording_sid?: string | null
          voicemail_recording_url?: string | null
          voicemail_transcription?: string | null
          voidfix_message_id?: string | null
        }
        Update: {
          auto_reply_communication_id?: string | null
          auto_reply_message?: string | null
          auto_reply_sent?: boolean
          call_log_id?: string | null
          callback_status?: string
          campaign_source?: string | null
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          id?: string
          meta?: Json
          phone_last10?: string
          phone_number?: string
          status?: string
          updated_at?: string
          voicemail_duration?: number | null
          voicemail_received_at?: string | null
          voicemail_recording_sid?: string | null
          voicemail_recording_url?: string | null
          voicemail_transcription?: string | null
          voidfix_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "missed_call_events_auto_reply_communication_id_fkey"
            columns: ["auto_reply_communication_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missed_call_events_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "powerdial_call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missed_call_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      missed_call_webhook_audit: {
        Row: {
          call_log_created: boolean
          call_log_id: string | null
          call_sid: string | null
          created_at: string
          dial_call_sid: string | null
          dial_status: string | null
          error_message: string | null
          event_stage: string
          forwarded_phone_number: string | null
          id: string
          is_missed: boolean | null
          missed_call_event_id: string | null
          missed_call_row_created: boolean
          phone_number: string | null
          raw_payload: Json
          to_number: string | null
          twilio_phone_sid: string | null
          webhook_name: string
        }
        Insert: {
          call_log_created?: boolean
          call_log_id?: string | null
          call_sid?: string | null
          created_at?: string
          dial_call_sid?: string | null
          dial_status?: string | null
          error_message?: string | null
          event_stage: string
          forwarded_phone_number?: string | null
          id?: string
          is_missed?: boolean | null
          missed_call_event_id?: string | null
          missed_call_row_created?: boolean
          phone_number?: string | null
          raw_payload?: Json
          to_number?: string | null
          twilio_phone_sid?: string | null
          webhook_name: string
        }
        Update: {
          call_log_created?: boolean
          call_log_id?: string | null
          call_sid?: string | null
          created_at?: string
          dial_call_sid?: string | null
          dial_status?: string | null
          error_message?: string | null
          event_stage?: string
          forwarded_phone_number?: string | null
          id?: string
          is_missed?: boolean | null
          missed_call_event_id?: string | null
          missed_call_row_created?: boolean
          phone_number?: string | null
          raw_payload?: Json
          to_number?: string | null
          twilio_phone_sid?: string | null
          webhook_name?: string
        }
        Relationships: []
      }
      narrative_evolution: {
        Row: {
          categories: string[]
          category_blend_key: string | null
          coin_name: string
          coin_name_pattern: string | null
          created_at: string
          generation_batch: string | null
          id: string
          is_top_performer: boolean
          liquidity_ignition_score: number
          lore_origin: string | null
          pump_probability: number | null
          score_community_nickname: number | null
          score_degen_humor: number | null
          score_exit_flexibility: number | null
          score_pump_velocity: number | null
          score_repeatability: number | null
          score_screenshot: number | null
          score_shock: number | null
          score_simplicity: number | null
          score_tribal: number | null
          tagline: string | null
          ticker: string
        }
        Insert: {
          categories?: string[]
          category_blend_key?: string | null
          coin_name: string
          coin_name_pattern?: string | null
          created_at?: string
          generation_batch?: string | null
          id?: string
          is_top_performer?: boolean
          liquidity_ignition_score?: number
          lore_origin?: string | null
          pump_probability?: number | null
          score_community_nickname?: number | null
          score_degen_humor?: number | null
          score_exit_flexibility?: number | null
          score_pump_velocity?: number | null
          score_repeatability?: number | null
          score_screenshot?: number | null
          score_shock?: number | null
          score_simplicity?: number | null
          score_tribal?: number | null
          tagline?: string | null
          ticker: string
        }
        Update: {
          categories?: string[]
          category_blend_key?: string | null
          coin_name?: string
          coin_name_pattern?: string | null
          created_at?: string
          generation_batch?: string | null
          id?: string
          is_top_performer?: boolean
          liquidity_ignition_score?: number
          lore_origin?: string | null
          pump_probability?: number | null
          score_community_nickname?: number | null
          score_degen_humor?: number | null
          score_exit_flexibility?: number | null
          score_pump_velocity?: number | null
          score_repeatability?: number | null
          score_screenshot?: number | null
          score_shock?: number | null
          score_simplicity?: number | null
          score_tribal?: number | null
          tagline?: string | null
          ticker?: string
        }
        Relationships: []
      }
      outbound_accounts: {
        Row: {
          account_identifier: string
          account_label: string
          auto_send_enabled: boolean
          created_at: string
          daily_limit: number
          id: string
          is_authorized: boolean
          platform: string
          provider: string
        }
        Insert: {
          account_identifier: string
          account_label: string
          auto_send_enabled?: boolean
          created_at?: string
          daily_limit?: number
          id?: string
          is_authorized?: boolean
          platform?: string
          provider?: string
        }
        Update: {
          account_identifier?: string
          account_label?: string
          auto_send_enabled?: boolean
          created_at?: string
          daily_limit?: number
          id?: string
          is_authorized?: boolean
          platform?: string
          provider?: string
        }
        Relationships: []
      }
      outbound_attempts: {
        Row: {
          attempted_at: string
          error_message: string | null
          id: string
          outbound_account_id: string
          provider_message_id: string | null
          reply_review_id: string
          request_payload: Json | null
          response_payload: Json | null
          status: string
        }
        Insert: {
          attempted_at?: string
          error_message?: string | null
          id?: string
          outbound_account_id: string
          provider_message_id?: string | null
          reply_review_id: string
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string
        }
        Update: {
          attempted_at?: string
          error_message?: string | null
          id?: string
          outbound_account_id?: string
          provider_message_id?: string | null
          reply_review_id?: string
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_attempts_outbound_account_id_fkey"
            columns: ["outbound_account_id"]
            isOneToOne: false
            referencedRelation: "outbound_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_attempts_reply_review_id_fkey"
            columns: ["reply_review_id"]
            isOneToOne: false
            referencedRelation: "reply_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_call_queue: {
        Row: {
          campaign_status: string | null
          created_at: string | null
          id: string
          last_attempt_at: string | null
          notes: string | null
          phone_e164: string | null
          source: string | null
        }
        Insert: {
          campaign_status?: string | null
          created_at?: string | null
          id?: string
          last_attempt_at?: string | null
          notes?: string | null
          phone_e164?: string | null
          source?: string | null
        }
        Update: {
          campaign_status?: string | null
          created_at?: string | null
          id?: string
          last_attempt_at?: string | null
          notes?: string | null
          phone_e164?: string | null
          source?: string | null
        }
        Relationships: []
      }
      payme_charges: {
        Row: {
          amount: number
          auth_code: string | null
          created_at: string
          id: string
          last4: string | null
          note: string | null
          payer_email: string | null
          payer_name: string | null
          transaction_id: string
        }
        Insert: {
          amount: number
          auth_code?: string | null
          created_at?: string
          id?: string
          last4?: string | null
          note?: string | null
          payer_email?: string | null
          payer_name?: string | null
          transaction_id: string
        }
        Update: {
          amount?: number
          auth_code?: string | null
          created_at?: string
          id?: string
          last4?: string | null
          note?: string | null
          payer_email?: string | null
          payer_name?: string | null
          transaction_id?: string
        }
        Relationships: []
      }
      payout_requests: {
        Row: {
          admin_notes: string | null
          amount_owed: number
          created_at: string
          discord_user_id: string
          discord_username: string
          id: string
          processed_at: string | null
          processed_by: string | null
          solana_wallet: string
          status: string
          user_type: string
          verified_clicks: number
        }
        Insert: {
          admin_notes?: string | null
          amount_owed?: number
          created_at?: string
          discord_user_id: string
          discord_username: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          solana_wallet: string
          status?: string
          user_type?: string
          verified_clicks?: number
        }
        Update: {
          admin_notes?: string | null
          amount_owed?: number
          created_at?: string
          discord_user_id?: string
          discord_username?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          solana_wallet?: string
          status?: string
          user_type?: string
          verified_clicks?: number
        }
        Relationships: []
      }
      phone_audit_jobs: {
        Row: {
          cache_hits: number
          completed_at: string | null
          created_at: string
          current_phone: string | null
          error_message: string | null
          failed: number
          id: string
          invalid: number
          landline: number
          mobile: number
          new_lookups: number
          paused_at: string | null
          processed: number
          started_at: string | null
          status: string
          total: number
          unknown: number
          updated_at: string
          voip: number
        }
        Insert: {
          cache_hits?: number
          completed_at?: string | null
          created_at?: string
          current_phone?: string | null
          error_message?: string | null
          failed?: number
          id?: string
          invalid?: number
          landline?: number
          mobile?: number
          new_lookups?: number
          paused_at?: string | null
          processed?: number
          started_at?: string | null
          status?: string
          total?: number
          unknown?: number
          updated_at?: string
          voip?: number
        }
        Update: {
          cache_hits?: number
          completed_at?: string | null
          created_at?: string
          current_phone?: string | null
          error_message?: string | null
          failed?: number
          id?: string
          invalid?: number
          landline?: number
          mobile?: number
          new_lookups?: number
          paused_at?: string | null
          processed?: number
          started_at?: string | null
          status?: string
          total?: number
          unknown?: number
          updated_at?: string
          voip?: number
        }
        Relationships: []
      }
      phone_lookups: {
        Row: {
          carrier_name: string | null
          carrier_type: string | null
          checked_at: string
          country_code: string | null
          line_type: string | null
          phone_e164: string
          raw_response: Json | null
          status: string
          valid: boolean
        }
        Insert: {
          carrier_name?: string | null
          carrier_type?: string | null
          checked_at?: string
          country_code?: string | null
          line_type?: string | null
          phone_e164: string
          raw_response?: Json | null
          status?: string
          valid?: boolean
        }
        Update: {
          carrier_name?: string | null
          carrier_type?: string | null
          checked_at?: string
          country_code?: string | null
          line_type?: string | null
          phone_e164?: string
          raw_response?: Json | null
          status?: string
          valid?: boolean
        }
        Relationships: []
      }
      poly_admins: {
        Row: {
          created_at: string
          notes: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      poly_market_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          id: string
          payload: Json
          slug: string | null
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at: string
          id?: string
          payload: Json
          slug?: string | null
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          id?: string
          payload?: Json
          slug?: string | null
        }
        Relationships: []
      }
      poly_memberships: {
        Row: {
          created_at: string
          discord_id: string | null
          expires_at: string
          id: string
          last_payment_id: string | null
          poly_user_id: string | null
          role: string
          started_at: string
          tier: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          discord_id?: string | null
          expires_at: string
          id?: string
          last_payment_id?: string | null
          poly_user_id?: string | null
          role?: string
          started_at?: string
          tier?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          discord_id?: string | null
          expires_at?: string
          id?: string
          last_payment_id?: string | null
          poly_user_id?: string | null
          role?: string
          started_at?: string
          tier?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "poly_memberships_last_payment_id_fkey"
            columns: ["last_payment_id"]
            isOneToOne: false
            referencedRelation: "poly_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poly_memberships_poly_user_id_fkey"
            columns: ["poly_user_id"]
            isOneToOne: true
            referencedRelation: "poly_users"
            referencedColumns: ["id"]
          },
        ]
      }
      poly_payments: {
        Row: {
          amount_sol: number
          amount_usd: number | null
          created_at: string
          discord_id: string | null
          expires_at: string | null
          id: string
          invoice_url: string | null
          nowpayments_invoice_id: string | null
          order_id: string
          pay_address: string | null
          poly_user_id: string | null
          qr_code_url: string | null
          raw_payload: Json
          status: string
          tier: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_sol: number
          amount_usd?: number | null
          created_at?: string
          discord_id?: string | null
          expires_at?: string | null
          id?: string
          invoice_url?: string | null
          nowpayments_invoice_id?: string | null
          order_id: string
          pay_address?: string | null
          poly_user_id?: string | null
          qr_code_url?: string | null
          raw_payload?: Json
          status?: string
          tier: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_sol?: number
          amount_usd?: number | null
          created_at?: string
          discord_id?: string | null
          expires_at?: string | null
          id?: string
          invoice_url?: string | null
          nowpayments_invoice_id?: string | null
          order_id?: string
          pay_address?: string | null
          poly_user_id?: string | null
          qr_code_url?: string | null
          raw_payload?: Json
          status?: string
          tier?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "poly_payments_poly_user_id_fkey"
            columns: ["poly_user_id"]
            isOneToOne: false
            referencedRelation: "poly_users"
            referencedColumns: ["id"]
          },
        ]
      }
      poly_referrals: {
        Row: {
          created_at: string
          id: string
          payment_id: string | null
          referred_user_id: string | null
          referrer_user_id: string | null
          reward_sol: number | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          payment_id?: string | null
          referred_user_id?: string | null
          referrer_user_id?: string | null
          reward_sol?: number | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          payment_id?: string | null
          referred_user_id?: string | null
          referrer_user_id?: string | null
          reward_sol?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "poly_referrals_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "poly_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      poly_signals: {
        Row: {
          confidence: string | null
          created_at: string
          edge_probability: number | null
          edge_score: number | null
          id: string
          is_published: boolean
          market_probability: number | null
          market_question: string | null
          market_slug: string | null
          market_url: string | null
          outcome: string | null
          probability_mismatch: number | null
          raw: Json
          recommendation: string | null
          risk_level: string | null
          suggested_size: string | null
          title: string
          updated_at: string
          vibe: string | null
        }
        Insert: {
          confidence?: string | null
          created_at?: string
          edge_probability?: number | null
          edge_score?: number | null
          id?: string
          is_published?: boolean
          market_probability?: number | null
          market_question?: string | null
          market_slug?: string | null
          market_url?: string | null
          outcome?: string | null
          probability_mismatch?: number | null
          raw?: Json
          recommendation?: string | null
          risk_level?: string | null
          suggested_size?: string | null
          title: string
          updated_at?: string
          vibe?: string | null
        }
        Update: {
          confidence?: string | null
          created_at?: string
          edge_probability?: number | null
          edge_score?: number | null
          id?: string
          is_published?: boolean
          market_probability?: number | null
          market_question?: string | null
          market_slug?: string | null
          market_url?: string | null
          outcome?: string | null
          probability_mismatch?: number | null
          raw?: Json
          recommendation?: string | null
          risk_level?: string | null
          suggested_size?: string | null
          title?: string
          updated_at?: string
          vibe?: string | null
        }
        Relationships: []
      }
      poly_users: {
        Row: {
          created_at: string
          discord_avatar_url: string | null
          discord_id: string | null
          discord_username: string | null
          email: string | null
          id: string
          referral_code: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          discord_avatar_url?: string | null
          discord_id?: string | null
          discord_username?: string | null
          email?: string | null
          id?: string
          referral_code?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          discord_avatar_url?: string | null
          discord_id?: string | null
          discord_username?: string | null
          email?: string | null
          id?: string
          referral_code?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      powerdial_call_logs: {
        Row: {
          ai_interested: boolean | null
          ai_reason: string | null
          ai_sentiment: string | null
          amd_result: string | null
          answered: boolean
          attempt_number: number
          batch_id: string | null
          campaign_id: string | null
          connected_to_vapi: boolean
          created_at: string
          customer_id: string | null
          dial_call_status: string | null
          dismissed_at: string | null
          disposition: string | null
          follow_up_needed: boolean
          from_number: string | null
          id: string
          meta: Json | null
          missed: boolean
          parent_call_sid: string | null
          phone: string
          queue_item_id: string | null
          recording_url: string | null
          retry_eligible: boolean
          source: string | null
          summary: string | null
          to_number: string | null
          transcript: string | null
          twilio_call_sid: string | null
          twilio_status: string | null
          updated_at: string
          vapi_call_id: string | null
          voicemail_drop_claimed_at: string | null
          voicemail_drop_completed_at: string | null
          voicemail_drop_sms_sent_at: string | null
          voicemail_drop_sms_status: string | null
        }
        Insert: {
          ai_interested?: boolean | null
          ai_reason?: string | null
          ai_sentiment?: string | null
          amd_result?: string | null
          answered?: boolean
          attempt_number?: number
          batch_id?: string | null
          campaign_id?: string | null
          connected_to_vapi?: boolean
          created_at?: string
          customer_id?: string | null
          dial_call_status?: string | null
          dismissed_at?: string | null
          disposition?: string | null
          follow_up_needed?: boolean
          from_number?: string | null
          id?: string
          meta?: Json | null
          missed?: boolean
          parent_call_sid?: string | null
          phone: string
          queue_item_id?: string | null
          recording_url?: string | null
          retry_eligible?: boolean
          source?: string | null
          summary?: string | null
          to_number?: string | null
          transcript?: string | null
          twilio_call_sid?: string | null
          twilio_status?: string | null
          updated_at?: string
          vapi_call_id?: string | null
          voicemail_drop_claimed_at?: string | null
          voicemail_drop_completed_at?: string | null
          voicemail_drop_sms_sent_at?: string | null
          voicemail_drop_sms_status?: string | null
        }
        Update: {
          ai_interested?: boolean | null
          ai_reason?: string | null
          ai_sentiment?: string | null
          amd_result?: string | null
          answered?: boolean
          attempt_number?: number
          batch_id?: string | null
          campaign_id?: string | null
          connected_to_vapi?: boolean
          created_at?: string
          customer_id?: string | null
          dial_call_status?: string | null
          dismissed_at?: string | null
          disposition?: string | null
          follow_up_needed?: boolean
          from_number?: string | null
          id?: string
          meta?: Json | null
          missed?: boolean
          parent_call_sid?: string | null
          phone?: string
          queue_item_id?: string | null
          recording_url?: string | null
          retry_eligible?: boolean
          source?: string | null
          summary?: string | null
          to_number?: string | null
          transcript?: string | null
          twilio_call_sid?: string | null
          twilio_status?: string | null
          updated_at?: string
          vapi_call_id?: string | null
          voicemail_drop_claimed_at?: string | null
          voicemail_drop_completed_at?: string | null
          voicemail_drop_sms_sent_at?: string | null
          voicemail_drop_sms_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "powerdial_call_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "powerdial_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "powerdial_call_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "powerdial_call_logs_queue_item_id_fkey"
            columns: ["queue_item_id"]
            isOneToOne: false
            referencedRelation: "powerdial_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      powerdial_campaigns: {
        Row: {
          busy_count: number
          completed_count: number
          created_at: string
          created_by: string
          current_index: number
          ended_at: string | null
          failed_count: number
          human_count: number
          id: string
          name: string
          no_answer_count: number
          schedule_status: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          settings: Json | null
          source_filter: Json | null
          started_at: string | null
          status: string
          total_leads: number
          updated_at: string
          voicemail_count: number
        }
        Insert: {
          busy_count?: number
          completed_count?: number
          created_at?: string
          created_by: string
          current_index?: number
          ended_at?: string | null
          failed_count?: number
          human_count?: number
          id?: string
          name?: string
          no_answer_count?: number
          schedule_status?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          settings?: Json | null
          source_filter?: Json | null
          started_at?: string | null
          status?: string
          total_leads?: number
          updated_at?: string
          voicemail_count?: number
        }
        Update: {
          busy_count?: number
          completed_count?: number
          created_at?: string
          created_by?: string
          current_index?: number
          ended_at?: string | null
          failed_count?: number
          human_count?: number
          id?: string
          name?: string
          no_answer_count?: number
          schedule_status?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          settings?: Json | null
          source_filter?: Json | null
          started_at?: string | null
          status?: string
          total_leads?: number
          updated_at?: string
          voicemail_count?: number
        }
        Relationships: []
      }
      powerdial_queue: {
        Row: {
          campaign_id: string
          contact_name: string | null
          created_at: string
          customer_id: string | null
          human_pickup_count: number
          id: string
          last_dialed_at: string | null
          last_result: string | null
          note: string | null
          phone: string
          position: number
          retry_at: string | null
          retry_count: number
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          contact_name?: string | null
          created_at?: string
          customer_id?: string | null
          human_pickup_count?: number
          id?: string
          last_dialed_at?: string | null
          last_result?: string | null
          note?: string | null
          phone: string
          position?: number
          retry_at?: string | null
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          contact_name?: string | null
          created_at?: string
          customer_id?: string | null
          human_pickup_count?: number
          id?: string
          last_dialed_at?: string | null
          last_result?: string | null
          note?: string | null
          phone?: string
          position?: number
          retry_at?: string | null
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "powerdial_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "powerdial_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "powerdial_queue_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      production_queue: {
        Row: {
          agreement_document_id: string | null
          assets_uploaded: boolean
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          customer_id: string | null
          deadline_at: string | null
          email: string | null
          first_name: string | null
          id: string
          invoice_id: string | null
          last_name: string | null
          listing_address: string | null
          listing_photos_status: string | null
          meta: Json
          notes: string | null
          paused_at: string | null
          payment_approved_at: string | null
          phone: string | null
          production_started_at: string | null
          proposal_id: string | null
          proposal_viewed_at: string | null
          signed_at: string | null
          signed_ip: string | null
          status: string
          total_paused_seconds: number
          updated_at: string
        }
        Insert: {
          agreement_document_id?: string | null
          assets_uploaded?: boolean
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          deadline_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          invoice_id?: string | null
          last_name?: string | null
          listing_address?: string | null
          listing_photos_status?: string | null
          meta?: Json
          notes?: string | null
          paused_at?: string | null
          payment_approved_at?: string | null
          phone?: string | null
          production_started_at?: string | null
          proposal_id?: string | null
          proposal_viewed_at?: string | null
          signed_at?: string | null
          signed_ip?: string | null
          status?: string
          total_paused_seconds?: number
          updated_at?: string
        }
        Update: {
          agreement_document_id?: string | null
          assets_uploaded?: boolean
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          deadline_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          invoice_id?: string | null
          last_name?: string | null
          listing_address?: string | null
          listing_photos_status?: string | null
          meta?: Json
          notes?: string | null
          paused_at?: string | null
          payment_approved_at?: string | null
          phone?: string | null
          production_started_at?: string | null
          proposal_id?: string | null
          proposal_viewed_at?: string | null
          signed_at?: string | null
          signed_ip?: string | null
          status?: string
          total_paused_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_queue_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_queue_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          category: string | null
          created_at: string
          customer_id: string | null
          description: string | null
          due_date: string | null
          id: string
          owner_id: string | null
          priority: string
          start_date: string | null
          status: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          owner_id?: string | null
          priority?: string
          start_date?: string | null
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          owner_id?: string | null
          priority?: string
          start_date?: string | null
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string | null
          baths: number | null
          beds: number | null
          created_at: string
          created_by: string | null
          id: string
          listing_id: string | null
          meta: Json
          price: number | null
          sqft: number | null
          status: string
          thumbnail_url: string | null
          updated_at: string
          zillow_url: string
        }
        Insert: {
          address?: string | null
          baths?: number | null
          beds?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          listing_id?: string | null
          meta?: Json
          price?: number | null
          sqft?: number | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          zillow_url: string
        }
        Update: {
          address?: string | null
          baths?: number | null
          beds?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          listing_id?: string | null
          meta?: Json
          price?: number | null
          sqft?: number | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          zillow_url?: string
        }
        Relationships: []
      }
      property_images: {
        Row: {
          ai_tag: string | null
          created_at: string
          id: string
          image_url: string
          position: number
          property_id: string
          room_type: string | null
          storage_path: string | null
        }
        Insert: {
          ai_tag?: string | null
          created_at?: string
          id?: string
          image_url: string
          position?: number
          property_id: string
          room_type?: string | null
          storage_path?: string | null
        }
        Update: {
          ai_tag?: string | null
          created_at?: string
          id?: string
          image_url?: string
          position?: number
          property_id?: string
          room_type?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_images_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          amount: number | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          company_name: string | null
          created_at: string
          currency: string | null
          customer_id: string | null
          deal_id: string | null
          document_id: string | null
          expiration_date: string | null
          id: string
          invoice_id: string | null
          lead_id: string | null
          line_items: Json
          meta: Json
          notes: string | null
          project_id: string | null
          proposal_body: string | null
          sent_at: string | null
          sent_by: string | null
          signature_required: boolean
          signed_at: string | null
          status: string
          terms: string | null
          title: string
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          amount?: number | null
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          company_name?: string | null
          created_at?: string
          currency?: string | null
          customer_id?: string | null
          deal_id?: string | null
          document_id?: string | null
          expiration_date?: string | null
          id?: string
          invoice_id?: string | null
          lead_id?: string | null
          line_items?: Json
          meta?: Json
          notes?: string | null
          project_id?: string | null
          proposal_body?: string | null
          sent_at?: string | null
          sent_by?: string | null
          signature_required?: boolean
          signed_at?: string | null
          status?: string
          terms?: string | null
          title: string
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          amount?: number | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          company_name?: string | null
          created_at?: string
          currency?: string | null
          customer_id?: string | null
          deal_id?: string | null
          document_id?: string | null
          expiration_date?: string | null
          id?: string
          invoice_id?: string | null
          lead_id?: string | null
          line_items?: Json
          meta?: Json
          notes?: string | null
          project_id?: string | null
          proposal_body?: string | null
          sent_at?: string | null
          sent_by?: string | null
          signature_required?: boolean
          signed_at?: string | null
          status?: string
          terms?: string | null
          title?: string
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      raiders: {
        Row: {
          created_at: string
          discord_user_id: string
          discord_username: string
          id: string
          rate_per_click: number
          secret_code: string | null
          solana_wallet: string | null
          status: string
          total_clicks: number
          total_earned: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          discord_user_id: string
          discord_username: string
          id?: string
          rate_per_click?: number
          secret_code?: string | null
          solana_wallet?: string | null
          status?: string
          total_clicks?: number
          total_earned?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          discord_user_id?: string
          discord_username?: string
          id?: string
          rate_per_click?: number
          secret_code?: string | null
          solana_wallet?: string | null
          status?: string
          total_clicks?: number
          total_earned?: number
          updated_at?: string
        }
        Relationships: []
      }
      recording_action_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          job_id: string | null
          message: string | null
          meta: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          job_id?: string | null
          message?: string | null
          meta?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          job_id?: string | null
          message?: string | null
          meta?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recording_action_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "recording_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      recording_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          job_id: string
          message: string | null
          metadata_json: Json | null
          payload: Json | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          job_id: string
          message?: string | null
          metadata_json?: Json | null
          payload?: Json | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          job_id?: string
          message?: string | null
          metadata_json?: Json | null
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "recording_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "recording_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      recording_jobs: {
        Row: {
          browserbase_live_view_url: string | null
          browserbase_session_id: string | null
          contract_address: string | null
          created_at: string
          created_by: string | null
          detected_phrase: string | null
          detected_phrases: Json | null
          discord_channel_id: string | null
          discord_channel_name: string | null
          discord_message_id: string | null
          discord_server_id: string | null
          discord_server_name: string | null
          discord_user_id: string | null
          discord_username: string | null
          duration_seconds: number | null
          end_time: string | null
          ended_at: string | null
          error: string | null
          id: string
          job_id: string | null
          last_error: string | null
          meta: Json | null
          notes: string | null
          recording_name: string | null
          recording_url: string | null
          retry_count: number
          source_type: string | null
          source_url: string
          start_time: string | null
          started_at: string | null
          status: string
          stop_phrase: string | null
          storage_path: string | null
          storage_size: number | null
          thumbnail_url: string | null
          token_data: Json | null
          token_name: string | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          browserbase_live_view_url?: string | null
          browserbase_session_id?: string | null
          contract_address?: string | null
          created_at?: string
          created_by?: string | null
          detected_phrase?: string | null
          detected_phrases?: Json | null
          discord_channel_id?: string | null
          discord_channel_name?: string | null
          discord_message_id?: string | null
          discord_server_id?: string | null
          discord_server_name?: string | null
          discord_user_id?: string | null
          discord_username?: string | null
          duration_seconds?: number | null
          end_time?: string | null
          ended_at?: string | null
          error?: string | null
          id?: string
          job_id?: string | null
          last_error?: string | null
          meta?: Json | null
          notes?: string | null
          recording_name?: string | null
          recording_url?: string | null
          retry_count?: number
          source_type?: string | null
          source_url: string
          start_time?: string | null
          started_at?: string | null
          status?: string
          stop_phrase?: string | null
          storage_path?: string | null
          storage_size?: number | null
          thumbnail_url?: string | null
          token_data?: Json | null
          token_name?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          browserbase_live_view_url?: string | null
          browserbase_session_id?: string | null
          contract_address?: string | null
          created_at?: string
          created_by?: string | null
          detected_phrase?: string | null
          detected_phrases?: Json | null
          discord_channel_id?: string | null
          discord_channel_name?: string | null
          discord_message_id?: string | null
          discord_server_id?: string | null
          discord_server_name?: string | null
          discord_user_id?: string | null
          discord_username?: string | null
          duration_seconds?: number | null
          end_time?: string | null
          ended_at?: string | null
          error?: string | null
          id?: string
          job_id?: string | null
          last_error?: string | null
          meta?: Json | null
          notes?: string | null
          recording_name?: string | null
          recording_url?: string | null
          retry_count?: number
          source_type?: string | null
          source_url?: string
          start_time?: string | null
          started_at?: string | null
          status?: string
          stop_phrase?: string | null
          storage_path?: string | null
          storage_size?: number | null
          thumbnail_url?: string | null
          token_data?: Json | null
          token_name?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      recording_settings: {
        Row: {
          auto_upload: boolean
          channel_id: string
          channel_name: string | null
          created_at: string
          guild_id: string
          guild_name: string | null
          id: string
          max_duration_minutes: number
          max_retries: number
          retry_enabled: boolean
          stop_phrase: string
          updated_at: string
          url_patterns: string[]
          watch_enabled: boolean
        }
        Insert: {
          auto_upload?: boolean
          channel_id: string
          channel_name?: string | null
          created_at?: string
          guild_id: string
          guild_name?: string | null
          id?: string
          max_duration_minutes?: number
          max_retries?: number
          retry_enabled?: boolean
          stop_phrase?: string
          updated_at?: string
          url_patterns?: string[]
          watch_enabled?: boolean
        }
        Update: {
          auto_upload?: boolean
          channel_id?: string
          channel_name?: string | null
          created_at?: string
          guild_id?: string
          guild_name?: string | null
          id?: string
          max_duration_minutes?: number
          max_retries?: number
          retry_enabled?: boolean
          stop_phrase?: string
          updated_at?: string
          url_patterns?: string[]
          watch_enabled?: boolean
        }
        Relationships: []
      }
      rejected_leads: {
        Row: {
          created_at: string
          id: string
          import_batch_id: string | null
          original_row: Json | null
          phone_carrier: string | null
          phone_line_type: string | null
          phone_lookup_checked_at: string | null
          phone_lookup_status: string | null
          phone_normalized: string | null
          phone_raw: string | null
          phone_valid: boolean | null
          rejection_reason: string
          source: string | null
          state: string | null
          uploaded_file_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          import_batch_id?: string | null
          original_row?: Json | null
          phone_carrier?: string | null
          phone_line_type?: string | null
          phone_lookup_checked_at?: string | null
          phone_lookup_status?: string | null
          phone_normalized?: string | null
          phone_raw?: string | null
          phone_valid?: boolean | null
          rejection_reason: string
          source?: string | null
          state?: string | null
          uploaded_file_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          import_batch_id?: string | null
          original_row?: Json | null
          phone_carrier?: string | null
          phone_line_type?: string | null
          phone_lookup_checked_at?: string | null
          phone_lookup_status?: string | null
          phone_normalized?: string | null
          phone_raw?: string | null
          phone_valid?: boolean | null
          rejection_reason?: string
          source?: string | null
          state?: string | null
          uploaded_file_name?: string | null
        }
        Relationships: []
      }
      reply_engine_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      reply_engine_posts: {
        Row: {
          author_display_name: string | null
          author_handle: string | null
          category: string | null
          created_at: string
          external_post_id: string | null
          id: string
          media_urls: Json | null
          niche: string | null
          platform: string
          post_url: string | null
          score: number | null
          status: string
          text_content: string | null
        }
        Insert: {
          author_display_name?: string | null
          author_handle?: string | null
          category?: string | null
          created_at?: string
          external_post_id?: string | null
          id?: string
          media_urls?: Json | null
          niche?: string | null
          platform?: string
          post_url?: string | null
          score?: number | null
          status?: string
          text_content?: string | null
        }
        Update: {
          author_display_name?: string | null
          author_handle?: string | null
          category?: string | null
          created_at?: string
          external_post_id?: string | null
          id?: string
          media_urls?: Json | null
          niche?: string | null
          platform?: string
          post_url?: string | null
          score?: number | null
          status?: string
          text_content?: string | null
        }
        Relationships: []
      }
      reply_engine_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      reply_reviews: {
        Row: {
          created_at: string
          edited_reply: string | null
          id: string
          post_id: string
          review_notes: string | null
          reviewed_at: string | null
          reviewer_user_id: string | null
          selected_reply_suggestion_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          edited_reply?: string | null
          id?: string
          post_id: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewer_user_id?: string | null
          selected_reply_suggestion_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          edited_reply?: string | null
          id?: string
          post_id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewer_user_id?: string | null
          selected_reply_suggestion_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reply_reviews_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "reply_engine_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reply_reviews_selected_reply_suggestion_id_fkey"
            columns: ["selected_reply_suggestion_id"]
            isOneToOne: false
            referencedRelation: "reply_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      reply_suggestions: {
        Row: {
          created_at: string
          generation_status: string
          id: string
          model_name: string | null
          post_id: string
          suggested_reply: string
          tone: string | null
          variant_name: string
        }
        Insert: {
          created_at?: string
          generation_status?: string
          id?: string
          model_name?: string | null
          post_id: string
          suggested_reply: string
          tone?: string | null
          variant_name: string
        }
        Update: {
          created_at?: string
          generation_status?: string
          id?: string
          model_name?: string | null
          post_id?: string
          suggested_reply?: string
          tone?: string | null
          variant_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "reply_suggestions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "reply_engine_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      research_findings: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          finding_type: string
          id: string
          raw_data: Json
          source_url: string | null
          status: string
          summary: string | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          finding_type?: string
          id?: string
          raw_data?: Json
          source_url?: string | null
          status?: string
          summary?: string | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          finding_type?: string
          id?: string
          raw_data?: Json
          source_url?: string | null
          status?: string
          summary?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_findings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      ringcentral_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          refresh_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          refresh_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduled_sms_jobs: {
        Row: {
          attempts: number
          body: string
          created_at: string
          customer_id: string | null
          id: string
          last_error: string | null
          meta: Json
          send_at: string
          sent_at: string | null
          source: string | null
          status: string
          to_phone: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          body: string
          created_at?: string
          customer_id?: string | null
          id?: string
          last_error?: string | null
          meta?: Json
          send_at: string
          sent_at?: string | null
          source?: string | null
          status?: string
          to_phone: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          body?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          last_error?: string | null
          meta?: Json
          send_at?: string
          sent_at?: string | null
          source?: string | null
          status?: string
          to_phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      shill_clicks: {
        Row: {
          click_type: string
          created_at: string
          discord_msg_id: string | null
          discord_user_id: string
          discord_username: string
          id: string
          raider_secret_code: string | null
          rate: number
          receipt_tweet_url: string | null
          source_tweet_url: string | null
          status: string
          tweet_url: string | null
          verified_at: string | null
        }
        Insert: {
          click_type?: string
          created_at?: string
          discord_msg_id?: string | null
          discord_user_id: string
          discord_username: string
          id?: string
          raider_secret_code?: string | null
          rate?: number
          receipt_tweet_url?: string | null
          source_tweet_url?: string | null
          status?: string
          tweet_url?: string | null
          verified_at?: string | null
        }
        Update: {
          click_type?: string
          created_at?: string
          discord_msg_id?: string | null
          discord_user_id?: string
          discord_username?: string
          id?: string
          raider_secret_code?: string | null
          rate?: number
          receipt_tweet_url?: string | null
          source_tweet_url?: string | null
          status?: string
          tweet_url?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      shill_payouts: {
        Row: {
          amount: number
          created_at: string
          discord_user_id: string
          discord_username: string
          id: string
          notes: string | null
          paid_by: string | null
          payout_type: string
          solana_tx_address: string | null
          solana_wallet: string
          verified_clicks: number
        }
        Insert: {
          amount?: number
          created_at?: string
          discord_user_id: string
          discord_username: string
          id?: string
          notes?: string | null
          paid_by?: string | null
          payout_type?: string
          solana_tx_address?: string | null
          solana_wallet: string
          verified_clicks?: number
        }
        Update: {
          amount?: number
          created_at?: string
          discord_user_id?: string
          discord_username?: string
          id?: string
          notes?: string | null
          paid_by?: string | null
          payout_type?: string
          solana_tx_address?: string | null
          solana_wallet?: string
          verified_clicks?: number
        }
        Relationships: []
      }
      shill_post_analytics: {
        Row: {
          author_handle: string | null
          author_name: string | null
          created_at: string
          detected_at: string
          discord_msg_id: string | null
          id: string
          likes: number
          posted_at: string | null
          replies: number
          retweets: number
          text_content: string | null
          tweet_id: string | null
          tweet_url: string
          updated_at: string
          views: number
        }
        Insert: {
          author_handle?: string | null
          author_name?: string | null
          created_at?: string
          detected_at?: string
          discord_msg_id?: string | null
          id?: string
          likes?: number
          posted_at?: string | null
          replies?: number
          retweets?: number
          text_content?: string | null
          tweet_id?: string | null
          tweet_url: string
          updated_at?: string
          views?: number
        }
        Update: {
          author_handle?: string | null
          author_name?: string | null
          created_at?: string
          detected_at?: string
          discord_msg_id?: string | null
          id?: string
          likes?: number
          posted_at?: string | null
          replies?: number
          retweets?: number
          text_content?: string | null
          tweet_id?: string | null
          tweet_url?: string
          updated_at?: string
          views?: number
        }
        Relationships: []
      }
      shill_scheduled_posts: {
        Row: {
          all_mode: boolean
          caption: string
          chat_id: number
          community_id: string
          created_at: string
          error: string | null
          id: string
          post_url: string | null
          repeat_daily: boolean
          request_id: string | null
          scheduled_at: string
          status: string
          storage_path: string | null
          updated_at: string
          video_url: string
          x_account: string
        }
        Insert: {
          all_mode?: boolean
          caption: string
          chat_id: number
          community_id?: string
          created_at?: string
          error?: string | null
          id?: string
          post_url?: string | null
          repeat_daily?: boolean
          request_id?: string | null
          scheduled_at: string
          status?: string
          storage_path?: string | null
          updated_at?: string
          video_url: string
          x_account?: string
        }
        Update: {
          all_mode?: boolean
          caption?: string
          chat_id?: number
          community_id?: string
          created_at?: string
          error?: string | null
          id?: string
          post_url?: string | null
          repeat_daily?: boolean
          request_id?: string | null
          scheduled_at?: string
          status?: string
          storage_path?: string | null
          updated_at?: string
          video_url?: string
          x_account?: string
        }
        Relationships: []
      }
      short_links: {
        Row: {
          click_count: number
          created_at: string
          slug: string
          target_url: string
        }
        Insert: {
          click_count?: number
          created_at?: string
          slug: string
          target_url: string
        }
        Update: {
          click_count?: number
          created_at?: string
          slug?: string
          target_url?: string
        }
        Relationships: []
      }
      signature_usage: {
        Row: {
          created_at: string
          handle: string
          id: string
          post_id: string | null
          source: string
          used_at: string
        }
        Insert: {
          created_at?: string
          handle: string
          id?: string
          post_id?: string | null
          source?: string
          used_at?: string
        }
        Update: {
          created_at?: string
          handle?: string
          id?: string
          post_id?: string | null
          source?: string
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "signature_usage_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "shill_scheduled_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      signatures: {
        Row: {
          category: string | null
          customer_id: string
          document_id: string
          id: string
          ip_address: string | null
          signature_data: string
          signature_type: string
          signed_at: string
          signer_email: string
          signer_name: string
          user_agent: string | null
        }
        Insert: {
          category?: string | null
          customer_id: string
          document_id: string
          id?: string
          ip_address?: string | null
          signature_data: string
          signature_type: string
          signed_at?: string
          signer_email: string
          signer_name: string
          user_agent?: string | null
        }
        Update: {
          category?: string | null
          customer_id?: string
          document_id?: string
          id?: string
          ip_address?: string | null
          signature_data?: string
          signature_type?: string
          signed_at?: string
          signer_email?: string
          signer_name?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signatures_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      site_configs: {
        Row: {
          content: Json
          created_at: string
          customer_id: string | null
          id: string
          is_published: boolean
          section: string
          site_id: string
          updated_at: string
          version: number
        }
        Insert: {
          content?: Json
          created_at?: string
          customer_id?: string | null
          id?: string
          is_published?: boolean
          section: string
          site_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          content?: Json
          created_at?: string
          customer_id?: string | null
          id?: string
          is_published?: boolean
          section?: string
          site_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_configs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      slybroadcast_action_logs: {
        Row: {
          action: string | null
          api_response: string | null
          campaign_id: string | null
          created_at: string
          id: string
          session_id: string | null
        }
        Insert: {
          action?: string | null
          api_response?: string | null
          campaign_id?: string | null
          created_at?: string
          id?: string
          session_id?: string | null
        }
        Update: {
          action?: string | null
          api_response?: string | null
          campaign_id?: string | null
          created_at?: string
          id?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "slybroadcast_action_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "slybroadcast_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      slybroadcast_audio_files: {
        Row: {
          created_at: string
          display_name: string | null
          duration_seconds: number | null
          id: string
          raw_payload: string | null
          system_file_name: string | null
          time_created: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          duration_seconds?: number | null
          id?: string
          raw_payload?: string | null
          system_file_name?: string | null
          time_created?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          duration_seconds?: number | null
          id?: string
          raw_payload?: string | null
          system_file_name?: string | null
          time_created?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      slybroadcast_campaigns: {
        Row: {
          audio_type: string | null
          c_audio: string | null
          c_phone_raw: string | null
          c_record_audio: string | null
          c_url: string | null
          caller_id: string | null
          created_at: string
          id: string
          mobile_only: boolean | null
          phone_count: number | null
          raw_response: string | null
          scheduled_at: string | null
          session_id: string | null
          status: string | null
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          audio_type?: string | null
          c_audio?: string | null
          c_phone_raw?: string | null
          c_record_audio?: string | null
          c_url?: string | null
          caller_id?: string | null
          created_at?: string
          id?: string
          mobile_only?: boolean | null
          phone_count?: number | null
          raw_response?: string | null
          scheduled_at?: string | null
          session_id?: string | null
          status?: string | null
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          audio_type?: string | null
          c_audio?: string | null
          c_phone_raw?: string | null
          c_record_audio?: string | null
          c_url?: string | null
          caller_id?: string | null
          created_at?: string
          id?: string
          mobile_only?: boolean | null
          phone_count?: number | null
          raw_response?: string | null
          scheduled_at?: string | null
          session_id?: string | null
          status?: string | null
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      slybroadcast_results: {
        Row: {
          campaign_id: string | null
          carrier: string | null
          created_at: string
          delivery_time: string | null
          destination_phone: string | null
          failure_reason: string | null
          id: string
          raw_payload: string | null
          session_id: string | null
          status: string | null
        }
        Insert: {
          campaign_id?: string | null
          carrier?: string | null
          created_at?: string
          delivery_time?: string | null
          destination_phone?: string | null
          failure_reason?: string | null
          id?: string
          raw_payload?: string | null
          session_id?: string | null
          status?: string | null
        }
        Update: {
          campaign_id?: string | null
          carrier?: string | null
          created_at?: string
          delivery_time?: string | null
          destination_phone?: string | null
          failure_reason?: string | null
          id?: string
          raw_payload?: string | null
          session_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "slybroadcast_results_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "slybroadcast_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      smm_artist_campaigns: {
        Row: {
          artist_handle: string
          artist_name: string
          continued_until: string | null
          created_at: string
          days_completed: number
          days_total: number
          expires_at: string | null
          id: string
          media_urls: string[]
          platforms: string[]
          profile_username: string
          schedule_pattern: string
          slot_index: number | null
          song_title: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          artist_handle: string
          artist_name: string
          continued_until?: string | null
          created_at?: string
          days_completed?: number
          days_total?: number
          expires_at?: string | null
          id?: string
          media_urls?: string[]
          platforms?: string[]
          profile_username?: string
          schedule_pattern?: string
          slot_index?: number | null
          song_title: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          artist_handle?: string
          artist_name?: string
          continued_until?: string | null
          created_at?: string
          days_completed?: number
          days_total?: number
          expires_at?: string | null
          id?: string
          media_urls?: string[]
          platforms?: string[]
          profile_username?: string
          schedule_pattern?: string
          slot_index?: number | null
          song_title?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      smm_boost_orders: {
        Row: {
          charge: number | null
          created_at: string
          darkside_status: string | null
          id: string
          link: string | null
          order_id: string | null
          plan_id: string | null
          platform: string
          post_id: string | null
          profile_username: string
          quantity: number
          remains: number | null
          schedule_item_id: string | null
          service_id: string
          service_name: string
          start_count: number | null
          status: string
          updated_at: string
        }
        Insert: {
          charge?: number | null
          created_at?: string
          darkside_status?: string | null
          id?: string
          link?: string | null
          order_id?: string | null
          plan_id?: string | null
          platform: string
          post_id?: string | null
          profile_username?: string
          quantity?: number
          remains?: number | null
          schedule_item_id?: string | null
          service_id: string
          service_name: string
          start_count?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          charge?: number | null
          created_at?: string
          darkside_status?: string | null
          id?: string
          link?: string | null
          order_id?: string | null
          plan_id?: string | null
          platform?: string
          post_id?: string | null
          profile_username?: string
          quantity?: number
          remains?: number | null
          schedule_item_id?: string | null
          service_id?: string
          service_name?: string
          start_count?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "smm_boost_orders_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "smm_content_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      smm_boost_presets: {
        Row: {
          created_at: string
          id: string
          preset_name: string
          profile_username: string
          services: Json
        }
        Insert: {
          created_at?: string
          id?: string
          preset_name: string
          profile_username?: string
          services?: Json
        }
        Update: {
          created_at?: string
          id?: string
          preset_name?: string
          profile_username?: string
          services?: Json
        }
        Relationships: []
      }
      smm_brand_prompts: {
        Row: {
          category: string
          created_at: string
          effectiveness_score: number | null
          example_output: string | null
          id: string
          niche: string | null
          profile_username: string
          prompt_text: string
          times_used: number | null
        }
        Insert: {
          category?: string
          created_at?: string
          effectiveness_score?: number | null
          example_output?: string | null
          id?: string
          niche?: string | null
          profile_username: string
          prompt_text: string
          times_used?: number | null
        }
        Update: {
          category?: string
          created_at?: string
          effectiveness_score?: number | null
          example_output?: string | null
          id?: string
          niche?: string | null
          profile_username?: string
          prompt_text?: string
          times_used?: number | null
        }
        Relationships: []
      }
      smm_content_plans: {
        Row: {
          brand_context: Json
          created_at: string
          id: string
          plan_name: string
          platform: string
          profile_username: string
          schedule_items: Json
          status: string
          updated_at: string
        }
        Insert: {
          brand_context?: Json
          created_at?: string
          id?: string
          plan_name: string
          platform: string
          profile_username: string
          schedule_items?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          brand_context?: Json
          created_at?: string
          id?: string
          plan_name?: string
          platform?: string
          profile_username?: string
          schedule_items?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      smm_conversations: {
        Row: {
          created_at: string
          id: string
          message: string
          meta: Json
          platform: string
          profile_username: string
          role: string
          source: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          meta?: Json
          platform?: string
          profile_username?: string
          role?: string
          source?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          meta?: Json
          platform?: string
          profile_username?: string
          role?: string
          source?: string
        }
        Relationships: []
      }
      sms_campaign_recipients: {
        Row: {
          campaign_id: string
          contact_name: string | null
          created_at: string
          error: string | null
          external_id: string | null
          id: string
          phone: string
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          contact_name?: string | null
          created_at?: string
          error?: string | null
          external_id?: string | null
          id?: string
          phone: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          contact_name?: string | null
          created_at?: string
          error?: string | null
          external_id?: string | null
          id?: string
          phone?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sms_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_campaigns: {
        Row: {
          body: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          failed_count: number
          id: string
          name: string
          sent_count: number
          started_at: string | null
          status: string
          total_recipients: number
          updated_at: string
        }
        Insert: {
          body: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          failed_count?: number
          id?: string
          name: string
          sent_count?: number
          started_at?: string | null
          status?: string
          total_recipients?: number
          updated_at?: string
        }
        Update: {
          body?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          failed_count?: number
          id?: string
          name?: string
          sent_count?: number
          started_at?: string | null
          status?: string
          total_recipients?: number
          updated_at?: string
        }
        Relationships: []
      }
      sms_contacts: {
        Row: {
          created_at: string
          device_audit_meta: Json | null
          device_audited_at: string | null
          device_type: string | null
          email: string | null
          id: string
          instagram: string | null
          name: string
          name_color: string | null
          notes: string | null
          phone: string | null
          phone_last10: string
          pinned: boolean
          pinned_at: string | null
          starred: boolean
          starred_at: string | null
          tags: string[] | null
          updated_at: string
          vip_route: boolean
        }
        Insert: {
          created_at?: string
          device_audit_meta?: Json | null
          device_audited_at?: string | null
          device_type?: string | null
          email?: string | null
          id?: string
          instagram?: string | null
          name: string
          name_color?: string | null
          notes?: string | null
          phone?: string | null
          phone_last10: string
          pinned?: boolean
          pinned_at?: string | null
          starred?: boolean
          starred_at?: string | null
          tags?: string[] | null
          updated_at?: string
          vip_route?: boolean
        }
        Update: {
          created_at?: string
          device_audit_meta?: Json | null
          device_audited_at?: string | null
          device_type?: string | null
          email?: string | null
          id?: string
          instagram?: string | null
          name?: string
          name_color?: string | null
          notes?: string | null
          phone?: string | null
          phone_last10?: string
          pinned?: boolean
          pinned_at?: string | null
          starred?: boolean
          starred_at?: string | null
          tags?: string[] | null
          updated_at?: string
          vip_route?: boolean
        }
        Relationships: []
      }
      sms_deleted_external_ids: {
        Row: {
          deleted_at: string
          external_id: string
          phone_last10: string | null
        }
        Insert: {
          deleted_at?: string
          external_id: string
          phone_last10?: string | null
        }
        Update: {
          deleted_at?: string
          external_id?: string
          phone_last10?: string | null
        }
        Relationships: []
      }
      sms_dnd_list: {
        Row: {
          created_at: string
          id: string
          meta: Json
          original_message_body: string | null
          phone: string
          phone_last10: string
          reason: string | null
          source: string
        }
        Insert: {
          created_at?: string
          id?: string
          meta?: Json
          original_message_body?: string | null
          phone: string
          phone_last10: string
          reason?: string | null
          source?: string
        }
        Update: {
          created_at?: string
          id?: string
          meta?: Json
          original_message_body?: string | null
          phone?: string
          phone_last10?: string
          reason?: string | null
          source?: string
        }
        Relationships: []
      }
      sms_sequence_enrollments: {
        Row: {
          contact_name: string | null
          created_at: string
          current_step: number
          customer_id: string | null
          id: string
          last_inbound_at: string | null
          last_outbound_at: string | null
          phone: string
          sequence_id: string
          source: string | null
          source_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          current_step?: number
          customer_id?: string | null
          id?: string
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          phone: string
          sequence_id: string
          source?: string | null
          source_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          current_step?: number
          customer_id?: string | null
          id?: string
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          phone?: string
          sequence_id?: string
          source?: string | null
          source_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_sequence_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sms_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_sequence_steps: {
        Row: {
          body: string
          created_at: string
          id: string
          reply_match: string | null
          sequence_id: string
          step_order: number
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          reply_match?: string | null
          sequence_id: string
          step_order: number
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          reply_match?: string | null
          sequence_id?: string
          step_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "sms_sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sms_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_sequences: {
        Row: {
          ai_fallback_enabled: boolean
          ai_system_prompt: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          trigger_type: string
          updated_at: string
        }
        Insert: {
          ai_fallback_enabled?: boolean
          ai_system_prompt?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          trigger_type?: string
          updated_at?: string
        }
        Update: {
          ai_fallback_enabled?: boolean
          ai_system_prompt?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          trigger_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      sms_templates: {
        Row: {
          body: string
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      stale_zillow_leads: {
        Row: {
          address: string | null
          agent_name: string | null
          agent_phone: string | null
          apify_run_id: string | null
          bathrooms: number | null
          bedrooms: number | null
          brokerage: string | null
          city: string | null
          created_at: string
          date_posted: string | null
          days_on_zillow: number | null
          flagged: boolean
          home_status: string | null
          home_type: string | null
          id: string
          listed_price: number | null
          lot_sqft: number | null
          meta: Json
          price_drop_count: number | null
          price_history: Json
          sqft: number | null
          state: string | null
          total_price_drop_percent: number | null
          updated_at: string
          user_notes: string | null
          year_built: number | null
          zestimate: number | null
          zillow_url: string | null
          zip: string | null
          zpid: string | null
        }
        Insert: {
          address?: string | null
          agent_name?: string | null
          agent_phone?: string | null
          apify_run_id?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          brokerage?: string | null
          city?: string | null
          created_at?: string
          date_posted?: string | null
          days_on_zillow?: number | null
          flagged?: boolean
          home_status?: string | null
          home_type?: string | null
          id?: string
          listed_price?: number | null
          lot_sqft?: number | null
          meta?: Json
          price_drop_count?: number | null
          price_history?: Json
          sqft?: number | null
          state?: string | null
          total_price_drop_percent?: number | null
          updated_at?: string
          user_notes?: string | null
          year_built?: number | null
          zestimate?: number | null
          zillow_url?: string | null
          zip?: string | null
          zpid?: string | null
        }
        Update: {
          address?: string | null
          agent_name?: string | null
          agent_phone?: string | null
          apify_run_id?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          brokerage?: string | null
          city?: string | null
          created_at?: string
          date_posted?: string | null
          days_on_zillow?: number | null
          flagged?: boolean
          home_status?: string | null
          home_type?: string | null
          id?: string
          listed_price?: number | null
          lot_sqft?: number | null
          meta?: Json
          price_drop_count?: number | null
          price_history?: Json
          sqft?: number | null
          state?: string | null
          total_price_drop_percent?: number | null
          updated_at?: string
          user_notes?: string | null
          year_built?: number | null
          zestimate?: number | null
          zillow_url?: string | null
          zip?: string | null
          zpid?: string | null
        }
        Relationships: []
      }
      state_leads: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          duplicate_of_lead_id: string | null
          email: string | null
          first_name: string | null
          id: string
          import_batch_id: string | null
          last_contacted_at: string | null
          name: string | null
          office_phone: string | null
          phone_carrier: string | null
          phone_e164: string
          phone_line_type: string | null
          phone_lookup_checked_at: string | null
          phone_lookup_status: string | null
          phone_number: string
          phone_valid: boolean | null
          property_address: string | null
          source: string
          state: string
          uploaded_file_name: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          duplicate_of_lead_id?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          import_batch_id?: string | null
          last_contacted_at?: string | null
          name?: string | null
          office_phone?: string | null
          phone_carrier?: string | null
          phone_e164: string
          phone_line_type?: string | null
          phone_lookup_checked_at?: string | null
          phone_lookup_status?: string | null
          phone_number: string
          phone_valid?: boolean | null
          property_address?: string | null
          source?: string
          state: string
          uploaded_file_name?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          duplicate_of_lead_id?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          import_batch_id?: string | null
          last_contacted_at?: string | null
          name?: string | null
          office_phone?: string | null
          phone_carrier?: string | null
          phone_e164?: string
          phone_line_type?: string | null
          phone_lookup_checked_at?: string | null
          phone_lookup_status?: string | null
          phone_number?: string
          phone_valid?: boolean | null
          property_address?: string | null
          source?: string
          state?: string
          uploaded_file_name?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      state_summary: {
        Row: {
          last_upload_at: string | null
          state: string
          total_leads: number
          total_unique_numbers: number
        }
        Insert: {
          last_upload_at?: string | null
          state: string
          total_leads?: number
          total_unique_numbers?: number
        }
        Update: {
          last_upload_at?: string | null
          state?: string
          total_leads?: number
          total_unique_numbers?: number
        }
        Relationships: []
      }
      studio_assets: {
        Row: {
          created_at: string
          id: string
          image_url: string
          name: string | null
          notes: string | null
          pair_id: string | null
          project_id: string | null
          sort_order: number
          storage_path: string | null
          subproject_id: string | null
          updated_at: string
          user_id: string
          variant: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          name?: string | null
          notes?: string | null
          pair_id?: string | null
          project_id?: string | null
          sort_order?: number
          storage_path?: string | null
          subproject_id?: string | null
          updated_at?: string
          user_id: string
          variant?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          name?: string | null
          notes?: string | null
          pair_id?: string | null
          project_id?: string | null
          sort_order?: number
          storage_path?: string | null
          subproject_id?: string | null
          updated_at?: string
          user_id?: string
          variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "studio_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "studio_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_assets_subproject_id_fkey"
            columns: ["subproject_id"]
            isOneToOne: false
            referencedRelation: "studio_subprojects"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_batch_items: {
        Row: {
          batch_id: string
          created_at: string
          error_message: string | null
          generation_job_id: string | null
          id: string
          input_audio_url: string | null
          input_image_url: string | null
          negative_prompt: string | null
          position: number
          prompt: string
          settings_json: Json
          status: string
          task_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          error_message?: string | null
          generation_job_id?: string | null
          id?: string
          input_audio_url?: string | null
          input_image_url?: string | null
          negative_prompt?: string | null
          position?: number
          prompt: string
          settings_json?: Json
          status?: string
          task_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          error_message?: string | null
          generation_job_id?: string | null
          id?: string
          input_audio_url?: string | null
          input_image_url?: string | null
          negative_prompt?: string | null
          position?: number
          prompt?: string
          settings_json?: Json
          status?: string
          task_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "studio_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_batch_items_generation_job_id_fkey"
            columns: ["generation_job_id"]
            isOneToOne: false
            referencedRelation: "generation_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_batches: {
        Row: {
          completed_items: number
          created_at: string
          failed_items: number
          id: string
          name: string
          project_id: string | null
          status: string
          submitted_at: string | null
          subproject_id: string | null
          total_items: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_items?: number
          created_at?: string
          failed_items?: number
          id?: string
          name?: string
          project_id?: string | null
          status?: string
          submitted_at?: string | null
          subproject_id?: string | null
          total_items?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_items?: number
          created_at?: string
          failed_items?: number
          id?: string
          name?: string
          project_id?: string | null
          status?: string
          submitted_at?: string | null
          subproject_id?: string | null
          total_items?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_batches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "studio_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_batches_subproject_id_fkey"
            columns: ["subproject_id"]
            isOneToOne: false
            referencedRelation: "studio_subprojects"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_notes: {
        Row: {
          content: string
          created_at: string
          id: string
          pinned: boolean
          project_id: string | null
          subproject_id: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          pinned?: boolean
          project_id?: string | null
          subproject_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          pinned?: boolean
          project_id?: string | null
          subproject_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      studio_projects: {
        Row: {
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          kind: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: string | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      studio_references: {
        Row: {
          created_at: string
          id: string
          image_url: string
          name: string | null
          notes: string | null
          project_id: string | null
          storage_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          name?: string | null
          notes?: string | null
          project_id?: string | null
          storage_path?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          name?: string | null
          notes?: string | null
          project_id?: string | null
          storage_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "studio_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_settings: {
        Row: {
          backend_config_json: Json
          branding_json: Json
          created_at: string
          default_presets_json: Json
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          backend_config_json?: Json
          branding_json?: Json
          created_at?: string
          default_presets_json?: Json
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          backend_config_json?: Json
          branding_json?: Json
          created_at?: string
          default_presets_json?: Json
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      studio_storyboards: {
        Row: {
          created_at: string
          first_frame_path: string | null
          first_frame_url: string | null
          id: string
          image_url: string
          name: string | null
          notes: string | null
          project_id: string | null
          sort_order: number
          storage_path: string | null
          subproject_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          first_frame_path?: string | null
          first_frame_url?: string | null
          id?: string
          image_url: string
          name?: string | null
          notes?: string | null
          project_id?: string | null
          sort_order?: number
          storage_path?: string | null
          subproject_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          first_frame_path?: string | null
          first_frame_url?: string | null
          id?: string
          image_url?: string
          name?: string | null
          notes?: string | null
          project_id?: string | null
          sort_order?: number
          storage_path?: string | null
          subproject_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_storyboards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "studio_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_storyboards_subproject_id_fkey"
            columns: ["subproject_id"]
            isOneToOne: false
            referencedRelation: "studio_subprojects"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_subprojects: {
        Row: {
          color: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_subprojects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "studio_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_templates: {
        Row: {
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          snapshot: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          snapshot?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          snapshot?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppression_list: {
        Row: {
          created_at: string
          email: string | null
          id: string
          phone_e164: string | null
          reason: string | null
          source: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          phone_e164?: string | null
          reason?: string | null
          source?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          phone_e164?: string | null
          reason?: string | null
          source?: string | null
        }
        Relationships: []
      }
      target_locations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          last_scraped_at: string | null
          location: string
          priority: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_scraped_at?: string | null
          location: string
          priority?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_scraped_at?: string | null
          location?: string
          priority?: number
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assignee_id: string | null
          category: string | null
          checklist: Json
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          priority: string
          project_id: string
          status: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          category?: string | null
          checklist?: Json
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          project_id: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          category?: string | null
          checklist?: Json
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          project_id?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          body_html: string
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          placeholders: string[]
          type: string
          updated_at: string
        }
        Insert: {
          body_html?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          placeholders?: string[]
          type?: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          placeholders?: string[]
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transcriptions: {
        Row: {
          audio_url: string | null
          category: string | null
          created_at: string
          customer_id: string | null
          direction: string | null
          duration_seconds: number | null
          id: string
          occurred_at: string | null
          phone_from: string | null
          phone_to: string | null
          source_id: string
          source_type: string
          summary: string | null
          transcript: string
        }
        Insert: {
          audio_url?: string | null
          category?: string | null
          created_at?: string
          customer_id?: string | null
          direction?: string | null
          duration_seconds?: number | null
          id?: string
          occurred_at?: string | null
          phone_from?: string | null
          phone_to?: string | null
          source_id: string
          source_type: string
          summary?: string | null
          transcript: string
        }
        Update: {
          audio_url?: string | null
          category?: string | null
          created_at?: string
          customer_id?: string | null
          direction?: string | null
          duration_seconds?: number | null
          id?: string
          occurred_at?: string | null
          phone_from?: string | null
          phone_to?: string | null
          source_id?: string
          source_type?: string
          summary?: string | null
          transcript?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      twilio_inbound_logs: {
        Row: {
          body: string | null
          created_at: string
          elapsed_ms: number | null
          event: string
          from_number: string | null
          id: string
          level: string
          message_sid: string | null
          metadata: Json | null
          to_number: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          elapsed_ms?: number | null
          event: string
          from_number?: string | null
          id?: string
          level?: string
          message_sid?: string | null
          metadata?: Json | null
          to_number?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          elapsed_ms?: number | null
          event?: string
          from_number?: string | null
          id?: string
          level?: string
          message_sid?: string | null
          metadata?: Json | null
          to_number?: string | null
        }
        Relationships: []
      }
      upload_logs: {
        Row: {
          created_at: string
          duplicate_count: number
          file_name: string | null
          id: string
          inserted_count: number
          state: string
          total_rows: number
        }
        Insert: {
          created_at?: string
          duplicate_count?: number
          file_name?: string | null
          id?: string
          inserted_count?: number
          state: string
          total_rows?: number
        }
        Update: {
          created_at?: string
          duplicate_count?: number
          file_name?: string | null
          id?: string
          inserted_count?: number
          state?: string
          total_rows?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vanities: {
        Row: {
          claimed_at: string | null
          claimed_ip: string | null
          created_at: string
          id: string
          value: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_ip?: string | null
          created_at?: string
          id?: string
          value: string
        }
        Update: {
          claimed_at?: string | null
          claimed_ip?: string | null
          created_at?: string
          id?: string
          value?: string
        }
        Relationships: []
      }
      vapi_remind_queue: {
        Row: {
          attempts: number
          business_name: string | null
          connected_at: string | null
          created_at: string
          customer_id: string
          full_name: string
          id: string
          last_call_id: string | null
          last_call_result: string | null
          max_attempts: number
          next_call_at: string
          phone: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          business_name?: string | null
          connected_at?: string | null
          created_at?: string
          customer_id: string
          full_name: string
          id?: string
          last_call_id?: string | null
          last_call_result?: string | null
          max_attempts?: number
          next_call_at: string
          phone: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          business_name?: string | null
          connected_at?: string | null
          created_at?: string
          customer_id?: string
          full_name?: string
          id?: string
          last_call_id?: string | null
          last_call_result?: string | null
          max_attempts?: number
          next_call_at?: string
          phone?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vapi_remind_queue_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      videography_prospects: {
        Row: {
          address: string | null
          agreement_doc_id: string | null
          business_name: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_role: string | null
          created_at: string
          id: string
          last_contacted_at: string | null
          meta: Json
          next_followup_at: string | null
          notes: string | null
          phone: string | null
          pipeline_stage: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          agreement_doc_id?: string | null
          business_name: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          created_at?: string
          id?: string
          last_contacted_at?: string | null
          meta?: Json
          next_followup_at?: string | null
          notes?: string | null
          phone?: string | null
          pipeline_stage?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          agreement_doc_id?: string | null
          business_name?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          created_at?: string
          id?: string
          last_contacted_at?: string | null
          meta?: Json
          next_followup_at?: string | null
          notes?: string | null
          phone?: string | null
          pipeline_stage?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      voice_drop_campaigns: {
        Row: {
          active_end_at: string | null
          active_start_at: string | null
          answered_calls_count: number
          business_line_1: string | null
          callbacks_count: number
          campaign_cid: string | null
          campaign_name: string
          conversion_rate: number
          created_at: string
          drops_sent: number
          estimated_delivered: number
          id: string
          last_synced_at: string | null
          leadsrain_campaign_id: string | null
          leadsrain_list_id: string | null
          missed_calls_count: number
          notes: string | null
          provider: string
          sms_replies_sent_count: number
          sound_file_url: string | null
          status: string
          total_leads: number
          twilio_number: string | null
          updated_at: string
          user_id: string
          verizon_forward_number: string | null
        }
        Insert: {
          active_end_at?: string | null
          active_start_at?: string | null
          answered_calls_count?: number
          business_line_1?: string | null
          callbacks_count?: number
          campaign_cid?: string | null
          campaign_name: string
          conversion_rate?: number
          created_at?: string
          drops_sent?: number
          estimated_delivered?: number
          id?: string
          last_synced_at?: string | null
          leadsrain_campaign_id?: string | null
          leadsrain_list_id?: string | null
          missed_calls_count?: number
          notes?: string | null
          provider?: string
          sms_replies_sent_count?: number
          sound_file_url?: string | null
          status?: string
          total_leads?: number
          twilio_number?: string | null
          updated_at?: string
          user_id: string
          verizon_forward_number?: string | null
        }
        Update: {
          active_end_at?: string | null
          active_start_at?: string | null
          answered_calls_count?: number
          business_line_1?: string | null
          callbacks_count?: number
          campaign_cid?: string | null
          campaign_name?: string
          conversion_rate?: number
          created_at?: string
          drops_sent?: number
          estimated_delivered?: number
          id?: string
          last_synced_at?: string | null
          leadsrain_campaign_id?: string | null
          leadsrain_list_id?: string | null
          missed_calls_count?: number
          notes?: string | null
          provider?: string
          sms_replies_sent_count?: number
          sound_file_url?: string | null
          status?: string
          total_leads?: number
          twilio_number?: string | null
          updated_at?: string
          user_id?: string
          verizon_forward_number?: string | null
        }
        Relationships: []
      }
      voice_drop_events: {
        Row: {
          campaign_id: string | null
          contact_id: string | null
          created_at: string
          event_source: string | null
          event_type: string
          id: string
          lead_id: string | null
          phone_number: string | null
          provider: string
          raw_payload: Json | null
          user_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          event_source?: string | null
          event_type: string
          id?: string
          lead_id?: string | null
          phone_number?: string | null
          provider?: string
          raw_payload?: Json | null
          user_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          event_source?: string | null
          event_type?: string
          id?: string
          lead_id?: string | null
          phone_number?: string | null
          provider?: string
          raw_payload?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_drop_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "voice_drop_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_drop_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "voice_drop_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_drop_leads: {
        Row: {
          address: string | null
          campaign_id: string
          city: string | null
          contact_id: string | null
          created_at: string
          email: string | null
          error_message: string | null
          first_name: string | null
          id: string
          last_name: string | null
          leadsrain_response: Json | null
          leadsrain_upload_status: string
          notes: string | null
          phone_number: string
          state: string | null
          updated_at: string
          user_id: string
          zip: string | null
        }
        Insert: {
          address?: string | null
          campaign_id: string
          city?: string | null
          contact_id?: string | null
          created_at?: string
          email?: string | null
          error_message?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          leadsrain_response?: Json | null
          leadsrain_upload_status?: string
          notes?: string | null
          phone_number: string
          state?: string | null
          updated_at?: string
          user_id: string
          zip?: string | null
        }
        Update: {
          address?: string | null
          campaign_id?: string
          city?: string | null
          contact_id?: string | null
          created_at?: string
          email?: string | null
          error_message?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          leadsrain_response?: Json | null
          leadsrain_upload_status?: string
          notes?: string | null
          phone_number?: string
          state?: string | null
          updated_at?: string
          user_id?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_drop_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "voice_drop_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_drop_settings: {
        Row: {
          attribution_window_hours: number
          business_line_1: string | null
          created_at: string
          default_campaign_cid: string | null
          default_missed_call_sms: string
          twilio_forward_number: string | null
          updated_at: string
          user_id: string
          verizon_forward_number: string | null
          voidfix_enabled: boolean
        }
        Insert: {
          attribution_window_hours?: number
          business_line_1?: string | null
          created_at?: string
          default_campaign_cid?: string | null
          default_missed_call_sms?: string
          twilio_forward_number?: string | null
          updated_at?: string
          user_id: string
          verizon_forward_number?: string | null
          voidfix_enabled?: boolean
        }
        Update: {
          attribution_window_hours?: number
          business_line_1?: string | null
          created_at?: string
          default_campaign_cid?: string | null
          default_missed_call_sms?: string
          twilio_forward_number?: string | null
          updated_at?: string
          user_id?: string
          verizon_forward_number?: string | null
          voidfix_enabled?: boolean
        }
        Relationships: []
      }
      voicemail_recordings: {
        Row: {
          channels: number
          codec: string
          created_at: string
          created_by: string | null
          duration_sec: number | null
          file_size: number | null
          id: string
          is_active: boolean
          last_fetch_status: Json | null
          last_test_amd_result: string | null
          last_test_call_sid: string | null
          last_test_played_at: string | null
          mime_type: string
          name: string
          original_filename: string | null
          original_format: string | null
          original_size: number | null
          pause_after_sec: number
          pause_before_sec: number
          public_url: string
          sample_rate: number
          storage_path: string
          tts_fallback_text: string | null
          updated_at: string
        }
        Insert: {
          channels?: number
          codec?: string
          created_at?: string
          created_by?: string | null
          duration_sec?: number | null
          file_size?: number | null
          id?: string
          is_active?: boolean
          last_fetch_status?: Json | null
          last_test_amd_result?: string | null
          last_test_call_sid?: string | null
          last_test_played_at?: string | null
          mime_type?: string
          name: string
          original_filename?: string | null
          original_format?: string | null
          original_size?: number | null
          pause_after_sec?: number
          pause_before_sec?: number
          public_url: string
          sample_rate?: number
          storage_path: string
          tts_fallback_text?: string | null
          updated_at?: string
        }
        Update: {
          channels?: number
          codec?: string
          created_at?: string
          created_by?: string | null
          duration_sec?: number | null
          file_size?: number | null
          id?: string
          is_active?: boolean
          last_fetch_status?: Json | null
          last_test_amd_result?: string | null
          last_test_call_sid?: string | null
          last_test_played_at?: string | null
          mime_type?: string
          name?: string
          original_filename?: string | null
          original_format?: string | null
          original_size?: number | null
          pause_after_sec?: number
          pause_before_sec?: number
          public_url?: string
          sample_rate?: number
          storage_path?: string
          tts_fallback_text?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      warm_welcome_campaigns: {
        Row: {
          cooldown_until: string | null
          counters_day: string
          created_at: string
          created_by: string | null
          filter_snapshot: Json | null
          id: string
          imessage_new_sent_today: number
          last_processed_at: string | null
          name: string
          sms_sent_today: number
          status: string
          total_failed: number
          total_sent: number
          total_skipped: number
          total_targets: number
          updated_at: string
        }
        Insert: {
          cooldown_until?: string | null
          counters_day?: string
          created_at?: string
          created_by?: string | null
          filter_snapshot?: Json | null
          id?: string
          imessage_new_sent_today?: number
          last_processed_at?: string | null
          name?: string
          sms_sent_today?: number
          status?: string
          total_failed?: number
          total_sent?: number
          total_skipped?: number
          total_targets?: number
          updated_at?: string
        }
        Update: {
          cooldown_until?: string | null
          counters_day?: string
          created_at?: string
          created_by?: string | null
          filter_snapshot?: Json | null
          id?: string
          imessage_new_sent_today?: number
          last_processed_at?: string | null
          name?: string
          sms_sent_today?: number
          status?: string
          total_failed?: number
          total_sent?: number
          total_skipped?: number
          total_targets?: number
          updated_at?: string
        }
        Relationships: []
      }
      warm_welcome_logs: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          level: string
          message: string
          meta: Json | null
          target_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          level?: string
          message: string
          meta?: Json | null
          target_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          level?: string
          message?: string
          meta?: Json | null
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warm_welcome_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "warm_welcome_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warm_welcome_logs_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "warm_welcome_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      warm_welcome_targets: {
        Row: {
          attempt_count: number
          campaign_id: string
          channel: string | null
          created_at: string
          device_type: string | null
          error: string | null
          hot_reply_id: string | null
          id: string
          is_new_imessage_contact: boolean | null
          message_text: string | null
          name: string | null
          next_attempt_at: string
          phone_e164: string
          phone_last10: string
          reply_at: string | null
          reply_text: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          campaign_id: string
          channel?: string | null
          created_at?: string
          device_type?: string | null
          error?: string | null
          hot_reply_id?: string | null
          id?: string
          is_new_imessage_contact?: boolean | null
          message_text?: string | null
          name?: string | null
          next_attempt_at?: string
          phone_e164: string
          phone_last10: string
          reply_at?: string | null
          reply_text?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          campaign_id?: string
          channel?: string | null
          created_at?: string
          device_type?: string | null
          error?: string | null
          hot_reply_id?: string | null
          id?: string
          is_new_imessage_contact?: boolean | null
          message_text?: string | null
          name?: string | null
          next_attempt_at?: string
          phone_e164?: string
          phone_last10?: string
          reply_at?: string | null
          reply_text?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warm_welcome_targets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "warm_welcome_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          processed: boolean
          source: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          processed?: boolean
          source: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          processed?: boolean
          source?: string
        }
        Relationships: []
      }
      x_feed_tweets: {
        Row: {
          author_avatar: string | null
          author_display_name: string
          author_username: string
          created_at: string
          gold: boolean
          id: string
          likes: number
          media_url: string | null
          raw_message: string | null
          replies: number
          retweets: number
          source_url: string | null
          tweet_text: string
          verified: boolean
          views: number
        }
        Insert: {
          author_avatar?: string | null
          author_display_name?: string
          author_username?: string
          created_at?: string
          gold?: boolean
          id?: string
          likes?: number
          media_url?: string | null
          raw_message?: string | null
          replies?: number
          retweets?: number
          source_url?: string | null
          tweet_text: string
          verified?: boolean
          views?: number
        }
        Update: {
          author_avatar?: string | null
          author_display_name?: string
          author_username?: string
          created_at?: string
          gold?: boolean
          id?: string
          likes?: number
          media_url?: string | null
          raw_message?: string | null
          replies?: number
          retweets?: number
          source_url?: string | null
          tweet_text?: string
          verified?: boolean
          views?: number
        }
        Relationships: []
      }
      xitbot_poll_state: {
        Row: {
          channel_id: string
          last_message_id: string | null
          updated_at: string
        }
        Insert: {
          channel_id: string
          last_message_id?: string | null
          updated_at?: string
        }
        Update: {
          channel_id?: string
          last_message_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      lw_landing_pages_public: {
        Row: {
          accent_color: string | null
          client_name: string | null
          created_at: string | null
          email: string | null
          headline: string | null
          id: string | null
          is_active: boolean | null
          logo_url: string | null
          meta: Json | null
          phone: string | null
          photo_url: string | null
          reviews: Json | null
          slug: string | null
          sub_headline: string | null
          tagline: string | null
          updated_at: string | null
        }
        Insert: {
          accent_color?: string | null
          client_name?: string | null
          created_at?: string | null
          email?: string | null
          headline?: string | null
          id?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          meta?: Json | null
          phone?: string | null
          photo_url?: string | null
          reviews?: Json | null
          slug?: string | null
          sub_headline?: string | null
          tagline?: string | null
          updated_at?: string | null
        }
        Update: {
          accent_color?: string | null
          client_name?: string | null
          created_at?: string | null
          email?: string | null
          headline?: string | null
          id?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          meta?: Json | null
          phone?: string | null
          photo_url?: string | null
          reviews?: Json | null
          slug?: string | null
          sub_headline?: string | null
          tagline?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      state_verified_summary: {
        Row: {
          audited_count: number | null
          invalid_count: number | null
          landline_count: number | null
          state: string | null
          total_count: number | null
          verified_mobile: number | null
          voip_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      customer_signature_exists: {
        Args: { _customer_id: string }
        Returns: boolean
      }
      document_signature_exists: {
        Args: { _document_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      poly_is_admin: { Args: { _user_id: string }; Returns: boolean }
      poly_is_member: { Args: { _user_id: string }; Returns: boolean }
      production_queue_mark_overdue: { Args: never; Returns: undefined }
      track_proposal_deposit_open: {
        Args: { _proposal_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "staff"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "manager", "staff"],
    },
  },
} as const
