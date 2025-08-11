export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          avatar_url: string | null
          is_admin: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          is_admin?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          is_admin?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          id: number
          user_id: string
          is_admin: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          user_id: string
          is_admin?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          is_admin?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      wardrobe_items: {
        Row: {
          id: number
          item_name: string
          item_name_en: string | null
          description: string | null
          description_en: string | null
          size_type: string | null
          material: string | null
          style: string | null
          has_print: boolean | null
          color: string | null
          shade: string | null
          has_details: boolean | null
          url: string | null
          image_url: string | null
          is_basic: boolean | null
          notes: string | null
          clothing_type: string | null
          is_hidden: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          item_name: string
          item_name_en?: string | null
          description?: string | null
          description_en?: string | null
          size_type?: string | null
          material?: string | null
          style?: string | null
          has_print?: boolean | null
          color?: string | null
          shade?: string | null
          has_details?: boolean | null
          url?: string | null
          image_url?: string | null
          is_basic?: boolean | null
          notes?: string | null
          clothing_type?: string | null
          is_hidden?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          item_name?: string
          item_name_en?: string | null
          description?: string | null
          description_en?: string | null
          size_type?: string | null
          material?: string | null
          style?: string | null
          has_print?: boolean | null
          color?: string | null
          shade?: string | null
          has_details?: boolean | null
          url?: string | null
          image_url?: string | null
          is_basic?: boolean | null
          notes?: string | null
          clothing_type?: string | null
          is_hidden?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_likes: {
        Row: {
          id: number
          user_id: string
          outfit_id: number
          created_at: string
        }
        Insert: {
          id?: number
          user_id: string
          outfit_id: number
          created_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          outfit_id?: number
          created_at?: string
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

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] & Database["public"]["Views"])
    ? (Database["public"]["Tables"] & Database["public"]["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends keyof Database["public"]["Tables"] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends keyof Database["public"]["Tables"] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends keyof Database["public"]["Enums"] | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
    ? Database["public"]["Enums"][PublicEnumNameOrOptions]
    : never
