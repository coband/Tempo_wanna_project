import type { Database } from "@/types/supabase";
import { useAuth } from "@/hooks/useAuth";

export interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string;
  level: string;
  subject: string;
  year: number;
  description: string;
  location: string;
  user_id: string;
  created_at: string;
  available: boolean;
  borrowed_at: string | null;
  borrowed_by: string | null;
  school: string;
  type: string;
  publisher: string;
  embedding: any | null;
  vector_source: string | null;
  has_pdf: boolean;
}

export type NewBook = Database["public"]["Tables"]["books"]["Insert"];
export type BookUpdate = Partial<Book>;

/**
 * Holt ein einzelnes Buch aus der Datenbank
 * @param id Die ID des Buchs
 * @param supabaseClient Der authentifizierte Supabase-Client aus useSupabase()
 */
export async function getBookById(id: string, supabaseClient: any) {
  if (!supabaseClient) {
    throw new Error("Diese Funktion benötigt einen authentifizierten Supabase-Client. Verwende useSupabase() in deiner Komponente.");
  }

  const { data, error } = await supabaseClient
    .from("books")
    .select()
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching book:", error);
    throw error;
  }

  return data;
}

// Remove the subscribeToBooks function as we're handling it directly in BookManagement
