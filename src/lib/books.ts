import { supabase } from "@/hooks/useSupabaseAuth";
import type { Database } from "@/types/supabase";
import { useAuth } from "@/lib/auth";

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
 * VERALTET: Holt alle Bücher aus der Datenbank
 * 
 * @deprecated Diese Funktion verwendet den anonymen Client und wird 
 * wahrscheinlich für authentifizierte Endpunkte mit 403 Forbidden fehlschlagen.
 * Verwende stattdessen authClient.from('books').select() direkt in den Komponenten.
 */
export async function getBooks() {
  console.warn("getBooks() ist veraltet - verwende den authClient direkt");
  console.log("Fetching books...");
  const { data, error } = await supabase
    .from("books")
    .select()
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching books:", error);
    throw error;
  }

  console.log("Fetched books successfully:", data);
  return data;
}

/**
 * VERALTET: Erstellt ein neues Buch in der Datenbank
 * 
 * @deprecated Diese Funktion verwendet den anonymen Client und wird 
 * wahrscheinlich für authentifizierte Endpunkte mit 403 Forbidden fehlschlagen.
 * Verwende stattdessen authClient.from('books').insert() direkt in den Komponenten.
 */
export async function createBook(book: Omit<Book, "id">) {
  console.warn("createBook() ist veraltet - verwende den authClient direkt");
  // Buch in die Datenbank einfügen
  const { data, error } = await supabase.from("books").insert(book).select();

  if (error) throw error;

  if (data && data.length > 0) {
    // Wenn wir hier ein Embedding erstellen sollen
    console.log("Buch erstellt:", data[0]);
    return data[0];
  }

  return null;
}

/**
 * VERALTET: Aktualisiert ein Buch in der Datenbank
 * 
 * @deprecated Diese Funktion verwendet den anonymen Client und wird 
 * wahrscheinlich für authentifizierte Endpunkte mit 403 Forbidden fehlschlagen.
 * Verwende stattdessen authClient.from('books').update() direkt in den Komponenten.
 */
export async function updateBook(id: string, updates: Partial<Book>) {
  console.warn("updateBook() ist veraltet - verwende den authClient direkt");
  const { data, error } = await supabase
    .from("books")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * VERALTET: Löscht ein Buch aus der Datenbank
 * 
 * @deprecated Diese Funktion verwendet den anonymen Client und wird 
 * wahrscheinlich für authentifizierte Endpunkte mit 403 Forbidden fehlschlagen.
 * Verwende stattdessen authClient.from('books').delete() direkt in den Komponenten.
 */
export async function deleteBook(id: string) {
  console.warn("deleteBook() ist veraltet - verwende den authClient direkt");
  const { error } = await supabase.from("books").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Holt ein einzelnes Buch aus der Datenbank
 * @param id Die ID des Buchs
 */
export async function getBookById(id: string) {
  const { data, error } = await supabase
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

/**
 * Sucht Bücher in der Datenbank anhand eines Suchbegriffs
 * Achtung: Dies funktioniert nur, wenn die Volltextsuche eingerichtet ist
 */
export async function searchBooks(searchTerm: string, limit = 50) {
  console.warn("searchBooks() ist veraltet - verwende den authClient direkt");
  
  // Prüfen, ob es sich um eine ISBN handelt (nur Zahlen und Bindestriche)
  const isISBN = /^[0-9\-]+$/.test(searchTerm);

  if (isISBN) {
    // Bei ISBN direkter Vergleich
    const { data, error } = await supabase
      .from("books")
      .select()
      .ilike("isbn", `%${searchTerm}%`)
      .limit(limit);

    if (error) throw error;
    return data;
  }

  // Bei anderen Suchbegriffen Volltextsuche oder Suche in relevanten Feldern
  const { data, error } = await supabase
    .from("books")
    .select()
    .or(
      `title.ilike.%${searchTerm}%,author.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,publisher.ilike.%${searchTerm}%`
    )
    .limit(limit);

  if (error) throw error;
  return data;
}

// Remove the subscribeToBooks function as we're handling it directly in BookManagement
