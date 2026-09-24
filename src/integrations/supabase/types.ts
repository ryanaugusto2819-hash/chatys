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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_sessions: {
        Row: {
          actions_count: number
          first_seen: string
          id: string
          ip: string | null
          last_seen: string
          route: string | null
          session_id: string
          user_agent: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          actions_count?: number
          first_seen?: string
          id?: string
          ip?: string | null
          last_seen?: string
          route?: string | null
          session_id: string
          user_agent?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          actions_count?: number
          first_seen?: string
          id?: string
          ip?: string | null
          last_seen?: string
          route?: string | null
          session_id?: string
          user_agent?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      ads_link_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
          url_template: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
          url_template: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
          url_template?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_link_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_assignment_history: {
        Row: {
          agent_id: string
          assigned_at: string
          conversation_id: string
          id: string
          unassigned_at: string | null
        }
        Insert: {
          agent_id: string
          assigned_at?: string
          conversation_id: string
          id?: string
          unassigned_at?: string | null
        }
        Update: {
          agent_id?: string
          assigned_at?: string
          conversation_id?: string
          id?: string
          unassigned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_assignment_history_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_assignment_history_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_configs: {
        Row: {
          agent_key: string
          blocking_rules: Json
          created_at: string
          enabled: boolean
          entry_criteria: Json
          id: string
          instructions: string
          niche_id: string | null
          operation_mode: string
          priority: number
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          agent_key: string
          blocking_rules?: Json
          created_at?: string
          enabled?: boolean
          entry_criteria?: Json
          id?: string
          instructions?: string
          niche_id?: string | null
          operation_mode?: string
          priority?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          agent_key?: string
          blocking_rules?: Json
          created_at?: string
          enabled?: boolean
          entry_criteria?: Json
          id?: string
          instructions?: string
          niche_id?: string | null
          operation_mode?: string
          priority?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_configs_niche_id_fkey"
            columns: ["niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_configs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_connections: {
        Row: {
          agent_config_id: string
          connection_config_id: string
          created_at: string
          id: string
        }
        Insert: {
          agent_config_id: string
          connection_config_id: string
          created_at?: string
          id?: string
        }
        Update: {
          agent_config_id?: string
          connection_config_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_connections_agent_config_id_fkey"
            columns: ["agent_config_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_connections_connection_config_id_fkey"
            columns: ["connection_config_id"]
            isOneToOne: false
            referencedRelation: "connection_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_faqs: {
        Row: {
          agent_config_id: string
          answer: string
          created_at: string
          id: string
          question: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          agent_config_id: string
          answer: string
          created_at?: string
          id?: string
          question: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          agent_config_id?: string
          answer?: string
          created_at?: string
          id?: string
          question?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_faqs_agent_config_id_fkey"
            columns: ["agent_config_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_flows: {
        Row: {
          agent_config_id: string
          analyze_flow_content: boolean
          created_at: string
          do_not_send_when: string
          flow_id: string
          id: string
          send_when: string
          trigger_examples: string
          updated_at: string
        }
        Insert: {
          agent_config_id: string
          analyze_flow_content?: boolean
          created_at?: string
          do_not_send_when?: string
          flow_id: string
          id?: string
          send_when?: string
          trigger_examples?: string
          updated_at?: string
        }
        Update: {
          agent_config_id?: string
          analyze_flow_content?: boolean
          created_at?: string
          do_not_send_when?: string
          flow_id?: string
          id?: string
          send_when?: string
          trigger_examples?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_flows_agent_config_id_fkey"
            columns: ["agent_config_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_flows_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_configs: {
        Row: {
          auto_reply_enabled: boolean
          created_at: string
          follow_up_enabled: boolean
          id: string
          manager_enabled: boolean
          max_tokens: number
          model: string
          openai_api_key: string | null
          system_prompt: string | null
          temperature: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          auto_reply_enabled?: boolean
          created_at?: string
          follow_up_enabled?: boolean
          id?: string
          manager_enabled?: boolean
          max_tokens?: number
          model?: string
          openai_api_key?: string | null
          system_prompt?: string | null
          temperature?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          auto_reply_enabled?: boolean
          created_at?: string
          follow_up_enabled?: boolean
          id?: string
          manager_enabled?: boolean
          max_tokens?: number
          model?: string
          openai_api_key?: string | null
          system_prompt?: string | null
          temperature?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_configs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_orchestration_decisions: {
        Row: {
          action: string
          blockers: Json
          confidence: number
          context_snapshot: Json
          conversation_id: string
          created_at: string
          duration_ms: number
          execution_result: Json | null
          id: string
          input_tokens: number
          operation_mode: string
          output_tokens: number
          reason: string
          selected_agent: string
          source_message_id: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          action?: string
          blockers?: Json
          confidence?: number
          context_snapshot?: Json
          conversation_id: string
          created_at?: string
          duration_ms?: number
          execution_result?: Json | null
          id?: string
          input_tokens?: number
          operation_mode?: string
          output_tokens?: number
          reason?: string
          selected_agent: string
          source_message_id?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          action?: string
          blockers?: Json
          confidence?: number
          context_snapshot?: Json
          conversation_id?: string
          created_at?: string
          duration_ms?: number
          execution_result?: Json | null
          id?: string
          input_tokens?: number
          operation_mode?: string
          output_tokens?: number
          reason?: string
          selected_agent?: string
          source_message_id?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_orchestration_decisions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_orchestration_decisions_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_orchestration_decisions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_receipt_review_logs: {
        Row: {
          confidence: number | null
          created_at: string
          currency: string | null
          detected_amount: number | null
          final_amount: number | null
          id: string
          note: string | null
          queue_id: string
          responsible_user_id: string | null
          sale_order_id: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          currency?: string | null
          detected_amount?: number | null
          final_amount?: number | null
          id?: string
          note?: string | null
          queue_id: string
          responsible_user_id?: string | null
          sale_order_id?: string | null
          status: string
          workspace_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          currency?: string | null
          detected_amount?: number | null
          final_amount?: number | null
          id?: string
          note?: string | null
          queue_id?: string
          responsible_user_id?: string | null
          sale_order_id?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_receipt_review_logs_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "ai_training_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_receipt_review_logs_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_receipt_review_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_smart_reply_logs: {
        Row: {
          completed_at: string | null
          confidence: number | null
          consulted_source_ids: string[]
          context_snapshot: string
          conversation_id: string
          country_code: string
          created_at: string
          customer_message: string
          execution_id: string
          flow_id: string
          generated_response: string | null
          id: string
          niche_id: string | null
          node_id: string
          outcome: string
          provider_message_id: string | null
          reason: string | null
          safe_error: string | null
          used_source_ids: string[]
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          confidence?: number | null
          consulted_source_ids?: string[]
          context_snapshot?: string
          conversation_id: string
          country_code?: string
          created_at?: string
          customer_message?: string
          execution_id: string
          flow_id: string
          generated_response?: string | null
          id?: string
          niche_id?: string | null
          node_id: string
          outcome?: string
          provider_message_id?: string | null
          reason?: string | null
          safe_error?: string | null
          used_source_ids?: string[]
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          confidence?: number | null
          consulted_source_ids?: string[]
          context_snapshot?: string
          conversation_id?: string
          country_code?: string
          created_at?: string
          customer_message?: string
          execution_id?: string
          flow_id?: string
          generated_response?: string | null
          id?: string
          niche_id?: string | null
          node_id?: string
          outcome?: string
          provider_message_id?: string | null
          reason?: string | null
          safe_error?: string | null
          used_source_ids?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_smart_reply_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_smart_reply_logs_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "flow_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_smart_reply_logs_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_smart_reply_logs_niche_id_fkey"
            columns: ["niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_smart_reply_logs_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "automation_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_trained_message_rules: {
        Row: {
          action_observation: string
          action_type: string
          active: boolean
          agent_config_id: string
          context_notes: string
          country_code: string
          created_at: string
          created_by: string | null
          example_message: string
          excluded_tag_ids: string[]
          expected_action: string
          flow_id: string | null
          id: string
          niche_id: string | null
          official_response: string
          required_tag_ids: string[]
          requires_no_tags: boolean
          response_messages: Json
          source_message_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          action_observation?: string
          action_type?: string
          active?: boolean
          agent_config_id: string
          context_notes?: string
          country_code?: string
          created_at?: string
          created_by?: string | null
          example_message: string
          excluded_tag_ids?: string[]
          expected_action?: string
          flow_id?: string | null
          id?: string
          niche_id?: string | null
          official_response: string
          required_tag_ids?: string[]
          requires_no_tags?: boolean
          response_messages?: Json
          source_message_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          action_observation?: string
          action_type?: string
          active?: boolean
          agent_config_id?: string
          context_notes?: string
          country_code?: string
          created_at?: string
          created_by?: string | null
          example_message?: string
          excluded_tag_ids?: string[]
          expected_action?: string
          flow_id?: string | null
          id?: string
          niche_id?: string | null
          official_response?: string
          required_tag_ids?: string[]
          requires_no_tags?: boolean
          response_messages?: Json
          source_message_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_trained_message_rules_agent_config_id_fkey"
            columns: ["agent_config_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_trained_message_rules_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_trained_message_rules_niche_id_fkey"
            columns: ["niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_trained_message_rules_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_trained_message_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_training_queue: {
        Row: {
          agent_config_id: string
          confidence: number
          context_snapshot: Json
          conversation_id: string
          conversation_started_at: string | null
          created_at: string
          customer_message: string
          decision_feedback: string | null
          detected_country_code: string | null
          feedback_at: string | null
          feedback_by: string | null
          id: string
          match_reason: string
          matched_rule_id: string | null
          matched_rule_snapshot: Json
          message_type: string
          niche_id: string | null
          processed_at: string | null
          receipt_amount_confidence: number | null
          receipt_detected_amount: number | null
          receipt_detected_currency: string | null
          receipt_review_note: string | null
          receipt_review_status: string
          receipt_reviewed_amount: number | null
          receipt_reviewed_at: string | null
          receipt_reviewed_by: string | null
          receipt_sale_order_id: string | null
          source_message_id: string
          status: string
          suggested_action: string | null
          suggested_action_type: string | null
          suggested_flow_id: string | null
          suggested_response: string | null
          suggested_responses: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          agent_config_id: string
          confidence?: number
          context_snapshot?: Json
          conversation_id: string
          conversation_started_at?: string | null
          created_at?: string
          customer_message?: string
          decision_feedback?: string | null
          detected_country_code?: string | null
          feedback_at?: string | null
          feedback_by?: string | null
          id?: string
          match_reason?: string
          matched_rule_id?: string | null
          matched_rule_snapshot?: Json
          message_type?: string
          niche_id?: string | null
          processed_at?: string | null
          receipt_amount_confidence?: number | null
          receipt_detected_amount?: number | null
          receipt_detected_currency?: string | null
          receipt_review_note?: string | null
          receipt_review_status?: string
          receipt_reviewed_amount?: number | null
          receipt_reviewed_at?: string | null
          receipt_reviewed_by?: string | null
          receipt_sale_order_id?: string | null
          source_message_id: string
          status?: string
          suggested_action?: string | null
          suggested_action_type?: string | null
          suggested_flow_id?: string | null
          suggested_response?: string | null
          suggested_responses?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          agent_config_id?: string
          confidence?: number
          context_snapshot?: Json
          conversation_id?: string
          conversation_started_at?: string | null
          created_at?: string
          customer_message?: string
          decision_feedback?: string | null
          detected_country_code?: string | null
          feedback_at?: string | null
          feedback_by?: string | null
          id?: string
          match_reason?: string
          matched_rule_id?: string | null
          matched_rule_snapshot?: Json
          message_type?: string
          niche_id?: string | null
          processed_at?: string | null
          receipt_amount_confidence?: number | null
          receipt_detected_amount?: number | null
          receipt_detected_currency?: string | null
          receipt_review_note?: string | null
          receipt_review_status?: string
          receipt_reviewed_amount?: number | null
          receipt_reviewed_at?: string | null
          receipt_reviewed_by?: string | null
          receipt_sale_order_id?: string | null
          source_message_id?: string
          status?: string
          suggested_action?: string | null
          suggested_action_type?: string | null
          suggested_flow_id?: string | null
          suggested_response?: string | null
          suggested_responses?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_training_queue_agent_config_id_fkey"
            columns: ["agent_config_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_training_queue_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_training_queue_matched_rule_id_fkey"
            columns: ["matched_rule_id"]
            isOneToOne: false
            referencedRelation: "ai_trained_message_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_training_queue_niche_id_fkey"
            columns: ["niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_training_queue_receipt_sale_order_id_fkey"
            columns: ["receipt_sale_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_training_queue_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_training_queue_suggested_flow_id_fkey"
            columns: ["suggested_flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_training_queue_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_logs: {
        Row: {
          conversation_id: string | null
          created_at: string
          function_name: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          total_tokens: number
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          function_name: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          total_tokens?: number
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          function_name?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          total_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_edges: {
        Row: {
          created_at: string
          flow_id: string
          id: string
          source_handle: string | null
          source_node_id: string
          target_node_id: string
        }
        Insert: {
          created_at?: string
          flow_id: string
          id?: string
          source_handle?: string | null
          source_node_id: string
          target_node_id: string
        }
        Update: {
          created_at?: string
          flow_id?: string
          id?: string
          source_handle?: string | null
          source_node_id?: string
          target_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_edges_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_edges_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "automation_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_edges_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "automation_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_flows: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_pinned_sidebar: boolean
          manual_only: boolean
          name: string
          niche_id: string | null
          pinned_sectors: string[]
          trigger_count: number
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_pinned_sidebar?: boolean
          manual_only?: boolean
          name?: string
          niche_id?: string | null
          pinned_sectors?: string[]
          trigger_count?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_pinned_sidebar?: boolean
          manual_only?: boolean
          name?: string
          niche_id?: string | null
          pinned_sectors?: string[]
          trigger_count?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_flows_niche_id_fkey"
            columns: ["niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_flows_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_nodes: {
        Row: {
          config: Json
          created_at: string
          flow_id: string
          id: string
          label: string
          node_type: string
          position_x: number
          position_y: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          flow_id: string
          id?: string
          label?: string
          node_type?: string
          position_x?: number
          position_y?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          flow_id?: string
          id?: string
          label?: string
          node_type?: string
          position_x?: number
          position_y?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_nodes_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_configs: {
        Row: {
          config: Json
          connection_id: string
          created_at: string
          id: string
          is_connected: boolean
          label: string
          last_checked_at: string | null
          sector: string | null
          status: string
          status_since: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          config?: Json
          connection_id: string
          created_at?: string
          id?: string
          is_connected?: boolean
          label?: string
          last_checked_at?: string | null
          sector?: string | null
          status?: string
          status_since?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          config?: Json
          connection_id?: string
          created_at?: string
          id?: string
          is_connected?: boolean
          label?: string
          last_checked_at?: string | null
          sector?: string | null
          status?: string
          status_since?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connection_configs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          contact_phone: string
          created_at: string
          id: string
          tag_id: string
          workspace_id: string
        }
        Insert: {
          contact_phone: string
          created_at?: string
          id?: string
          tag_id: string
          workspace_id?: string
        }
        Update: {
          contact_phone?: string
          created_at?: string
          id?: string
          tag_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ad_title: string | null
          assigned_agent_id: string | null
          billing_connection_name: string | null
          billing_stage: string | null
          connection_config_id: string | null
          contact_avatar: string | null
          contact_name: string
          contact_phone: string
          created_at: string
          ctwa_clid: string | null
          funnel_stage: string
          id: string
          niche_id: string | null
          provider_chat_id: string | null
          resolved_at: string | null
          sale_registered_at: string | null
          sector: string | null
          source_id: string | null
          source_type: string | null
          status: string
          tags: string[] | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          ad_title?: string | null
          assigned_agent_id?: string | null
          billing_connection_name?: string | null
          billing_stage?: string | null
          connection_config_id?: string | null
          contact_avatar?: string | null
          contact_name: string
          contact_phone: string
          created_at?: string
          ctwa_clid?: string | null
          funnel_stage?: string
          id?: string
          niche_id?: string | null
          provider_chat_id?: string | null
          resolved_at?: string | null
          sale_registered_at?: string | null
          sector?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          ad_title?: string | null
          assigned_agent_id?: string | null
          billing_connection_name?: string | null
          billing_stage?: string | null
          connection_config_id?: string | null
          contact_avatar?: string | null
          contact_name?: string
          contact_phone?: string
          created_at?: string
          ctwa_clid?: string | null
          funnel_stage?: string
          id?: string
          niche_id?: string | null
          provider_chat_id?: string | null
          resolved_at?: string | null
          sale_registered_at?: string | null
          sector?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_connection_config_id_fkey"
            columns: ["connection_config_id"]
            isOneToOne: false
            referencedRelation: "connection_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_niche_id_fkey"
            columns: ["niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversion_events: {
        Row: {
          conversation_id: string | null
          created_at: string
          currency: string | null
          error_message: string | null
          event_id: string
          event_name: string
          id: string
          lead_id: string | null
          order_id: string | null
          payload_json: Json | null
          phone: string | null
          response_json: Json | null
          retry_count: number
          sent_at: string | null
          status: string
          updated_at: string
          value: number | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          currency?: string | null
          error_message?: string | null
          event_id: string
          event_name: string
          id?: string
          lead_id?: string | null
          order_id?: string | null
          payload_json?: Json | null
          phone?: string | null
          response_json?: Json | null
          retry_count?: number
          sent_at?: string | null
          status?: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          currency?: string | null
          error_message?: string | null
          event_id?: string
          event_name?: string
          id?: string
          lead_id?: string | null
          order_id?: string | null
          payload_json?: Json | null
          phone?: string | null
          response_json?: Json | null
          retry_count?: number
          sent_at?: string | null
          status?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "conversion_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversion_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "conversion_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversion_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      conversion_leads: {
        Row: {
          conversation_id: string
          created_at: string
          ctwa_clid: string | null
          first_message_at: string | null
          id: string
          message_id: string | null
          phone: string
          source_id: string | null
          source_type: string | null
          updated_at: string
          wa_id: string | null
          waba_id: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          ctwa_clid?: string | null
          first_message_at?: string | null
          id?: string
          message_id?: string | null
          phone: string
          source_id?: string | null
          source_type?: string | null
          updated_at?: string
          wa_id?: string | null
          waba_id?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          ctwa_clid?: string | null
          first_message_at?: string | null
          id?: string
          message_id?: string | null
          phone?: string
          source_id?: string | null
          source_type?: string | null
          updated_at?: string
          wa_id?: string | null
          waba_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversion_leads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      evolution_webhook_events: {
        Row: {
          created_at: string
          event: string | null
          id: string
          instance_name: string | null
          message_text: string | null
          push_name: string | null
          raw_payload: Json
          remote_jid: string | null
        }
        Insert: {
          created_at?: string
          event?: string | null
          id?: string
          instance_name?: string | null
          message_text?: string | null
          push_name?: string | null
          raw_payload: Json
          remote_jid?: string | null
        }
        Update: {
          created_at?: string
          event?: string | null
          id?: string
          instance_name?: string | null
          message_text?: string | null
          push_name?: string | null
          raw_payload?: Json
          remote_jid?: string | null
        }
        Relationships: []
      }
      extension_commands: {
        Row: {
          attempts: number
          command_type: string
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          delivered_at: string | null
          device_id: string
          error: string | null
          id: string
          message_id: string | null
          payload: Json
          result: Json | null
          status: string
          workspace_id: string | null
        }
        Insert: {
          attempts?: number
          command_type: string
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          delivered_at?: string | null
          device_id: string
          error?: string | null
          id?: string
          message_id?: string | null
          payload?: Json
          result?: Json | null
          status?: string
          workspace_id?: string | null
        }
        Update: {
          attempts?: number
          command_type?: string
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          delivered_at?: string | null
          device_id?: string
          error?: string | null
          id?: string
          message_id?: string | null
          payload?: Json
          result?: Json | null
          status?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extension_commands_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extension_commands_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "extension_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extension_commands_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extension_commands_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      extension_devices: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string | null
          name: string
          phone_number: string | null
          status: string
          token: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string | null
          name: string
          phone_number?: string | null
          status?: string
          token: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string | null
          name?: string
          phone_number?: string | null
          status?: string
          token?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extension_devices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_executions: {
        Row: {
          completed_at: string | null
          completed_nodes: number
          conversation_id: string
          created_at: string
          failed_at_node_id: string | null
          flow_id: string
          id: string
          response_resume_node_id: string | null
          resume_reason: string | null
          resumed_at: string | null
          started_at: string
          status: string
          timeout_resume_node_id: string | null
          total_nodes: number
          wait_timeout_at: string | null
          waiting_node_id: string | null
          waiting_since: string | null
        }
        Insert: {
          completed_at?: string | null
          completed_nodes?: number
          conversation_id: string
          created_at?: string
          failed_at_node_id?: string | null
          flow_id: string
          id?: string
          response_resume_node_id?: string | null
          resume_reason?: string | null
          resumed_at?: string | null
          started_at?: string
          status?: string
          timeout_resume_node_id?: string | null
          total_nodes?: number
          wait_timeout_at?: string | null
          waiting_node_id?: string | null
          waiting_since?: string | null
        }
        Update: {
          completed_at?: string | null
          completed_nodes?: number
          conversation_id?: string
          created_at?: string
          failed_at_node_id?: string | null
          flow_id?: string
          id?: string
          response_resume_node_id?: string | null
          resume_reason?: string | null
          resumed_at?: string | null
          started_at?: string
          status?: string
          timeout_resume_node_id?: string | null
          total_nodes?: number
          wait_timeout_at?: string | null
          waiting_node_id?: string | null
          waiting_since?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_executions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_executions_failed_at_node_id_fkey"
            columns: ["failed_at_node_id"]
            isOneToOne: false
            referencedRelation: "automation_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_executions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_executions_response_resume_node_id_fkey"
            columns: ["response_resume_node_id"]
            isOneToOne: false
            referencedRelation: "automation_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_executions_timeout_resume_node_id_fkey"
            columns: ["timeout_resume_node_id"]
            isOneToOne: false
            referencedRelation: "automation_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_executions_waiting_node_id_fkey"
            columns: ["waiting_node_id"]
            isOneToOne: false
            referencedRelation: "automation_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_step_logs: {
        Row: {
          error_message: string | null
          executed_at: string
          execution_id: string
          id: string
          node_id: string
          node_label: string
          node_type: string
          sort_order: number
          status: string
        }
        Insert: {
          error_message?: string | null
          executed_at?: string
          execution_id: string
          id?: string
          node_id: string
          node_label?: string
          node_type: string
          sort_order?: number
          status?: string
        }
        Update: {
          error_message?: string | null
          executed_at?: string
          execution_id?: string
          id?: string
          node_id?: string
          node_label?: string
          node_type?: string
          sort_order?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_step_logs_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "flow_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_step_logs_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "automation_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_executions: {
        Row: {
          attempt_number: number
          conversation_id: string
          created_at: string
          id: string
          message_sent: string | null
          responded_at: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
          template_id: string
        }
        Insert: {
          attempt_number?: number
          conversation_id: string
          created_at?: string
          id?: string
          message_sent?: string | null
          responded_at?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          template_id: string
        }
        Update: {
          attempt_number?: number
          conversation_id?: string
          created_at?: string
          id?: string
          message_sent?: string | null
          responded_at?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_executions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_executions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "follow_up_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_templates: {
        Row: {
          active_hours_end: number
          active_hours_start: number
          created_at: string
          delay_hours: number
          escalation_level: number
          funnel_stage: string
          id: string
          image_url: string | null
          is_active: boolean
          max_attempts: number
          message_template: string
          name: string
          niche_id: string | null
          objective: string
          sort_order: number
          trigger_condition: string
          updated_at: string
        }
        Insert: {
          active_hours_end?: number
          active_hours_start?: number
          created_at?: string
          delay_hours?: number
          escalation_level?: number
          funnel_stage?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          max_attempts?: number
          message_template?: string
          name?: string
          niche_id?: string | null
          objective?: string
          sort_order?: number
          trigger_condition?: string
          updated_at?: string
        }
        Update: {
          active_hours_end?: number
          active_hours_start?: number
          created_at?: string
          delay_hours?: number
          escalation_level?: number
          funnel_stage?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          max_attempts?: number
          message_template?: string
          name?: string
          niche_id?: string | null
          objective?: string
          sort_order?: number
          trigger_condition?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_templates_niche_id_fkey"
            columns: ["niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base_item_tags: {
        Row: {
          created_at: string
          id: string
          knowledge_base_item_id: string
          tag_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          knowledge_base_item_id: string
          tag_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          knowledge_base_item_id?: string
          tag_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_item_tags_knowledge_base_item_id_fkey"
            columns: ["knowledge_base_item_id"]
            isOneToOne: false
            referencedRelation: "knowledge_base_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_base_item_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_base_item_tags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base_items: {
        Row: {
          content: string
          country_code: string
          created_at: string
          file_url: string | null
          id: string
          niche_id: string | null
          title: string
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content?: string
          country_code?: string
          created_at?: string
          file_url?: string | null
          id?: string
          niche_id?: string | null
          title?: string
          type?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content?: string
          country_code?: string
          created_at?: string
          file_url?: string | null
          id?: string
          niche_id?: string | null
          title?: string
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_items_niche_id_fkey"
            columns: ["niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_analyses: {
        Row: {
          context_adherence_score: number
          conversation_id: string
          created_at: string
          flow_accuracy_score: number
          flows_analyzed: Json
          id: string
          issues: Json
          mode: string
          overall_score: number
          response_quality_score: number
          suggestions: Json
          summary: string
        }
        Insert: {
          context_adherence_score?: number
          conversation_id: string
          created_at?: string
          flow_accuracy_score?: number
          flows_analyzed?: Json
          id?: string
          issues?: Json
          mode?: string
          overall_score?: number
          response_quality_score?: number
          suggestions?: Json
          summary?: string
        }
        Update: {
          context_adherence_score?: number
          conversation_id?: string
          created_at?: string
          flow_accuracy_score?: number
          flows_analyzed?: Json
          id?: string
          issues?: Json
          mode?: string
          overall_score?: number
          response_quality_score?: number
          suggestions?: Json
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_analyses_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_config: {
        Row: {
          created_at: string
          custom_prompt: string
          evaluation_criteria: Json
          id: string
          mode: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          custom_prompt?: string
          evaluation_criteria?: Json
          id?: string
          mode?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          custom_prompt?: string
          evaluation_criteria?: Json
          id?: string
          mode?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manager_config_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          media_url: string | null
          message_type: string
          provider_error: string | null
          provider_message_id: string | null
          provider_status: string | null
          sender_agent_id: string | null
          sender_label: string | null
          sender_type: string
          status: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          media_url?: string | null
          message_type?: string
          provider_error?: string | null
          provider_message_id?: string | null
          provider_status?: string | null
          sender_agent_id?: string | null
          sender_label?: string | null
          sender_type: string
          status?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          media_url?: string | null
          message_type?: string
          provider_error?: string | null
          provider_message_id?: string | null
          provider_status?: string | null
          sender_agent_id?: string | null
          sender_label?: string | null
          sender_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_agent_id_fkey"
            columns: ["sender_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_capi_config: {
        Row: {
          access_token: string
          api_version: string
          created_at: string
          graph_base_url: string
          id: string
          is_active: boolean
          pixel_id: string
          updated_at: string
        }
        Insert: {
          access_token?: string
          api_version?: string
          created_at?: string
          graph_base_url?: string
          id?: string
          is_active?: boolean
          pixel_id?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          api_version?: string
          created_at?: string
          graph_base_url?: string
          id?: string
          is_active?: boolean
          pixel_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      meta_capi_events: {
        Row: {
          conversation_id: string | null
          created_at: string
          ctwa_clid: string | null
          currency: string | null
          error: string | null
          event_id: string
          event_name: string
          event_time: string
          id: string
          pixel_id: string
          pixel_id_ref: string | null
          request_payload: Json | null
          response_body: string | null
          response_status: number | null
          success: boolean
          value: number | null
          workspace_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          ctwa_clid?: string | null
          currency?: string | null
          error?: string | null
          event_id: string
          event_name: string
          event_time?: string
          id?: string
          pixel_id: string
          pixel_id_ref?: string | null
          request_payload?: Json | null
          response_body?: string | null
          response_status?: number | null
          success?: boolean
          value?: number | null
          workspace_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          ctwa_clid?: string | null
          currency?: string | null
          error?: string | null
          event_id?: string
          event_name?: string
          event_time?: string
          id?: string
          pixel_id?: string
          pixel_id_ref?: string | null
          request_payload?: Json | null
          response_body?: string | null
          response_status?: number | null
          success?: boolean
          value?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_capi_events_pixel_id_ref_fkey"
            columns: ["pixel_id_ref"]
            isOneToOne: false
            referencedRelation: "meta_capi_pixels"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_capi_pixels: {
        Row: {
          access_token: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          page_id: string | null
          pixel_id: string
          test_event_code: string | null
          updated_at: string
          whatsapp_business_account_id: string | null
          workspace_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          page_id?: string | null
          pixel_id: string
          test_event_code?: string | null
          updated_at?: string
          whatsapp_business_account_id?: string | null
          workspace_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          page_id?: string | null
          pixel_id?: string
          test_event_code?: string | null
          updated_at?: string
          whatsapp_business_account_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_capi_pixels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_connections: {
        Row: {
          access_token: string
          business_id: string | null
          connected_phone: string | null
          connection_config_id: string | null
          created_at: string
          expires_in: number | null
          id: string
          phone_number_id: string
          quality_rating: string | null
          raw_debug_info: Json | null
          status: string
          token_type: string | null
          updated_at: string
          user_id: string
          verified_name: string | null
          waba_id: string
          webhook_status: string
          workspace_id: string
        }
        Insert: {
          access_token: string
          business_id?: string | null
          connected_phone?: string | null
          connection_config_id?: string | null
          created_at?: string
          expires_in?: number | null
          id?: string
          phone_number_id: string
          quality_rating?: string | null
          raw_debug_info?: Json | null
          status?: string
          token_type?: string | null
          updated_at?: string
          user_id: string
          verified_name?: string | null
          waba_id: string
          webhook_status?: string
          workspace_id: string
        }
        Update: {
          access_token?: string
          business_id?: string | null
          connected_phone?: string | null
          connection_config_id?: string | null
          created_at?: string
          expires_in?: number | null
          id?: string
          phone_number_id?: string
          quality_rating?: string | null
          raw_debug_info?: Json | null
          status?: string
          token_type?: string | null
          updated_at?: string
          user_id?: string
          verified_name?: string | null
          waba_id?: string
          webhook_status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_connections_connection_config_id_fkey"
            columns: ["connection_config_id"]
            isOneToOne: false
            referencedRelation: "connection_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      niche_connections: {
        Row: {
          connection_config_id: string
          created_at: string
          id: string
          niche_id: string
        }
        Insert: {
          connection_config_id: string
          created_at?: string
          id?: string
          niche_id: string
        }
        Update: {
          connection_config_id?: string
          created_at?: string
          id?: string
          niche_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "niche_connections_connection_config_id_fkey"
            columns: ["connection_config_id"]
            isOneToOne: false
            referencedRelation: "connection_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "niche_connections_niche_id_fkey"
            columns: ["niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
        ]
      }
      niche_funnel_stages: {
        Row: {
          created_at: string
          description: string
          id: string
          label: string
          niche_id: string
          sort_order: number
          stage_key: string
          strategy: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          label: string
          niche_id: string
          sort_order?: number
          stage_key: string
          strategy?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          label?: string
          niche_id?: string
          sort_order?: number
          stage_key?: string
          strategy?: string
        }
        Relationships: [
          {
            foreignKeyName: "niche_funnel_stages_niche_id_fkey"
            columns: ["niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
        ]
      }
      niches: {
        Row: {
          auto_reply_enabled: boolean
          created_at: string
          flow_selector_enabled: boolean
          flow_selector_instructions: string
          id: string
          language: string
          name: string
          system_prompt: string
          updated_at: string
          whatsapp_phone_number_id: string | null
          workspace_id: string | null
          zapi_instance_id: string | null
        }
        Insert: {
          auto_reply_enabled?: boolean
          created_at?: string
          flow_selector_enabled?: boolean
          flow_selector_instructions?: string
          id?: string
          language?: string
          name: string
          system_prompt?: string
          updated_at?: string
          whatsapp_phone_number_id?: string | null
          workspace_id?: string | null
          zapi_instance_id?: string | null
        }
        Update: {
          auto_reply_enabled?: boolean
          created_at?: string
          flow_selector_enabled?: boolean
          flow_selector_instructions?: string
          id?: string
          language?: string
          name?: string
          system_prompt?: string
          updated_at?: string
          whatsapp_phone_number_id?: string | null
          workspace_id?: string | null
          zapi_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "niches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          conversation_id: string
          created_at: string
          currency: string
          customer_phone: string
          id: string
          paid_at: string | null
          status: string
          updated_at: string
          value: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          currency?: string
          customer_phone: string
          id?: string
          paid_at?: string | null
          status?: string
          updated_at?: string
          value?: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          currency?: string
          customer_phone?: string
          id?: string
          paid_at?: string | null
          status?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      oxxo_charges: {
        Row: {
          amount: number
          barcode_url: string | null
          confirmed_at: string | null
          conversation_id: string
          created_at: string
          created_by: string | null
          currency: string
          error_code: string | null
          error_message: string | null
          external_id: string
          fee: number | null
          id: string
          payer_email: string | null
          payer_name: string | null
          provider: string
          provider_response: Json | null
          reference: string | null
          request_number: string | null
          status: string
          transaction_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount: number
          barcode_url?: string | null
          confirmed_at?: string | null
          conversation_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          error_code?: string | null
          error_message?: string | null
          external_id: string
          fee?: number | null
          id?: string
          payer_email?: string | null
          payer_name?: string | null
          provider?: string
          provider_response?: Json | null
          reference?: string | null
          request_number?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          barcode_url?: string | null
          confirmed_at?: string | null
          conversation_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          error_code?: string | null
          error_message?: string | null
          external_id?: string
          fee?: number | null
          id?: string
          payer_email?: string | null
          payer_name?: string | null
          provider?: string
          provider_response?: Json | null
          reference?: string | null
          request_number?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oxxo_charges_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oxxo_charges_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_ai_replies: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          processed_at: string | null
          scheduled_for: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          processed_at?: string | null
          scheduled_for: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          processed_at?: string | null
          scheduled_for?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_ai_replies_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          allow_advanced_reports: boolean
          allow_ai_auto_reply: boolean
          allow_ai_manager: boolean
          created_at: string
          id: string
          is_active: boolean
          max_connections: number
          max_flows: number
          max_members: number
          name: string
          price_monthly: number
          slug: string
        }
        Insert: {
          allow_advanced_reports?: boolean
          allow_ai_auto_reply?: boolean
          allow_ai_manager?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          max_connections?: number
          max_flows?: number
          max_members?: number
          name: string
          price_monthly?: number
          slug: string
        }
        Update: {
          allow_advanced_reports?: boolean
          allow_ai_auto_reply?: boolean
          allow_ai_manager?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          max_connections?: number
          max_flows?: number
          max_members?: number
          name?: string
          price_monthly?: number
          slug?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          is_approved: boolean
          is_platform_admin: boolean
          job_title: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_approved?: boolean
          is_platform_admin?: boolean
          job_title?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_approved?: boolean
          is_platform_admin?: boolean
          job_title?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quick_messages: {
        Row: {
          add_tag_id: string | null
          audio_url: string | null
          category: string | null
          content: string
          created_at: string
          id: string
          is_pinned_sidebar: boolean
          remove_tag_id: string | null
          shortcut: string | null
          sort_order: number
          tag_id: string | null
          title: string
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          add_tag_id?: string | null
          audio_url?: string | null
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          is_pinned_sidebar?: boolean
          remove_tag_id?: string | null
          shortcut?: string | null
          sort_order?: number
          tag_id?: string | null
          title: string
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          add_tag_id?: string | null
          audio_url?: string | null
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          is_pinned_sidebar?: boolean
          remove_tag_id?: string | null
          shortcut?: string | null
          sort_order?: number
          tag_id?: string | null
          title?: string
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_messages_add_tag_id_fkey"
            columns: ["add_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_messages_remove_tag_id_fkey"
            columns: ["remove_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_messages_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          campanha: string | null
          conversation_id: string | null
          created_at: string | null
          external_id: string | null
          id: string
          moeda: string
          nome: string | null
          pais: string
          produto: string | null
          quantidade: number | null
          upsell_sent: boolean
          upsell_sent_at: string | null
          valor: number | null
          vendedor: string
          workspace_id: string | null
        }
        Insert: {
          campanha?: string | null
          conversation_id?: string | null
          created_at?: string | null
          external_id?: string | null
          id?: string
          moeda?: string
          nome?: string | null
          pais?: string
          produto?: string | null
          quantidade?: number | null
          upsell_sent?: boolean
          upsell_sent_at?: string | null
          valor?: number | null
          vendedor?: string
          workspace_id?: string | null
        }
        Update: {
          campanha?: string | null
          conversation_id?: string | null
          created_at?: string | null
          external_id?: string | null
          id?: string
          moeda?: string
          nome?: string | null
          pais?: string
          produto?: string | null
          quantidade?: number | null
          upsell_sent?: boolean
          upsell_sent_at?: string | null
          valor?: number | null
          vendedor?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          is_hidden: boolean
          name: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          name: string
          workspace_id?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          name?: string
          workspace_id?: string
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
      warmup_logs: {
        Row: {
          connection_config_id: string | null
          contact_name: string | null
          contact_phone: string | null
          content: string | null
          conversation_id: string | null
          created_at: string
          direction: string
          error: string | null
          id: string
          status: string
          warmup_id: string
          workspace_id: string
        }
        Insert: {
          connection_config_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          status?: string
          warmup_id: string
          workspace_id: string
        }
        Update: {
          connection_config_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          status?: string
          warmup_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_logs_warmup_id_fkey"
            columns: ["warmup_id"]
            isOneToOne: false
            referencedRelation: "warmup_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_profiles: {
        Row: {
          active_hours_end: number
          active_hours_start: number
          base_daily_target: number
          behavior_style: string
          connection_config_id: string
          created_at: string
          created_by: string | null
          emoji_usage: string
          extra_instructions: string
          growth_rate: number
          id: string
          is_active: boolean
          language: string
          last_activity_at: string | null
          max_daily: number
          max_delay_seconds: number
          messages_received: number
          messages_sent: number
          min_delay_seconds: number
          paused_at: string | null
          persona_prompt: string
          reply_length: string
          started_at: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          active_hours_end?: number
          active_hours_start?: number
          base_daily_target?: number
          behavior_style?: string
          connection_config_id: string
          created_at?: string
          created_by?: string | null
          emoji_usage?: string
          extra_instructions?: string
          growth_rate?: number
          id?: string
          is_active?: boolean
          language?: string
          last_activity_at?: string | null
          max_daily?: number
          max_delay_seconds?: number
          messages_received?: number
          messages_sent?: number
          min_delay_seconds?: number
          paused_at?: string | null
          persona_prompt?: string
          reply_length?: string
          started_at?: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          active_hours_end?: number
          active_hours_start?: number
          base_daily_target?: number
          behavior_style?: string
          connection_config_id?: string
          created_at?: string
          created_by?: string | null
          emoji_usage?: string
          extra_instructions?: string
          growth_rate?: number
          id?: string
          is_active?: boolean
          language?: string
          last_activity_at?: string | null
          max_daily?: number
          max_delay_seconds?: number
          messages_received?: number
          messages_sent?: number
          min_delay_seconds?: number
          paused_at?: string | null
          persona_prompt?: string
          reply_length?: string
          started_at?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_profiles_connection_config_id_fkey"
            columns: ["connection_config_id"]
            isOneToOne: true
            referencedRelation: "connection_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_flow_mappings: {
        Row: {
          created_at: string
          flow_id: string | null
          id: string
          is_active: boolean
          label: string
          status_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          flow_id?: string | null
          id?: string
          is_active?: boolean
          label?: string
          status_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          flow_id?: string | null
          id?: string
          is_active?: boolean
          label?: string
          status_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_flow_mappings_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          contact_name: string | null
          conversation_id: string | null
          created_at: string
          error: string | null
          flow_id: string | null
          id: string
          mapping_found: boolean
          payload: Json
          phone: string
          result: Json | null
          status_key: string
          success: boolean
        }
        Insert: {
          contact_name?: string | null
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          flow_id?: string | null
          id?: string
          mapping_found?: boolean
          payload?: Json
          phone?: string
          result?: Json | null
          status_key?: string
          success?: boolean
        }
        Update: {
          contact_name?: string | null
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          flow_id?: string | null
          id?: string
          mapping_found?: boolean
          payload?: Json
          phone?: string
          result?: Json | null
          status_key?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_logs_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          created_at: string
          event: string | null
          from_me: boolean | null
          id: string
          instance_name: string | null
          message_text: string | null
          push_name: string | null
          raw_payload: Json
          remote_jid: string | null
        }
        Insert: {
          created_at?: string
          event?: string | null
          from_me?: boolean | null
          id?: string
          instance_name?: string | null
          message_text?: string | null
          push_name?: string | null
          raw_payload: Json
          remote_jid?: string | null
        }
        Update: {
          created_at?: string
          event?: string | null
          from_me?: boolean | null
          id?: string
          instance_name?: string | null
          message_text?: string | null
          push_name?: string | null
          raw_payload?: Json
          remote_jid?: string | null
        }
        Relationships: []
      }
      workspace_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: string
          token: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: string
          token?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: string
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_settings: {
        Row: {
          ads_order_webhook_url: string | null
          business_days: number[] | null
          business_hours_end: string | null
          business_hours_start: string | null
          created_at: string
          id: string
          language: string
          notification_email: string | null
          timezone: string
          updated_at: string
          webhook_url: string | null
          workspace_id: string
        }
        Insert: {
          ads_order_webhook_url?: string | null
          business_days?: number[] | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          created_at?: string
          id?: string
          language?: string
          notification_email?: string | null
          timezone?: string
          updated_at?: string
          webhook_url?: string | null
          workspace_id: string
        }
        Update: {
          ads_order_webhook_url?: string | null
          business_days?: number[] | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          created_at?: string
          id?: string
          language?: string
          notification_email?: string | null
          timezone?: string
          updated_at?: string
          webhook_url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string
          id: string
          plan_id: string
          status: string
          trial_ends_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          id?: string
          plan_id: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          id?: string
          plan_id?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          country: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          plan_id: string | null
          slug: string | null
          status: string
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          plan_id?: string | null
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          plan_id?: string | null
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_workspace_plan"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_workspace_invite: {
        Args: { p_token: string; p_user_id: string }
        Returns: Json
      }
      add_user_to_workspace: {
        Args: { p_role?: string; p_user_id: string; p_workspace_id: string }
        Returns: undefined
      }
      admin_list_workspaces: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          country: string
          created_at: string
          id: string
          member_count: number
          name: string
          owner_email: string
          plan_name: string
          slug: string
          status: string
        }[]
      }
      check_workspace_limit: {
        Args: { p_resource: string; p_workspace_id: string }
        Returns: Json
      }
      claim_waiting_flow: {
        Args: {
          p_conversation_id: string
          p_execution_id?: string
          p_reason: string
        }
        Returns: {
          conversation_id: string
          execution_id: string
          flow_id: string
          resume_node_id: string
        }[]
      }
      create_workspace_for_user: {
        Args: {
          p_country?: string
          p_name: string
          p_slug?: string
          p_user_id: string
        }
        Returns: string
      }
      delete_connection_conversations_batch: {
        Args: { p_connection_id: string; p_limit?: number }
        Returns: number
      }
      find_latest_conversation_by_phone: {
        Args: { p_phone: string }
        Returns: {
          contact_name: string
          contact_phone: string
          id: string
          workspace_id: string
        }[]
      }
      get_conversations_with_last_message: {
        Args: never
        Returns: {
          assigned_agent_id: string
          connection_config_id: string
          contact_name: string
          contact_phone: string
          id: string
          last_message: string
          last_message_sender: string
          niche_id: string
          status: string
          tags: string[]
          unread_count: number
          updated_at: string
        }[]
      }
      get_current_user_meta: {
        Args: never
        Returns: {
          is_approved: boolean
          is_platform_admin: boolean
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      get_inbox_page: {
        Args: {
          p_agent_id?: string
          p_connection_ids?: string[]
          p_last_customer?: boolean
          p_limit?: number
          p_offset?: number
          p_only_unread?: boolean
          p_search?: string
          p_sector?: string
          p_status?: string
          p_tag_id?: string
          p_workspace_id?: string
        }
        Returns: {
          assigned_agent_id: string
          connection_config_id: string
          contact_name: string
          contact_phone: string
          contact_tags: Json
          id: string
          last_message: string
          last_message_sender: string
          niche_id: string
          sector: string
          status: string
          tags: string[]
          total_count: number
          unread_count: number
          updated_at: string
        }[]
      }
      get_invite_by_token: {
        Args: { p_token: string }
        Returns: {
          accepted_at: string
          email: string
          expires_at: string
          id: string
          role: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      get_messages_by_connection: {
        Args: { p_from: string; p_to: string }
        Returns: {
          connection_config_id: string
          incoming: number
          outgoing: number
          total: number
        }[]
      }
      get_unread_conversations_count: {
        Args: { p_workspace_id?: string }
        Returns: number
      }
      get_user_workspaces: {
        Args: never
        Returns: {
          country: string
          id: string
          is_active: boolean
          logo_url: string
          name: string
          plan_name: string
          plan_slug: string
          role: string
          slug: string
          status: string
        }[]
      }
      get_warmup_overview: {
        Args: { p_workspace_id: string }
        Returns: {
          active_hours_end: number
          active_hours_start: number
          base_daily_target: number
          connection_config_id: string
          connection_label: string
          connection_status: string
          daily_target: number
          days_in_warmup: number
          growth_rate: number
          id: string
          is_active: boolean
          last_activity_at: string
          max_daily: number
          messages_received: number
          messages_sent: number
          sent_today: number
          started_at: string
          status: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_workspace_admin: { Args: { _workspace_id: string }; Returns: boolean }
      is_workspace_member: { Args: { _workspace_id: string }; Returns: boolean }
      review_ai_payment_receipt: {
        Args: {
          p_action: string
          p_amount?: number
          p_currency?: string
          p_queue_id: string
        }
        Returns: Json
      }
      save_automation_flow_atomic: {
        Args: {
          p_description: string
          p_edges: Json
          p_flow_id: string
          p_manual_only: boolean
          p_name: string
          p_niche_id: string
          p_nodes: Json
        }
        Returns: Json
      }
      shares_workspace_with: {
        Args: { _a: string; _b: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "agent"
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
      app_role: ["admin", "supervisor", "agent"],
    },
  },
} as const
