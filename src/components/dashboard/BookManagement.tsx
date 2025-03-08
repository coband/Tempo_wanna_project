import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import SearchHeader from "../SearchHeader";
import BookGrid from "../BookGrid";
import { DashboardHeader } from "./DashboardHeader";
import type { Book } from "@/lib/books";
import { ChatButton } from "../books/ChatButton";

interface BookManagementProps {
  initialSearchQuery?: string;
}

const BookManagement = ({
  initialSearchQuery = "",
}: BookManagementProps) => {
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [filteredBooks, setFilteredBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch books
  useEffect(() => {
    let mounted = true;

    const fetchBooks = async () => {
      try {
        console.log("Fetching books...");
        const { data, error } = await supabase
          .from("books")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) {
          throw error;
        }

        console.log("Fetched books:", data);

        if (mounted) {
          setAllBooks(data || []);
          setFilteredBooks(data || []);
          setLoading(false);
        }
      } catch (error) {
        console.error("Error fetching books:", error);
        setLoading(false);
      }
    };

    fetchBooks();

    // Set up realtime subscription
    const channel = supabase
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
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

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
        
        // Einzelne Felder-Prüfung
        if (book.title && book.title.toLowerCase().includes(query)) {
          found = true;
          matchField = "Titel: " + book.title;
        }
        else if (book.author && book.author.toLowerCase().includes(query)) {
          found = true;
          matchField = "Autor: " + book.author;
        }
        else if (book.publisher && book.publisher.toLowerCase().includes(query)) {
          found = true;
          matchField = "Verlag: " + book.publisher;
        }
        else if (book.description && book.description.toLowerCase().includes(query)) {
          found = true;
          matchField = "Beschreibung: " + book.description.substring(0, 50) + "...";
        }
        else if (book.subject && book.subject.toLowerCase().includes(query)) {
          found = true;
          matchField = "Fach: " + book.subject;
        }
        else if (book.type && book.type.toLowerCase().includes(query)) {
          found = true;
          matchField = "Typ: " + book.type;
        }
        else if (book.isbn && book.isbn.toLowerCase().includes(query)) {
          found = true;
          matchField = "ISBN: " + book.isbn;
        }
        else if (book.level && book.level.toLowerCase().includes(query)) {
          found = true;
          matchField = "Stufe: " + book.level;
        }
        else if (book.school && book.school.toLowerCase().includes(query)) {
          found = true;
          matchField = "Schule: " + book.school;
        }
        else if (book.location && book.location.toLowerCase().includes(query)) {
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
          books={searchQuery && searchQuery.toLowerCase().trim() ? filteredBooks : allBooks}
          isLoading={loading}
        />

        {/* Main content */}
        <main className="flex-1">
          <div className="w-full px-2 sm:px-4">
            <BookGrid
              books={filteredBooks}
              onBookChange={() => {
                // Books will automatically refresh through subscription
              }}
            />
          </div>
        </main>

        <ChatButton />
      </div>
    </div>
  );
};

export default BookManagement;
