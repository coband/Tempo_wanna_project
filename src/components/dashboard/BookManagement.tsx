import React, { useState, useEffect, useCallback, ChangeEvent, useRef } from "react";
import SearchHeader from "../SearchHeader";
import BookGrid from "../BookGrid";
import { DashboardHeader } from "./DashboardHeader";
import type { Database } from "@/types/supabase";
import { ChatButton } from "../books/ChatButton";
import { useSupabase } from '@/contexts/SupabaseContext';
import { useAuth } from '@/hooks/useAuth';
import { X } from "lucide-react";
import { toast } from "react-hot-toast";
import { debounce } from "lodash";

// Definiere den Book-Typ basierend auf dem generierten Tabellentyp
export type Book = Database["public"]["Tables"]["books"]["Row"];

// Typ für die Hauptansicht (BookGrid), lässt nur sehr große/interne Felder weg
export type FetchedBook = Omit<Book, "embedding" | "user_id" | "vector_source">;

// Typ für Suchvorschläge im Header (schlank)
export type BookSuggestion = Pick<Book, "id" | "title" | "author" | "isbn" | "subject" | "level">;

interface BookManagementProps {
  initialSearchQuery?: string;
}

// Füge die API_ENDPOINT-Definition hinzu
const API_ENDPOINT = import.meta.env.VITE_SUPABASE_URL 
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1` 
  : '';

const PAGE_SIZE = 30; // Anzahl der Bücher pro Seite

const BookManagement = ({
  initialSearchQuery = "",
}: BookManagementProps) => {
  const supabase = useSupabase();
  const { loading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [displayQuery, setDisplayQuery] = useState(initialSearchQuery);
  const [allBooks, setAllBooks] = useState<FetchedBook[]>([]); // Verwende FetchedBook
  const [filteredBooks, setFilteredBooks] = useState<FetchedBook[]>([]); // Verwende FetchedBook
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [isFiltered, setIsFiltered] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Normalisierung der ISBN (entfernt Nicht-Alphanumerische Zeichen)
  const normalizeISBN = (isbn: string) => {
    return isbn.replace(/[^a-zA-Z0-9]/g, '');
  };

  // Hilfsfunktion zur Prüfung, ob ein String eine UUID ist
  const isUUID = (str: string): boolean => {
    return !!str.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  };

  // Helper-Funktion für Anfragen mit Fehlerbehandlung
  const handleRequest = async <T,>(
    requestFn: () => Promise<{ data: T | null; error: any }>
  ): Promise<{ data: T | null; error: any }> => {
    try {
      return await requestFn();
    } catch (error) {
      console.error("Fehler bei der Anfrage:", error);
      return { data: null, error };
    }
  };

  // Fetch books from the database with pagination
  const fetchBooks = async (currentSearchTerm = "", loadMore = false) => {
    setLoading(true);
    setLoadingError(null);
    try {
      const requestOffset = loadMore ? offset : 0;

      let queryBuilder = supabase.from("books");
      // Definiere die Felder, die für die Hauptansicht (BookGrid) benötigt werden
      const selectFields = [
        "id", "title", "author", "isbn", "subject", "level", "year", "type", 
        "publisher", "description", "available", "location", "school", 
        "has_pdf", "created_at", 
        "borrowed_at", "borrowed_by" // Hinzugefügt für BookDetails
        // Explizit NICHT: "embedding", "user_id", "vector_source"
      ].join(",");

      let query = queryBuilder.select(selectFields);

      const uuidSearch = isUUID(currentSearchTerm);
      if (currentSearchTerm && uuidSearch) {
        query = query.eq("id", currentSearchTerm);
      } else if (currentSearchTerm) {
        const searchTermProcessed = `%${currentSearchTerm.replace(/ /g, '%')}%`;
        query = query.or(
          `title.ilike.${searchTermProcessed},author.ilike.${searchTermProcessed},isbn.ilike.${searchTermProcessed},subject.ilike.${searchTermProcessed},description.ilike.${searchTermProcessed},level.ilike.${searchTermProcessed},type.ilike.${searchTermProcessed}`
        );
      }

      // Paginierung immer anwenden
      query = query
        .order("created_at", { ascending: false })
        .range(requestOffset, requestOffset + PAGE_SIZE - 1);

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching books:", error);
        toast.error("Fehler beim Laden der Bücher");
        setLoadingError("Fehler beim Laden der Bücher.");
        setHasMore(false);
        return;
      }

      if (data) {
        const booksData = data as unknown as FetchedBook[]; 

        if (loadMore) {
          setAllBooks(prevBooks => [...prevBooks, ...booksData]);
          // Wenn eine Suche aktiv ist und mehr geladen wird, auch filteredBooks aktualisieren
          if (currentSearchTerm) {
            setFilteredBooks(prevBooks => [...prevBooks, ...booksData]);
          }
        } else {
          // Neue Suche oder initiales Laden (kein loadMore)
          setAllBooks(booksData);
          // Wenn eine Suche aktiv ist (oder auch initial), filteredBooks direkt setzen
          setFilteredBooks(booksData);
        }
        
        setOffset(requestOffset + booksData.length);
        setHasMore(booksData.length === PAGE_SIZE);

        if (currentSearchTerm && uuidSearch && booksData.length > 0 && !loadMore) {
          setDisplayQuery(booksData[0].title || "Buch-ID");
        }
      } else { // Kein data
        if (!loadMore) { // Nur leeren, wenn es keine "loadMore" Aktion war und keine Daten kamen
          setAllBooks([]);
          setFilteredBooks([]);
        }
        setHasMore(false);
      }
    } catch (err) {
      console.error("Error fetching books:", err);
      setLoadingError('Ein Fehler ist beim Laden der Bücher aufgetreten.');
      if (!loadMore) {
        setAllBooks([]);
        setFilteredBooks([]);
      }
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  // Neue Funktion für Suchvorschläge direkt vom Client
  const fetchSuggestionsFromClient = async (searchTerm: string): Promise<BookSuggestion[]> => {
    if (!searchTerm.trim() || !supabase) {
      return [];
    }
    // Optional: Separaten Loading-State für Vorschläge, um UI nicht mit Haupt-Loading zu blockieren
    // setLoadingSuggestions(true);
    try {
      const processedSearchTerm = `%${searchTerm.trim().replace(/ /g, "%")}%`;
      const suggestionsLimit = 10;

      // Stelle sicher, dass die selektierten Felder mit BookSuggestion übereinstimmen
      const { data, error } = await supabase
        .from("books")
        .select("id, title, author, isbn, subject, level") // Diese Felder passen zu BookSuggestion
        .or(
          `title.ilike.${processedSearchTerm},` +
          `author.ilike.${processedSearchTerm},` +
          `isbn.ilike.${processedSearchTerm},` +
          `subject.ilike.${processedSearchTerm},` +
          `level.ilike.${processedSearchTerm}` // Entferne das letzte Komma und schließe die Klammer korrekt
          // `type.ilike.${processedSearchTerm}` // Type wird in BookSuggestion nicht verwendet
        )
        .limit(suggestionsLimit);

      if (error) {
        console.error("Error fetching client-side suggestions:", error);
        toast.error("Fehler beim Laden der Suchvorschläge.");
        return [];
      }
      return (data as BookSuggestion[]) || [];
    } catch (err) {
      console.error("Error in fetchSuggestionsFromClient:", err);
      toast.error("Ein Fehler ist beim Laden der Vorschläge aufgetreten.");
      return [];
    } finally {
      // setLoadingSuggestions(false);
    }
  };

  // Effect for initial load and when searchQuery changes
  useEffect(() => {
    if (authLoading) return;

    // Bei JEDER Änderung des Suchbegriffs (auch von non-empty zu empty oder umgekehrt)
    // oder beim initialen Laden, die Bücher zurücksetzen und neu laden.
    setAllBooks([]); 
    setFilteredBooks([]); 
    setOffset(0); // Wichtig: Offset für neue Suche/Laden zurücksetzen      
    setHasMore(true); // Annahme, dass es mehr geben könnte   

    const currentSearchQueryValue = searchQuery;
    let debounceTimer: ReturnType<typeof setTimeout>;

    const performFetch = () => {
      fetchBooks(currentSearchQueryValue, false); // false für loadMore, da neue Suche/initiales Laden
    };

    if (isUUID(currentSearchQueryValue)) {
      performFetch();
    } else {
      debounceTimer = setTimeout(performFetch, currentSearchQueryValue ? 300 : 0);
    }

    return () => {
      clearTimeout(debounceTimer);
    };
  }, [searchQuery, authLoading, supabase]); // supabase dependency beibehalten

  // useEffect für filteredBooks und isFiltered
  useEffect(() => {
    // Dieser useEffect wird vereinfacht. fetchBooks kümmert sich jetzt darum,
    // filteredBooks korrekt zu setzen, wenn eine Suche aktiv ist oder nicht.
    // Wenn searchQuery leer ist und allBooks sich ändert (z.B. durch loadMore ohne Suche),
    // sollte filteredBooks allBooks widerspiegeln.
    if (searchQuery.trim() === "") {
      setFilteredBooks(allBooks);
    }
    // Wenn searchQuery nicht leer ist, hat fetchBooks bereits filteredBooks aktualisiert.

    setIsFiltered(searchQuery.trim() !== "");
  }, [allBooks, searchQuery]); // Abhängig von allBooks (für den Fall ohne Suche) und searchQuery

  const handleSearch = (query: string, displayTitle?: string) => {
    setSearchQuery(query);
    
    if (displayTitle) {
      setDisplayQuery(displayTitle);
    } else if (isUUID(query)) {
      setDisplayQuery("Suche nach Buch...");
    } else {
      setDisplayQuery(query);
    }
    
    if (!query.trim()) {
      setIsFiltered(false);
    } else {
      setIsFiltered(true);
    }
  };

  const resetSearch = () => {
    setSearchQuery('');
    setDisplayQuery('');
    setIsFiltered(false);
  };

  const handleBookChange = () => {
    // When a book changes (e.g., after edit/delete in BookGrid),
    // reset pagination for the current search and reload the first page.
    setOffset(0);
    // setAllBooks([]); // fetchBooks with loadMore=false will replace allBooks
    fetchBooks(searchQuery, false);
  };

  if (loading && offset === 0) { // Show main loading screen only for the very first load
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />

      <div className="flex flex-col">
        <SearchHeader
          onSearch={handleSearch}
          books={filteredBooks as any[]} // TODO: Pass BookSuggestion[] ? Check SearchHeader props
          onFetchSuggestions={fetchSuggestionsFromClient}
          isLoading={loading} // Haupt-Loading-State, ggf. separaten für Suggestions
          currentQuery={displayQuery}
        />

        {/* Filter-Indikator */}
        {isFiltered && (
          <div className="bg-blue-50 px-4 py-2 flex items-center justify-between">
            <div className="text-sm text-blue-700">
              {/* Adjust length check if filteredBooks holds FetchedBook */} 
              {filteredBooks.length === 1 
                ? "1 Buch gefunden für" 
                : `${filteredBooks.length} Bücher gefunden für`}: "{displayQuery}"
            </div>
            <button
              onClick={resetSearch}
              className="text-sm text-blue-700 hover:text-blue-900 font-medium flex items-center"
            >
              <X className="w-4 h-4 mr-1" />
              Zurücksetzen und alle Bücher anzeigen
            </button>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1">
          <div className="w-full px-2 sm:px-4">
            {loadingError && (
              <div className="p-4 mb-4 text-red-800 bg-red-100 rounded-md">
                {loadingError}
              </div>
            )}
            <BookGrid
              books={filteredBooks} // filteredBooks ist jetzt FetchedBook[], BookGrid muss angepasst werden
              onBookChange={handleBookChange}
            />
            {!loading && filteredBooks.length === 0 && !loadingError && displayQuery && (
               <div className="text-center p-8 text-gray-500">
                 Keine Bücher für "{displayQuery}" gefunden.
               </div>
            )}
            {!loading && filteredBooks.length === 0 && !loadingError && !displayQuery && (
              <div className="text-center p-8 text-gray-500">
                Keine Bücher vorhanden.
              </div>
            )}
            {hasMore && !loading && (
              <div className="flex justify-center my-6">
                <button
                  onClick={() => fetchBooks(searchQuery, true)}
                  className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition ease-in-out duration-150"
                  disabled={loading}
                >
                  {loading ? "Lädt..." : "Weitere Bücher laden"}
                </button>
              </div>
            )}
          </div>
        </main>

        <ChatButton />
      </div>
    </div>
  );
};

export default BookManagement;
