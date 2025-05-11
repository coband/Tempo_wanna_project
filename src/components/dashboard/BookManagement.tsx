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
import {
  LEVELS, LOCATIONS, SCHOOLS, SUBJECTS, BOOK_TYPES,
  YEAR_RANGE,
} from "@/lib/constants";
import { BookFilter } from '../books/BookFilter';
import { Button } from "@/components/ui/button";

// Definiere den Book-Typ basierend auf dem generierten Tabellentyp
export type Book = Database["public"]["Tables"]["books"]["Row"];

// Typ für die Hauptansicht (BookGrid), lässt nur sehr große/interne Felder weg
export type FetchedBook = Omit<Book, "embedding" | "user_id" | "vector_source">;

// Typ für Suchvorschläge im Header (schlank)
export type BookSuggestion = Pick<Book, "id" | "title" | "author" | "isbn" | "subject" | "level" | "publisher">;

interface BookManagementProps {
  initialSearchQuery?: string;
}

// Füge die API_ENDPOINT-Definition hinzu
const API_ENDPOINT = import.meta.env.VITE_SUPABASE_URL 
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1` 
  : '';

const PAGE_SIZE = 30; // Anzahl der Bücher pro Seite

interface ActiveFilters {
  levels: string[];
  school: string;
  type: string;
  subjects: string[];
  yearRange: [number, number];
  availability: boolean | null;
  location: string;
}

const BookManagement = ({
  initialSearchQuery = "",
}: BookManagementProps) => {
  const supabase = useSupabase();
  const { loading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [displayQuery, setDisplayQuery] = useState(initialSearchQuery);
  const [allBooks, setAllBooks] = useState<FetchedBook[]>([]);
  const [filteredBooks, setFilteredBooks] = useState<FetchedBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  // isFilteredState wird später basierend auf searchQuery ODER aktiven Filtern gesetzt
  const [isFilteredState, setIsFilteredState] = useState(false); 
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  console.log("BookManagement RENDER - hasMore:", hasMore, "loading:", loading, "offset:", offset); // Log bei jedem Render

  // Filter States
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedYearRange, setSelectedYearRange] = useState<[number, number]>([YEAR_RANGE[0], YEAR_RANGE[1]]);
  const [selectedAvailability, setSelectedAvailability] = useState<boolean | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string>("");

  const getCurrentFilters = (): ActiveFilters => ({
    levels: selectedLevels,
    school: selectedSchool,
    type: selectedType,
    subjects: selectedSubjects,
    yearRange: selectedYearRange,
    availability: selectedAvailability,
    location: selectedLocation,
  });
  
  const normalizeISBN = (isbn: string) => isbn.replace(/[^a-zA-Z0-9]/g, '');
  const isUUID = (str: string): boolean => !!str.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

  const fetchBooks = async (currentSearchTerm = "", loadMore = false, filters: ActiveFilters) => {
    console.log(`fetchBooks CALLED - searchTerm: '${currentSearchTerm}', loadMore: ${loadMore}, offset_before_request: ${offset}`, filters);
    setLoading(true);
    setLoadingError(null);
    try {
      const requestOffset = loadMore ? offset : 0;

      let queryBuilder = supabase.from("books");
      const selectFields = "id, title, author, isbn, subject, level, year, type, publisher, description, available, location, school, has_pdf, created_at, borrowed_at, borrowed_by";
      let query = queryBuilder.select(selectFields);

      // Suchbegriff-Filterung
      const uuidSearch = isUUID(currentSearchTerm);
      if (currentSearchTerm && uuidSearch) {
        query = query.eq("id", currentSearchTerm);
      } else if (currentSearchTerm) {
        const searchTermProcessed = `%${currentSearchTerm.replace(/ /g, '%')}%`;
        query = query.or(
          `title.ilike.${searchTermProcessed},author.ilike.${searchTermProcessed},isbn.ilike.${searchTermProcessed},subject.ilike.${searchTermProcessed},description.ilike.${searchTermProcessed},level.ilike.${searchTermProcessed},type.ilike.${searchTermProcessed}`
        );
      }

      // Filter anwenden
      if (filters.levels.length > 0) {
        query = query.in("level", filters.levels);
      }
      if (filters.school && filters.school !== "Alle") {
        query = query.ilike("school", filters.school);
      }
      if (filters.type && filters.type !== "Alle Typen") {
        query = query.ilike("type", filters.type);
      }
      if (filters.subjects.length > 0) {
        query = query.in("subject", filters.subjects);
      }
      if (filters.yearRange[0] !== YEAR_RANGE[0] || filters.yearRange[1] !== YEAR_RANGE[1]) {
        query = query.gte("year", filters.yearRange[0]);
        query = query.lte("year", filters.yearRange[1]);
      }
      if (filters.availability !== null) {
        query = query.eq("available", filters.availability);
      }
      if (filters.location && filters.location !== "Alle Standorte") {
        query = query.ilike("location", filters.location);
      }

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
        console.log(`fetchBooks SUCCESS - Received ${booksData.length} books. PAGE_SIZE: ${PAGE_SIZE}. Current offset: ${offset}, Request offset: ${requestOffset}`);

        if (loadMore) {
          setAllBooks(prevBooks => [...prevBooks, ...booksData]);
          setFilteredBooks(prevBooks => [...prevBooks, ...booksData]);
        } else {
          setAllBooks(booksData);
          setFilteredBooks(booksData);
        }
        
        const newOffset = requestOffset + booksData.length;
        setOffset(newOffset);
        
        const newHasMore = booksData.length === PAGE_SIZE;
        console.log(`fetchBooks - booksData.length (${booksData.length}) === PAGE_SIZE (${PAGE_SIZE}) is ${newHasMore}. Setting hasMore to ${newHasMore}. New offset will be ${newOffset}`);
        setHasMore(newHasMore);

        if (currentSearchTerm && isUUID(currentSearchTerm) && booksData.length > 0 && !loadMore) {
          setDisplayQuery(booksData[0].title || "Buch-ID");
        }
      } else {
        console.log(`fetchBooks NO DATA - loadMore: ${loadMore}. Setting hasMore to false.`);
        if (!loadMore) {
          setAllBooks([]);
          setFilteredBooks([]);
          setOffset(0); // Reset offset if initial load yields no data
        }
        setHasMore(false);
      }
    } catch (err) {
      console.error("Error fetching books:", err);
      setLoadingError('Ein Fehler ist beim Laden der Bücher aufgetreten.');
      if (!loadMore) {
        setAllBooks([]);
        setFilteredBooks([]);
        setOffset(0); // Reset offset on error for initial load
      }
      setHasMore(false); // Sicherstellen, dass bei Fehler nicht mehr geladen werden kann
      console.log("fetchBooks ERROR - Setting hasMore to false.", err);
    } finally {
      setLoading(false);
      console.log("fetchBooks FINALLY - loading set to false.");
    }
  };

  const fetchSuggestionsFromClient = async (searchTerm: string): Promise<BookSuggestion[]> => {
    if (!searchTerm.trim() || !supabase) return [];
    try {
      const processedSearchTerm = `%${searchTerm.trim().replace(/ /g, "%")}%`;
      const { data, error } = await supabase
        .from("books")
        .select("id, title, author, isbn, subject, level, publisher")
        .or(`title.ilike.${processedSearchTerm},author.ilike.${processedSearchTerm},isbn.ilike.${processedSearchTerm},subject.ilike.${processedSearchTerm},level.ilike.${processedSearchTerm},publisher.ilike.${processedSearchTerm}`)
        .limit(10);
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
    }
  };
  
  // useEffect für initiales Laden und Änderungen an searchQuery ODER Filtern
  useEffect(() => {
    if (authLoading) return;
    
    console.log("BookManagement EFFECT (search/filter change) - searchQuery:", searchQuery, "selectedType:", selectedType, "Resetting offset to 0 and hasMore to true.");
    setOffset(0); 
    setHasMore(true); // Optimistically set to true

    const currentFilters = getCurrentFilters();
    const performFetch = () => {
      fetchBooks(searchQuery, false, currentFilters);
    };

    // Debounce nur für textuelle Suche, nicht für Filter-Änderungen direkt
    // Filteränderungen lösen fetchBooks direkt in ihren Handlern aus (siehe unten)
    // Dieser useEffect reagiert primär auf searchQuery Änderungen
    const debounceTimer = setTimeout(performFetch, searchQuery ? 300 : 0);

    return () => {
      clearTimeout(debounceTimer);
    };
  }, [searchQuery, authLoading, supabase, selectedLevels, selectedSchool, selectedType, selectedSubjects, selectedYearRange, selectedAvailability, selectedLocation]);


  // Update isFilteredState based on searchQuery or any active filter
  useEffect(() => {
    const filters = getCurrentFilters();
    const hasActiveSearch = searchQuery.trim() !== "";
    const hasActiveFilters =
      filters.levels.length > 0 ||
      (filters.school && filters.school !== "Alle") ||
      (filters.type && filters.type !== "Alle Typen") ||
      filters.subjects.length > 0 ||
      (filters.yearRange[0] !== YEAR_RANGE[0] || filters.yearRange[1] !== YEAR_RANGE[1]) ||
      filters.availability !== null ||
      (filters.location && filters.location !== "Alle Standorte");

    console.log("BookManagement EFFECT (isFilteredState) - hasActiveSearch:", hasActiveSearch, "hasActiveFilters:", hasActiveFilters);
    setIsFilteredState(hasActiveSearch || hasActiveFilters);

    // Wenn nur Filter aktiv sind und kein Suchbegriff, setze displayQuery entsprechend
    if (hasActiveFilters && !hasActiveSearch) {
      setDisplayQuery(""); // War vorher "Aktive Filter", jetzt leer
    } else if (!hasActiveFilters && !hasActiveSearch) {
      setDisplayQuery(""); // Kein Suchbegriff, keine Filter
    }
    // Sonst bleibt displayQuery vom Suchbegriff bestimmt (handleSearch)

  }, [searchQuery, selectedLevels, selectedSchool, selectedType, selectedSubjects, selectedYearRange, selectedAvailability, selectedLocation]);


  const handleSearch = (query: string, displayTitle?: string) => {
    setSearchQuery(query);
    if (displayTitle) {
      setDisplayQuery(displayTitle);
    } else if (isUUID(query)) {
      setDisplayQuery("Suche nach Buch...");
    } else {
      setDisplayQuery(query);
    }
  };

  const resetSearchAndFilters = () => {
    setSearchQuery('');
    setDisplayQuery('');
    // Reset filter states
    setSelectedLevels([]);
    setSelectedSchool("");
    setSelectedType("");
    setSelectedSubjects([]);
    setSelectedYearRange([YEAR_RANGE[0], YEAR_RANGE[1]]);
    setSelectedAvailability(null);
    setSelectedLocation("");
    // setIsFilteredState(false); // Wird durch useEffect oben aktualisiert
    // fetchBooks wird durch den useEffect oben getriggert, da sich Filter geändert haben
  };

  const handleBookChange = () => {
    setOffset(0);
    fetchBooks(searchQuery, false, getCurrentFilters());
  };

  // Filter Handler Funktionen
  const handleLevelChange = (levels: string[]) => { setSelectedLevels(levels); };
  const handleSchoolChange = (school: string) => { setSelectedSchool(school); };
  const handleTypeChange = (type: string) => { setSelectedType(type); };
  const handleSubjectChange = (subjects: string[]) => { setSelectedSubjects(subjects); };
  const handleYearRangeChange = (range: [number, number]) => { setSelectedYearRange(range); };
  const handleAvailabilityChange = (available: boolean | null) => { setSelectedAvailability(available); };
  const handleLocationChange = (location: string) => { setSelectedLocation(location); };
  
  // Im Hooks-Bereich
  // Stellen sicher, dass alle Filterwerte initialisiert sind
  useEffect(() => {
    if (initialSearchQuery) {
      setSearchQuery(initialSearchQuery);
      setDisplayQuery(initialSearchQuery);
    }
    setHasMore(true);
    
    // Wenn keine Initialisierungsdaten mitgegeben wurden, lade die Standarddaten
    if (!initialSearchQuery) {
      fetchBooks("", false, {
        levels: [],
        school: "",
        type: "",
        subjects: [],
        yearRange: YEAR_RANGE,
        availability: null,
        location: ""
      });
    }
  }, [supabase, initialSearchQuery, authLoading]);

  if (loading && offset === 0 && !authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (authLoading) {
     return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p>Authentifizierung wird geladen...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />
      <div className="flex flex-col">
        <SearchHeader
          onSearch={handleSearch}
          onFetchSuggestions={fetchSuggestionsFromClient}
          isLoading={loading && searchQuery.trim().length > 0}
          currentQuery={displayQuery}
        />

        <BookFilter
          levels={LEVELS}
          selectedLevels={selectedLevels}
          onLevelChange={handleLevelChange}
          schools={SCHOOLS}
          selectedSchool={selectedSchool}
          onSchoolChange={handleSchoolChange}
          types={BOOK_TYPES}
          selectedType={selectedType}
          onTypeChange={handleTypeChange}
          subjects={SUBJECTS}
          selectedSubjects={selectedSubjects}
          onSubjectChange={handleSubjectChange}
          yearRange={YEAR_RANGE}
          selectedYearRange={selectedYearRange}
          onYearRangeChange={handleYearRangeChange}
          selectedAvailability={selectedAvailability}
          onAvailabilityChange={handleAvailabilityChange}
          locations={LOCATIONS}
          selectedLocation={selectedLocation}
          onLocationChange={handleLocationChange}
          onClearFilters={resetSearchAndFilters}
        />

        <main className="flex-1">
          <div className="w-full px-2 sm:px-4">
            {loadingError && (
              <div className="p-4 mb-4 text-red-800 bg-red-100 rounded-md">
                {loadingError}
              </div>
            )}
            <BookGrid
              books={filteredBooks}
              onBookChange={handleBookChange}
            />
            {!loading && filteredBooks.length === 0 && !loadingError && isFilteredState && (
               <div className="text-center p-8 text-gray-500">
                 Keine Bücher für Ihre Auswahl gefunden.
               </div>
            )}
             {!loading && filteredBooks.length === 0 && !loadingError && !isFilteredState && (
              <div className="text-center p-8 text-gray-500">
                Keine Bücher vorhanden. Bitte fügen Sie welche hinzu oder überprüfen Sie Ihre Suchkriterien.
              </div>
            )}
            {hasMore && !loading && (
              <div className="flex justify-center my-6">
                <Button
                  onClick={() => fetchBooks(searchQuery, true, getCurrentFilters())}
                  variant="default" 
                  size="lg"
                  className="rounded-md px-6 transition-all hover:translate-y-[-1px]"
                  disabled={loading}
                >
                  {loading ? "Lädt..." : "Weitere Bücher laden"}
                </Button>
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
