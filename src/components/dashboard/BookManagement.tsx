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
      result = result.filter((book) => {
        const matches =
          book.title?.toLowerCase().includes(query) ||
          book.author?.toLowerCase().includes(query) ||
          book.isbn?.toLowerCase().includes(query) ||
          book.subject?.toLowerCase().includes(query) ||
          book.level?.toLowerCase().includes(query) ||
          book.year?.toString().includes(query) ||
          book.type?.toLowerCase().includes(query) ||
          book.school?.toLowerCase().includes(query) ||
          book.location?.toLowerCase().includes(query);
        
        return matches;
      });
      console.log("After search filter:", result.length);
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
          books={allBooks}
          isLoading={loading}
        />

        {/* Main content */}
        <main className="flex-1">
          <div className="max-w-7xl mx-auto">
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
