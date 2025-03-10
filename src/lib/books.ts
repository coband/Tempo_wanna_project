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
  publisher: string;
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
  // Überprüfen, ob ein Buch mit dieser ISBN bereits existiert
  const { data: existingBooks } = await supabase
    .from("books")
    .select("id, isbn")
    .eq("isbn", book.isbn.trim())
    .maybeSingle();
  
  if (existingBooks) {
    throw new Error("Ein Buch mit dieser ISBN existiert bereits.");
  }

  // Clean the ISBN before inserting
  const cleanedBook = {
    ...book,
    isbn: book.isbn.trim(),
  };

  // Insert the book
  const { data: insertedBook, error } = await supabase
    .from("books")
    .insert(cleanedBook)
    .select()
    .single();

  if (error) {
    console.error("Error creating book:", error);
    throw error;
  }

  // Starte die Embedding-Generierung für das neue Buch
  if (insertedBook) {
    try {
      // URL für Edge-Funktionen aus Umgebungsvariablen
      const functionsUrl = import.meta.env.VITE_SUPABASE_URL ? 
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1` : 
        '';
      
      if (functionsUrl) {
        console.log(`Starte Embedding-Generierung für Buch ${insertedBook.id}`);
        
        // Asynchron die createEmbeddings-Funktion aufrufen - keine Authentifizierung notwendig
        fetch(`${functionsUrl}/createEmbeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            bookIds: [insertedBook.id]
          })
        }).catch(embedError => {
          console.error("Fehler beim Aufruf der Embedding-Funktion:", embedError);
        });
      } else {
        console.warn("Konnte createEmbeddings nicht aufrufen: URL fehlt");
      }
    } catch (embedError) {
      console.error("Fehler bei der Embedding-Erstellung:", embedError);
      // Werfen wir keinen Fehler, da das Buch bereits erstellt wurde
    }
  }
}

export async function updateBook(id: string, book: Partial<Book>) {
  const { error } = await supabase.from("books").update(book).eq("id", id);

  if (error) throw error;
  
  // Embedding nach der Aktualisierung neu generieren
  try {
    // URL für Edge-Funktionen aus Umgebungsvariablen
    const functionsUrl = import.meta.env.VITE_SUPABASE_URL ? 
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1` : 
      '';
    
    if (functionsUrl) {
      console.log(`Aktualisiere Embedding für Buch ${id}`);
      
      // Asynchron die createEmbeddings-Funktion aufrufen - keine Authentifizierung mehr notwendig
      fetch(`${functionsUrl}/createEmbeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bookIds: [id]
        })
      }).catch(embedError => {
        console.error("Fehler beim Aufruf der Embedding-Funktion:", embedError);
      });
    } else {
      console.warn("Konnte createEmbeddings nicht aufrufen: URL fehlt");
    }
  } catch (embedError) {
    console.error("Fehler bei der Embedding-Aktualisierung:", embedError);
    // Werfen wir keinen Fehler, da das Buch bereits aktualisiert wurde
  }
}

export async function deleteBook(id: string) {
  const { error } = await supabase.from("books").delete().eq("id", id);

  if (error) throw error;
}

// Remove the subscribeToBooks function as we're handling it directly in BookManagement
