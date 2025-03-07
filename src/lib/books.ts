import { supabase } from "./supabase";
import type { Database } from "@/types/supabase";

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
  borrowed_at: string;
  borrowed_by: string;
  school: string;
  type: string;
}

export type NewBook = Database["public"]["Tables"]["books"]["Insert"];

export async function getBooks() {
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

export async function createBook(book: NewBook) {
  // Check if exact ISBN already exists
  const { data: existingBooks } = await supabase
    .from("books")
    .select()
    .eq("isbn", book.isbn.trim());

  if (existingBooks && existingBooks.length > 0) {
    throw new Error("Ein Buch mit dieser ISBN existiert bereits.");
  }

  // Clean the ISBN before inserting
  const cleanedBook = {
    ...book,
    isbn: book.isbn.trim(),
  };

  const { error } = await supabase.from("books").insert(cleanedBook);
  if (error) {
    console.error("Error creating book:", error);
    throw error;
  }
}

export async function updateBook(id: string, book: Partial<Book>) {
  const { error } = await supabase.from("books").update(book).eq("id", id);

  if (error) throw error;
}

export async function deleteBook(id: string) {
  const { error } = await supabase.from("books").delete().eq("id", id);

  if (error) throw error;
}

// Remove the subscribeToBooks function as we're handling it directly in BookManagement
