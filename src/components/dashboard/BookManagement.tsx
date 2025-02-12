import React, { useState, useMemo } from "react";
import SearchHeader from "../SearchHeader";
import FilterSidebar from "../FilterSidebar";
import BookGrid from "../BookGrid";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { DashboardHeader } from "./DashboardHeader";

interface BookManagementProps {
  initialSearchQuery?: string;
  initialFiltersOpen?: boolean;
}

const defaultBooks = [
  {
    id: "1",
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    available: true,
    location: "First Floor",
    genre: "Fiction",
    year: 1925,
  },
  {
    id: "2",
    title: "1984",
    author: "George Orwell",
    available: false,
    location: "Second Floor",
    genre: "Science Fiction",
    year: 1949,
  },
  {
    id: "3",
    title: "Pride and Prejudice",
    author: "Jane Austen",
    available: true,
    location: "Reference Section",
    genre: "Romance",
    year: 1813,
  },
];

const BookManagement = ({
  initialSearchQuery = "",
  initialFiltersOpen = true,
}: BookManagementProps) => {
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [isFilterSidebarOpen, setIsFilterSidebarOpen] =
    useState(initialFiltersOpen);
  const [filters, setFilters] = useState({
    genres: [],
    yearRange: [1900, 2024],
    availability: [],
    location: [],
  });

  const filteredBooks = useMemo(() => {
    return defaultBooks.filter((book) => {
      // Search query filter
      if (
        searchQuery &&
        !book.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !book.author.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }

      // Genre filter
      if (filters.genres.length > 0 && !filters.genres.includes(book.genre)) {
        return false;
      }

      // Year filter
      if (
        book.year < filters.yearRange[0] ||
        book.year > filters.yearRange[1]
      ) {
        return false;
      }

      // Availability filter
      if (filters.availability.length > 0) {
        const status = book.available ? "Available" : "Checked Out";
        if (!filters.availability.includes(status)) {
          return false;
        }
      }

      // Location filter
      if (
        filters.location.length > 0 &&
        !filters.location.includes(book.location)
      ) {
        return false;
      }

      return true;
    });
  }, [searchQuery, filters]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleFilterChange = (newFilters: any) => {
    setFilters(newFilters);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />
      <SearchHeader onSearch={handleSearch} />

      <div className="flex">
        {/* Mobile filter toggle */}
        <div className="lg:hidden fixed bottom-4 right-4 z-50">
          <Button
            size="icon"
            onClick={() => setIsFilterSidebarOpen(!isFilterSidebarOpen)}
            className="rounded-full shadow-lg"
          >
            <Menu className="h-6 w-6" />
          </Button>
        </div>

        {/* Sidebar - hidden on mobile unless toggled */}
        <div
          className={`${isFilterSidebarOpen ? "translate-x-0" : "-translate-x-full"} 
          lg:translate-x-0 fixed lg:sticky top-0 h-[calc(100vh-80px)] transition-transform duration-300 ease-in-out z-40 lg:z-0`}
        >
          <FilterSidebar
            onFilterChange={handleFilterChange}
            isOpen={true}
            onClose={() => setIsFilterSidebarOpen(false)}
          />
        </div>

        {/* Main content */}
        <main className="flex-1">
          <div className="max-w-7xl mx-auto">
            <BookGrid books={filteredBooks} />
          </div>
        </main>

        {/* Overlay for mobile when filter sidebar is open */}
        {isFilterSidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
            onClick={() => setIsFilterSidebarOpen(false)}
          />
        )}
      </div>
    </div>
  );
};

export default BookManagement;
