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
      api_previews: {
        Row: {
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
      lw_buyers: {
        Row: {
          acreage_max: number | null
          acreage_min: number | null
          activity_score: number
          budget_max: number | null
          budget_min: number | null
          created_at: string
          deal_type: string
          email: string | null
          entity_name: string | null
          full_name: string
          id: string
          last_purchase_date: string | null
          meta: Json
          notes: string | null
          phone: string | null
          purchase_count: number | null
          reapi_owner_id: string | null
          source: string
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
          created_at?: string
          deal_type?: string
          email?: string | null
          entity_name?: string | null
          full_name: string
          id?: string
          last_purchase_date?: string | null
          meta?: Json
          notes?: string | null
          phone?: string | null
          purchase_count?: number | null
          reapi_owner_id?: string | null
          source?: string
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
          created_at?: string
          deal_type?: string
          email?: string | null
          entity_name?: string | null
          full_name?: string
          id?: string
          last_purchase_date?: string | null
          meta?: Json
          notes?: string | null
          phone?: string | null
          purchase_count?: number | null
          reapi_owner_id?: string | null
          source?: string
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
      lw_sellers: {
        Row: {
          acreage: number | null
          address_full: string | null
          apn: string | null
          asking_price: number | null
          assessed_value: number | null
          city: string | null
          contacted_at: string | null
          county: string | null
          created_at: string
          deal_type: string
          estimated_offer: number | null
          fips: string | null
          has_tax_lien: boolean | null
          id: string
          is_absentee_owner: boolean | null
          is_corporate_owned: boolean | null
          is_out_of_state: boolean | null
          is_pre_foreclosure: boolean | null
          is_tax_delinquent: boolean | null
          is_vacant: boolean | null
          lot_sqft: number | null
          market_value: number | null
          meta: Json
          motivation_score: number
          notes: string | null
          owner_email: string | null
          owner_mailing_address: string | null
          owner_name: string | null
          owner_phone: string | null
          property_type: string | null
          reapi_property_id: string | null
          skip_traced_at: string | null
          source: string
          state: string | null
          status: string
          tags: string[] | null
          tax_delinquent_year: string | null
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
          city?: string | null
          contacted_at?: string | null
          county?: string | null
          created_at?: string
          deal_type?: string
          estimated_offer?: number | null
          fips?: string | null
          has_tax_lien?: boolean | null
          id?: string
          is_absentee_owner?: boolean | null
          is_corporate_owned?: boolean | null
          is_out_of_state?: boolean | null
          is_pre_foreclosure?: boolean | null
          is_tax_delinquent?: boolean | null
          is_vacant?: boolean | null
          lot_sqft?: number | null
          market_value?: number | null
          meta?: Json
          motivation_score?: number
          notes?: string | null
          owner_email?: string | null
          owner_mailing_address?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          property_type?: string | null
          reapi_property_id?: string | null
          skip_traced_at?: string | null
          source?: string
          state?: string | null
          status?: string
          tags?: string[] | null
          tax_delinquent_year?: string | null
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
          city?: string | null
          contacted_at?: string | null
          county?: string | null
          created_at?: string
          deal_type?: string
          estimated_offer?: number | null
          fips?: string | null
          has_tax_lien?: boolean | null
          id?: string
          is_absentee_owner?: boolean | null
          is_corporate_owned?: boolean | null
          is_out_of_state?: boolean | null
          is_pre_foreclosure?: boolean | null
          is_tax_delinquent?: boolean | null
          is_vacant?: boolean | null
          lot_sqft?: number | null
          market_value?: number | null
          meta?: Json
          motivation_score?: number
          notes?: string | null
          owner_email?: string | null
          owner_mailing_address?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          property_type?: string | null
          reapi_property_id?: string | null
          skip_traced_at?: string | null
          source?: string
          state?: string | null
          status?: string
          tags?: string[] | null
          tax_delinquent_year?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
