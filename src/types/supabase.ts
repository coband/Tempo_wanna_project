export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      books: {
        Row: {
          id: string;
          created_at: string;
          title: string;
          author: string;
          isbn: string;
          subject: string;
          level: string;
          year: number;
          location: string;
          available: boolean;
          description: string | null;
          borrowed_at: string | null;
          borrowed_by: string | null;
          user_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          title: string;
          author: string;
          isbn: string;
          subject: string;
          level: string;
          year: number;
          location: string;
          available?: boolean;
          description?: string | null;
          borrowed_at?: string | null;
          borrowed_by?: string | null;
          user_id?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          title?: string;
          author?: string;
          isbn?: string;
          subject?: string;
          level?: string;
          year?: number;
          location?: string;
          available?: boolean;
          description?: string | null;
          borrowed_at?: string | null;
          borrowed_by?: string | null;
          user_id?: string | null;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
