import React, { useState, useEffect, useCallback, ChangeEvent, useRef } from "react";
import SearchHeader from "../SearchHeader";
import BookGrid from "../BookGrid";
import { DashboardHeader } from "./DashboardHeader";
import type { Book } from "@/lib/books";
import { ChatButton } from "../books/ChatButton";
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { X } from "lucide-react";
import { toast } from "react-hot-toast";
import LoadingScreen from "../LoadingScreen";
import NoResults from "../NoResults";
import { debounce } from "lodash";

interface BookManagementProps {
  initialSearchQuery?: string;
}

// Füge die API_ENDPOINT-Definition hinzu
const API_ENDPOINT = import.meta.env.VITE_SUPABASE_URL 
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1` 
  : '';

const BookManagement = ({
  initialSearchQuery = "",
}: BookManagementProps) => {
  const { supabase, loading: clientLoading, handleRequest } = useSupabaseAuth();
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [displayQuery, setDisplayQuery] = useState(initialSearchQuery);
  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [filteredBooks, setFilteredBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [isFiltered, setIsFiltered] = useState(false);

  // Normalisierung der ISBN (entfernt Nicht-Alphanumerische Zeichen)
  const normalizeISBN = (isbn: string) => {
    return isbn.replace(/[^a-zA-Z0-9]/g, '');
  };

  // Hilfsfunktion zur Prüfung, ob ein String eine UUID ist
  const isUUID = (str: string): boolean => {
    return !!str.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  };

  // Fetch books from the database
  const fetchBooks = async (searchTerm = "") => {
    setLoading(true);
    try {
      let data = null;
      let error = null;

      // Wir prüfen, ob der Suchbegriff eine UUID ist
      const uuidSearch = isUUID(searchTerm);
      
      if (searchTerm && uuidSearch) {
        // Wenn es eine UUID ist, suchen wir direkt nach der ID
        const result = await supabase
          .from("books")
          .select("*")
          .eq("id", searchTerm);
        
        data = result.data;
        error = result.error;
        
        // Setze displayQuery auf den Buchtitel, wenn ein Buch gefunden wurde
        if (data && data.length > 0) {
          setDisplayQuery(data[0].title || "Buch-ID");
        }
      } 
      else if (searchTerm) {
        // Normaler Suchbegriff, nicht UUID
        const result = await supabase
          .from("books")
          .select("*")
          .or(`title.ilike.%${searchTerm}%,author.ilike.%${searchTerm}%,isbn.ilike.%${searchTerm}%`)
          .order('created_at', { ascending: false });
        
        data = result.data;
        error = result.error;
      } 
      else {
        // Keine Suche, hole alle Bücher
        const result = await supabase
          .from("books")
          .select("*")
          .order('created_at', { ascending: false });
        
        data = result.data;
        error = result.error;
      }

      if (error) {
        console.error("Error fetching books:", error);
        toast.error("Fehler beim Laden der Bücher");
        return [];
      }

      if (data) setAllBooks(data);
      return data || [];
    } catch (error) {
      console.error("Error fetching books:", error);
      setLoadingError('Ein Fehler ist beim Laden der Bücher aufgetreten.');
      return [];
    } finally {
      setLoading(false);
    }
  };

  // Füge diese Realtime-Verbindung hinzu, um bei Änderungen automatisch zu aktualisieren
  useEffect(() => {
    if (clientLoading) return;
    
    // Eine Referenz auf den aktuellen Suchzustand für den Closure
    const currentSearchQuery = searchQuery;
    
    let debounceTimer: ReturnType<typeof setTimeout>;
    
    // Nur laden, wenn keine UUID-Suche aktiv ist oder gar keine Suche
    const shouldFetch = !isUUID(currentSearchQuery) || !currentSearchQuery.trim();
    
    if (shouldFetch) {
      // Bücher mit Verzögerung laden, um zu häufige Anfragen bei schneller Eingabe zu vermeiden
      debounceTimer = setTimeout(() => {
        fetchBooks(currentSearchQuery);
      }, currentSearchQuery ? 300 : 0); // Verzögerung nur bei Suchbegriffen
    }
    
    // Echtzeit-Abonnement für Änderungen an Büchern
    const channel = supabase
      .channel('bookChanges')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'books',
        },
        (payload) => {
          // Bei Änderungen erneut laden, aber nur, wenn keine Suche aktiv ist und nicht während einer Einzelbuchansicht
          if (!currentSearchQuery && !isFiltered) {
            fetchBooks();
          }
        }
      )
      .subscribe();
    
    return () => {
      // Aufräumen
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [searchQuery, supabase, clientLoading, isFiltered]);

  // Apply search filter
  useEffect(() => {
    let result = [...allBooks];

    // Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      
      // Prüfe, ob es sich um eine UUID-Suche handelt
      if (isUUID(query)) {
        // Suche direkt nach der ID
        const idMatches = result.filter(book => book.id === query);
        if (idMatches.length > 0) {
          return setFilteredBooks(idMatches);
        } else {
          // Wenn die ID direkt nicht gefunden wird, das Ergebnis leer lassen
          return setFilteredBooks([]);
        }
      }
      
      // Hilfsfunktion zur Normalisierung von ISBN (Entfernung aller Nicht-Alphanumerischen Zeichen)
      const normalizedQuery = normalizeISBN(query);
      
      // Prüfe, ob es sich um eine ISBN-Suche handeln könnte (Ziffern mit optionalen Bindestrichen)
      const looksLikeISBN = /^[\d\-]+$/.test(query) && normalizedQuery.length >= 5;
      
      if (looksLikeISBN) {
        // Spezielle ISBN-Suche
        const isbnMatches = result.filter(book => {
          if (!book.isbn) return false;
          const normalizedBookISBN = normalizeISBN(book.isbn);
          return normalizedBookISBN.includes(normalizedQuery);
        });
        
        if (isbnMatches.length > 0) {
          return setFilteredBooks(isbnMatches);
        }
      }
      
      // Erste Prüfung: Könnte es sich um einen Verlagsnamen handeln?
      // Liste häufiger deutscher Verlage
      const knownPublishers = ["westermann", "cornelsen", "klett", "diesterweg", "duden", "carlsen", "beltz", "raabe"];
      const mightBePublisher = knownPublishers.some(p => query.includes(p));
      
      // Wenn es sich um einen bekannten Verlagsnamen handeln könnte, prüfe zuerst genau im Verlagsfeld
      if (mightBePublisher) {
        const publisherMatches = result.filter(book => 
          book.publisher && book.publisher.toLowerCase().includes(query)
        );
        
        // Wenn wir Treffer im Verlagsfeld haben, zeige nur diese an
        if (publisherMatches.length > 0) {
          return setFilteredBooks(publisherMatches);
        }
      }
      
      // Ansonsten: Normale Suche in allen Feldern
      const matchedBooks = result.filter(book => {
        // Für Debug-Zwecke: Prüfe jedes Feld einzeln
        let found = false;
        let matchField = "";
        
        // Spezielle Behandlung für ISBN mit Normalisierung
        if (book.isbn) {
          const normalizedBookISBN = normalizeISBN(book.isbn);
          if (normalizedBookISBN.includes(normalizedQuery)) {
            found = true;
            matchField = "ISBN: " + book.isbn;
          }
        }
        
        // Einzelne Felder-Prüfung
        if (!found && book.title && book.title.toLowerCase().includes(query)) {
          found = true;
          matchField = "Titel: " + book.title;
        }
        else if (!found && book.author && book.author.toLowerCase().includes(query)) {
          found = true;
          matchField = "Autor: " + book.author;
        }
        else if (!found && book.publisher && book.publisher.toLowerCase().includes(query)) {
          found = true;
          matchField = "Verlag: " + book.publisher;
        }
        else if (!found && book.description && book.description.toLowerCase().includes(query)) {
          found = true;
          matchField = "Beschreibung: " + book.description.substring(0, 50) + "...";
        }
        else if (!found && book.subject && book.subject.toLowerCase().includes(query)) {
          found = true;
          matchField = "Fach: " + book.subject;
        }
        else if (!found && book.type && book.type.toLowerCase().includes(query)) {
          found = true;
          matchField = "Typ: " + book.type;
        }
        else if (!found && book.level && book.level.toLowerCase().includes(query)) {
          found = true;
          matchField = "Stufe: " + book.level;
        }
        else if (!found && book.school && book.school.toLowerCase().includes(query)) {
          found = true;
          matchField = "Schule: " + book.school;
        }
        else if (!found && book.location && book.location.toLowerCase().includes(query)) {
          found = true;
          matchField = "Standort: " + book.location;
        }
        
        return found;
      });
      
      result = matchedBooks;
    }
 
    setFilteredBooks(result);
  }, [allBooks, searchQuery]);

  const handleSearch = (query: string, displayTitle?: string) => {
    setSearchQuery(query);
    
    // Wenn ein expliziter Anzeigetitel übergeben wurde, verwende diesen
    if (displayTitle) {
      setDisplayQuery(displayTitle);
    }
    // Ansonsten, wenn es eine UUID ist, setze einen benutzerfreundlichen Text, bis das Suchergebnis da ist
    else if (isUUID(query)) {
      setDisplayQuery("Suche nach Buch...");
    } else {
      setDisplayQuery(query);
    }
    
    // Wenn die Suche gelöscht/zurückgesetzt wird, lade alle Bücher neu
    if (!query.trim()) {
      setIsFiltered(false);
      fetchBooks();
    } else {
      setIsFiltered(true);
    }
  };

  const resetSearch = () => {
    setSearchQuery('');
    setDisplayQuery('');
    setIsFiltered(false);
    fetchBooks();
  };

  if (loading) {
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
          books={filteredBooks}
          allBooks={allBooks}
          isLoading={loading}
          currentQuery={displayQuery}
        />

        {/* Filter-Indikator */}
        {isFiltered && (
          <div className="bg-blue-50 px-4 py-2 flex items-center justify-between">
            <div className="text-sm text-blue-700">
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
              books={filteredBooks}
              onBookChange={fetchBooks}
            />
          </div>
        </main>

        <ChatButton />
      </div>
    </div>
  );
};

export default BookManagement;
