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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      charge_sessions: {
        Row: {
          actual_cost_gbp: number | null
          actual_energy_kwh: number | null
          actual_finish: string | null
          actual_start: string | null
          avg_pence_per_kwh: number
          charge_mode: string
          charging_efficiency_pct: number | null
          charging_location: string | null
          confidence_score: number | null
          configured_charger_kw: number | null
          created_at: string
          end_soc: number
          end_time: string | null
          energy_added_kwh: number
          grid_kwh: number
          history: Json
          id: string
          local_id: string
          notes: string
          num_slots: number
          observed_charger_kw: number | null
          outside_temp_c: number | null
          planned_cost_gbp: number | null
          planned_finish: string | null
          planned_start: string | null
          predicted_energy_kwh: number | null
          raw_observations: Json
          region: string | null
          session_date: string
          slot_prices: Json
          source_device: string | null
          start_soc: number
          start_time: string | null
          target_time: string | null
          tariff_code: string
          total_cost_gbp: number
          updated_at: string
          user_id: string
          vehicle_id: string | null
          vehicle_name: string
          vehicle_registration: string | null
        }
        Insert: {
          actual_cost_gbp?: number | null
          actual_energy_kwh?: number | null
          actual_finish?: string | null
          actual_start?: string | null
          avg_pence_per_kwh?: number
          charge_mode?: string
          charging_efficiency_pct?: number | null
          charging_location?: string | null
          confidence_score?: number | null
          configured_charger_kw?: number | null
          created_at?: string
          end_soc?: number
          end_time?: string | null
          energy_added_kwh?: number
          grid_kwh?: number
          history?: Json
          id?: string
          local_id: string
          notes?: string
          num_slots?: number
          observed_charger_kw?: number | null
          outside_temp_c?: number | null
          planned_cost_gbp?: number | null
          planned_finish?: string | null
          planned_start?: string | null
          predicted_energy_kwh?: number | null
          raw_observations?: Json
          region?: string | null
          session_date: string
          slot_prices?: Json
          source_device?: string | null
          start_soc?: number
          start_time?: string | null
          target_time?: string | null
          tariff_code?: string
          total_cost_gbp?: number
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
          vehicle_name?: string
          vehicle_registration?: string | null
        }
        Update: {
          actual_cost_gbp?: number | null
          actual_energy_kwh?: number | null
          actual_finish?: string | null
          actual_start?: string | null
          avg_pence_per_kwh?: number
          charge_mode?: string
          charging_efficiency_pct?: number | null
          charging_location?: string | null
          confidence_score?: number | null
          configured_charger_kw?: number | null
          created_at?: string
          end_soc?: number
          end_time?: string | null
          energy_added_kwh?: number
          grid_kwh?: number
          history?: Json
          id?: string
          local_id?: string
          notes?: string
          num_slots?: number
          observed_charger_kw?: number | null
          outside_temp_c?: number | null
          planned_cost_gbp?: number | null
          planned_finish?: string | null
          planned_start?: string | null
          predicted_energy_kwh?: number | null
          raw_observations?: Json
          region?: string | null
          session_date?: string
          slot_prices?: Json
          source_device?: string | null
          start_soc?: number
          start_time?: string | null
          target_time?: string | null
          tariff_code?: string
          total_cost_gbp?: number
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
          vehicle_name?: string
          vehicle_registration?: string | null
        }
        Relationships: []
      }
      tesla_connections: {
        Row: {
          access_token: string
          created_at: string
          device_id: string
          expires_at: string
          last_poll_at: string | null
          last_wake_at: string | null
          refresh_token: string
          region: string
          updated_at: string
          user_id: string | null
          vehicles: Json
        }
        Insert: {
          access_token: string
          created_at?: string
          device_id: string
          expires_at: string
          last_poll_at?: string | null
          last_wake_at?: string | null
          refresh_token: string
          region?: string
          updated_at?: string
          user_id?: string | null
          vehicles?: Json
        }
        Update: {
          access_token?: string
          created_at?: string
          device_id?: string
          expires_at?: string
          last_poll_at?: string | null
          last_wake_at?: string | null
          refresh_token?: string
          region?: string
          updated_at?: string
          user_id?: string | null
          vehicles?: Json
        }
        Relationships: []
      }
      tesla_oauth_states: {
        Row: {
          code_verifier: string
          created_at: string
          device_id: string
          expires_at: string
          return_url: string
          state: string
          user_id: string | null
        }
        Insert: {
          code_verifier: string
          created_at?: string
          device_id: string
          expires_at?: string
          return_url: string
          state: string
          user_id?: string | null
        }
        Update: {
          code_verifier?: string
          created_at?: string
          device_id?: string
          expires_at?: string
          return_url?: string
          state?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          charger_amps: number
          charger_kw: number
          charging_location: string
          created_at: string
          diesel_mpg: number
          diesel_price_ppl: number
          notify_charge_complete: boolean
          notify_cheap_slots: boolean
          notify_price_alerts: boolean
          petrol_mpg: number
          petrol_price_ppl: number
          region: string
          tariff: string
          updated_at: string
          user_id: string
          work_rate_pence_per_mile: number
        }
        Insert: {
          charger_amps?: number
          charger_kw?: number
          charging_location?: string
          created_at?: string
          diesel_mpg?: number
          diesel_price_ppl?: number
          notify_charge_complete?: boolean
          notify_cheap_slots?: boolean
          notify_price_alerts?: boolean
          petrol_mpg?: number
          petrol_price_ppl?: number
          region?: string
          tariff?: string
          updated_at?: string
          user_id: string
          work_rate_pence_per_mile?: number
        }
        Update: {
          charger_amps?: number
          charger_kw?: number
          charging_location?: string
          created_at?: string
          diesel_mpg?: number
          diesel_price_ppl?: number
          notify_charge_complete?: boolean
          notify_cheap_slots?: boolean
          notify_price_alerts?: boolean
          petrol_mpg?: number
          petrol_price_ppl?: number
          region?: string
          tariff?: string
          updated_at?: string
          user_id?: string
          work_rate_pence_per_mile?: number
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          battery_kwh: number | null
          car_type: string | null
          charge_efficiency_pct: number
          color: string | null
          created_at: string
          id: string
          is_default: boolean
          make: string | null
          miles_per_kwh: number | null
          model: string | null
          name: string
          notes: string | null
          registration: string | null
          source: string
          tesla_vehicle_id: string | null
          user_id: string | null
          vin: string | null
        }
        Insert: {
          battery_kwh?: number | null
          car_type?: string | null
          charge_efficiency_pct?: number
          color?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          make?: string | null
          miles_per_kwh?: number | null
          model?: string | null
          name: string
          notes?: string | null
          registration?: string | null
          source?: string
          tesla_vehicle_id?: string | null
          user_id?: string | null
          vin?: string | null
        }
        Update: {
          battery_kwh?: number | null
          car_type?: string | null
          charge_efficiency_pct?: number
          color?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          make?: string | null
          miles_per_kwh?: number | null
          model?: string | null
          name?: string
          notes?: string | null
          registration?: string | null
          source?: string
          tesla_vehicle_id?: string | null
          user_id?: string | null
          vin?: string | null
        }
        Relationships: []
      }
      work_trips: {
        Row: {
          charge_session_ids: Json
          created_at: string
          description: string
          extra_charges: Json
          id: string
          local_id: string
          miles: number
          rate_pence_per_mile: number
          source_device: string | null
          trip_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          charge_session_ids?: Json
          created_at?: string
          description?: string
          extra_charges?: Json
          id?: string
          local_id: string
          miles?: number
          rate_pence_per_mile?: number
          source_device?: string | null
          trip_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          charge_session_ids?: Json
          created_at?: string
          description?: string
          extra_charges?: Json
          id?: string
          local_id?: string
          miles?: number
          rate_pence_per_mile?: number
          source_device?: string | null
          trip_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
