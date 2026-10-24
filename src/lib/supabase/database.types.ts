// Mirrors supabase/migrations/0001_init.sql, in the shape `supabase gen types` emits.
// Regenerate with `npx supabase gen types typescript` if the schema changes.

export type ContactState =
  | "collecting"
  | "registered"
  | "awaiting_report_date"
  | "opted_out";

export type ChurchStatus = "pending_review" | "approved";

export type Database = {
  public: {
    Tables: {
      churches: {
        Row: {
          id: string;
          name: string;
          city: string | null;
          country: string | null;
          status: ChurchStatus;
          created_at: string;
          approved_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          city?: string | null;
          country?: string | null;
          status?: ChurchStatus;
          created_at?: string;
          approved_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["churches"]["Insert"]>;
        Relationships: [];
      };
      contacts: {
        Row: {
          wa_id: string;
          name: string | null;
          role: string | null;
          email: string | null;
          church_name: string | null;
          city: string | null;
          country: string | null;
          language: string | null;
          consent_at: string | null;
          opted_out_at: string | null;
          state: ContactState;
          pending_count: number | null;
          church_id: string | null;
          created_at: string;
        };
        Insert: {
          wa_id: string;
          name?: string | null;
          role?: string | null;
          email?: string | null;
          church_name?: string | null;
          city?: string | null;
          country?: string | null;
          language?: string | null;
          consent_at?: string | null;
          opted_out_at?: string | null;
          state?: ContactState;
          pending_count?: number | null;
          church_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["contacts"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "contacts_church_id_fkey";
            columns: ["church_id"];
            isOneToOne: false;
            referencedRelation: "churches";
            referencedColumns: ["id"];
          },
        ];
      };
      baptism_reports: {
        Row: {
          id: string;
          church_id: string;
          wa_id: string;
          count: number;
          baptism_date: string;
          raw_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          church_id: string;
          wa_id: string;
          count: number;
          baptism_date: string;
          raw_message?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["baptism_reports"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "baptism_reports_church_id_fkey";
            columns: ["church_id"];
            isOneToOne: false;
            referencedRelation: "churches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "baptism_reports_wa_id_fkey";
            columns: ["wa_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["wa_id"];
          },
        ];
      };
      messages: {
        Row: {
          id: string;
          wa_message_id: string | null;
          wa_id: string;
          direction: "in" | "out";
          body: string | null;
          language: string | null;
          translated_by_ai: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          wa_message_id?: string | null;
          wa_id: string;
          direction: "in" | "out";
          body?: string | null;
          language?: string | null;
          translated_by_ai?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      dashboard_totals: {
        Row: {
          total_baptisms: number;
          church_count: number;
        };
        Relationships: [];
      };
    };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type Tables = Database["public"]["Tables"];

export type Church = Tables["churches"]["Row"];
export type Contact = Tables["contacts"]["Row"];
export type ContactUpdate = Tables["contacts"]["Update"];
export type BaptismReport = Tables["baptism_reports"]["Row"];
