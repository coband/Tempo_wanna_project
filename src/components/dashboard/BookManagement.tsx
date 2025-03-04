import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import SearchHeader from "../SearchHeader";
import FilterSidebar from "../FilterSidebar";
import BookGrid from "../BookGrid";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { DashboardHeader } from "./DashboardHeader";
import type { Book } from "@/lib/books";
import { ChatButton } from "../books/ChatButton";

interface BookManagementProps {
  initialSearchQuery?: string;
  initialFiltersOpen?: boolean;
}

const BookManagement = ({
  initialSearchQuery = "",
  initialFiltersOpen = true,
}: BookManagementProps) => {
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [isFilterSidebarOpen, setIsFilterSidebarOpen] = useState(false);
  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [filteredBooks, setFilteredBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    genres: [],
    levels: [],
    yearRange: [1900, 2025],
    availability: [],
    location: [],
  });

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

  // Apply filters
  useEffect(() => {
    console.log("Starting filter with:", {
      totalBooks: allBooks.length,
      searchQuery,
      filters,
    });

    let result = [...allBooks];
    console.log("Initial books:", result);

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
          book.year?.toString().includes(query);
        if (!matches) {
          console.log("Book filtered out by search:", book.title);
        }
        return matches;
      });
      console.log("After search filter:", result.length);
    }

    // Genre filter
    if (filters.genres.length > 0) {
      result = result.filter((book) => {
        const matches = filters.genres.some(
          (genre) => genre.toLowerCase() === (book.subject || "").toLowerCase(),
        );
        if (!matches) {
          console.log("Book filtered out by genre:", book.title, book.subject);
        }
        return matches;
      });
      console.log("After genre filter:", result.length);
    }

    // Level filter
    if (filters.levels.length > 0) {
      result = result.filter((book) => {
        const matches = filters.levels.some((level) => level === book.level);
        if (!matches) {
          console.log("Book filtered out by level:", book.title, book.level);
        }
        return matches;
      });
      console.log("After level filter:", result.length);
    }

    // Year range
    const prevLength = result.length;
    result = result.filter((book) => {
      const matches =
        book.year >= filters.yearRange[0] && book.year <= filters.yearRange[1];
      if (!matches) {
        console.log("Book filtered out by year:", book.title, book.year);
      }
      return matches;
    });
    if (result.length !== prevLength) {
      console.log("After year filter:", result.length);
    }

    // Location
    if (filters.location.length > 0) {
      result = result.filter((book) => {
        const matches = filters.location.some(
          (loc) => loc.toLowerCase() === (book.location || "").toLowerCase(),
        );
        if (!matches) {
          console.log(
            "Book filtered out by location:",
            book.title,
            book.location,
          );
        }
        return matches;
      });
      console.log("After location filter:", result.length);
    }

    // Availability
    if (filters.availability.length > 0) {
      result = result.filter((book) => {
        const status = book.available ? "Verfügbar" : "Ausgeliehen";
        const matches = filters.availability.includes(status);
        if (!matches) {
          console.log("Book filtered out by availability:", book.title, status);
        }
        return matches;
      });
      console.log("After availability filter:", result.length);
    }

    console.log("Final filtered books:", result);
    setFilteredBooks(result);
  }, [allBooks, searchQuery, filters]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
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
      <DashboardHeader
        className={`${isFilterSidebarOpen ? "hidden lg:block" : "block"}`}
      />

      <div className="flex">
        {/* Sidebar */}
        <div
          className={`${isFilterSidebarOpen ? "translate-x-0" : "-translate-x-full"} 
          lg:translate-x-0 fixed lg:sticky top-0 h-screen lg:h-[calc(100vh-64px)] transition-transform duration-300 ease-in-out z-50 lg:z-0`}
        >
          <FilterSidebar
            onFilterChange={handleFilterChange}
            isOpen={true}
            onClose={() => setIsFilterSidebarOpen(false)}
          />
        </div>

        {/* Main content */}
        <div className="flex-1">
          <SearchHeader
            onSearch={handleSearch}
            books={allBooks}
            isLoading={loading}
            className={`${isFilterSidebarOpen ? "hidden lg:block" : "block"}`}
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

          {/* Mobile filter toggle */}
          <div className="lg:hidden fixed bottom-20 right-4 z-40">
            <Button
              size="icon"
              onClick={() => setIsFilterSidebarOpen(!isFilterSidebarOpen)}
              className="rounded-full shadow-lg"
            >
              <Menu className="h-6 w-6" />
            </Button>
          </div>

          {/* Mobile overlay */}
          {isFilterSidebarOpen && (
            <div
              className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
              onClick={() => setIsFilterSidebarOpen(false)}
            />
          )}

          {/* Chat button */}
          <ChatButton />
        </div>
      </div>
    </div>
  );
};

export default BookManagement;
