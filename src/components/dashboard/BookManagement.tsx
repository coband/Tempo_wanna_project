import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import SearchHeader from "../SearchHeader";
import BookGrid from "../BookGrid";
import { DashboardHeader } from "./DashboardHeader";
import type { Book } from "@/lib/books";
import { ChatButton } from "../books/ChatButton";
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';

interface BookManagementProps {
  initialSearchQuery?: string;
}

const BookManagement = ({
  initialSearchQuery = "",
}: BookManagementProps) => {
  const { authClient, loading: clientLoading } = useSupabaseAuth();
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [filteredBooks, setFilteredBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  // Normalisierung der ISBN (entfernt Nicht-Alphanumerische Zeichen)
  const normalizeISBN = (isbn: string) => {
    return isbn.replace(/[^a-zA-Z0-9]/g, '');
  };

  // Fetch books
  const fetchBooks = useCallback(async () => {
    try {
      setLoading(true);
      setLoadingError(null);

      console.log("Fetching books with searchTerm:", searchQuery);
      let result;

      if (searchQuery.trim()) {
        // Prüfen, ob die Suche eine ISBN sein könnte (enthält nur Ziffern und Bindestriche)
        const isISBNSearch = /^[\d\-]+$/.test(searchQuery);
        console.log("Is ISBN search:", isISBNSearch);
        
        // Komplexe Suche mit Edge-Funktion durchführen
        const functionsUrl = import.meta.env.VITE_SUPABASE_URL ? 
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1` : 
          '';
          
        if (!functionsUrl) {
          throw new Error("Supabase URL nicht konfiguriert");
        }

        // Rufe die semantische Suchfunktion auf
        const response = await fetch(`${functionsUrl}/search-books`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            query: searchQuery,
            isbnSearch: isISBNSearch
          })
        });
        
        if (!response.ok) {
          throw new Error(`Fehler bei der Suche: ${response.statusText}`);
        }
        
        const searchResult = await response.json();
        console.log("Search results:", searchResult);
        result = searchResult?.books || [];
      } else {
        // Standard-Bücherliste abrufen
        // Verwende den authentifizierten Client anstelle des supabase-Imports
        const { data, error } = await authClient
          .from("books")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;
        result = data || [];
      }

      console.log(`Found ${result.length} books`);
      setAllBooks(result);
      setFilteredBooks(result);
    } catch (error) {
      console.error("Error fetching books:", error);
      setLoadingError("Fehler beim Laden der Bücher");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, authClient]);

  // Aktualisiere useEffect, um nur zu laden, wenn der Client nicht mehr lädt
  useEffect(() => {
    if (!clientLoading) {
      fetchBooks();
      
      // Set up realtime subscription
      const channel = authClient
        .channel("books_db_changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "books",
          },
          (payload) => {
            console.log("Realtime update received:", payload);
            fetchBooks();
          },
        )
        .subscribe((status) => {
          console.log("Subscription status:", status);
        });

      return () => {
        authClient.removeChannel(channel);
      };
    }
  }, [fetchBooks, clientLoading, authClient]);

  // Apply search filter
  useEffect(() => {
    console.log("Starting search filter with:", {
      totalBooks: allBooks.length,
      searchQuery,
    });

    let result = [...allBooks];

    // Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      console.log("Suche nach:", query);
      
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
          console.log(`ISBN-Suche: ${isbnMatches.length} Bücher gefunden für "${query}"`);
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
          console.log(`Gefunden: ${publisherMatches.length} Bücher vom Verlag mit "${query}"`);
          return setFilteredBooks(publisherMatches);
        }
      }
      
      // Ansonsten: Normale Suche in allen Feldern
      // Mit zusätzlichem Logging, um zu sehen, wo genau Treffer gefunden werden
      const matchedBooks = result.filter(book => {
        // Für Debug-Zwecke: Prüfe jedes Feld einzeln und protokolliere
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
        
        if (found) {
          console.log(`Treffer für "${query}" in Buch "${book.title}": ${matchField}`);
        }
        
        return found;
      });
      
      console.log(`Insgesamt ${matchedBooks.length} Bücher gefunden für: "${query}"`);
      result = matchedBooks;
    }

    setFilteredBooks(result);
  }, [allBooks, searchQuery]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
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
          initialValue={searchQuery}
        />

        {/* Main content */}
        <main className="flex-1">
          <div className="w-full px-2 sm:px-4">
            <BookGrid
              books={filteredBooks}
              loading={loading}
              onBookChange={fetchBooks}
              error={loadingError}
            />
          </div>
        </main>

        <ChatButton />
      </div>
    </div>
  );
};

export default BookManagement;
