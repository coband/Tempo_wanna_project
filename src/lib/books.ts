import type { Database } from "@/types/supabase";
import { useAuth } from "@/hooks/useAuth";

// Verwendung der generierten Typen
export type Book = Database["public"]["Tables"]["books"]["Row"];
export type NewBook = Database["public"]["Tables"]["books"]["Insert"];
export type BookUpdate = Database["public"]["Tables"]["books"]["Update"];

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
