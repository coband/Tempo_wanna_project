import React, { useState, useMemo, useEffect, useRef } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Search, X, Info } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { debounce } from "lodash";

// Übernehme den BookSuggestion Typ oder definiere ihn hier, falls er nicht global verfügbar ist
// Annahme: BookSuggestion ist global oder wird hier importiert/definiert
// import type { BookSuggestion } from "../BookManagement"; // Beispielhafter Import
// Minimaldefinition für hier, falls nicht anders importiert:
export type BookSuggestion = { id: string; title: string; author?: string; isbn?: string; [key: string]: any };

interface SearchHeaderProps {
  className?: string;
  onSearch?: (query: string, displayTitle?: string) => void;
  books?: BookSuggestion[]; // books wird für Fallback oder Anzeige der ausgewählten Suche verwendet
  // allBooks?: any[]; // Nicht mehr für Vorschläge verwendet
  onFetchSuggestions?: (searchTerm: string) => Promise<BookSuggestion[]>; // Neue Prop
  isLoading?: boolean;
  currentQuery?: string;
  isMobile?: boolean;
}

const SearchHeader = ({
  className = "",
  onSearch = () => {},
  books = [], // books kann weiterhin nützlich sein, z.B. für initialen Zustand oder Fallback
  // allBooks = [], // Nicht mehr benötigt
  onFetchSuggestions,
  isLoading = false,
  currentQuery = "",
  isMobile = false,
}: SearchHeaderProps) => {
  const [searchQuery, setSearchQuery] = useState(currentQuery);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [suggestionItems, setSuggestionItems] = useState<BookSuggestion[]>([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isMobileView, setIsMobileView] = useState(isMobile);

  // Erkennen der Bildschirmgröße
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobileView(window.innerWidth < 768);
    };
    
    // Initial check
    checkIfMobile();
    
    // Event listener für Fenstergrößenänderungen
    window.addEventListener('resize', checkIfMobile);
    
    // Cleanup
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  // Aktualisiere searchQuery, wenn sich currentQuery ändert
  useEffect(() => {
    setSearchQuery(currentQuery);
  }, [currentQuery]);

  // Event-Listener für Klicks außerhalb des Dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current && 
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Helper function to normalize ISBN (remove all non-alphanumeric characters)
  const normalizeISBN = (isbn: string): string => {
    return isbn.replace(/[^0-9a-zA-Z]/g, '');
  };

  // Debounced function to fetch suggestions
  const debouncedFetchSuggestions = useRef(
    debounce(async (query: string) => {
      if (query.trim() && onFetchSuggestions) {
        try {
          const suggestions = await onFetchSuggestions(query);
          setSuggestionItems(suggestions);
        } catch (error) {
          console.error("Failed to fetch suggestions:", error);
          setSuggestionItems([]); // Bei Fehler leeren
        }
      } else {
        setSuggestionItems([]); // Leeren, wenn Query leer ist
      }
    }, 300) // 300ms debounce
  ).current;

  // Filter books for the dropdown based on input value
  const filteredSuggestions = useMemo(() => {
    // Verwende suggestionItems als primäre Quelle
    const sourceBooks = suggestionItems.length > 0 ? suggestionItems : []; 
    // Die alte Logik mit `allBooks` oder `books` wird hier nicht mehr direkt für die Vorschlagsgenerierung verwendet,
    // da die Vorschläge jetzt vom Backend kommen. Man könnte hier noch client-seitig auf den `suggestionItems` filtern/sortieren,
    // falls das Backend nicht schon perfekt sortierte Ergebnisse liefert oder spezielle Hervorhebungen gewünscht sind.
    // Fürs Erste geben wir die suggestionItems direkt oder leicht gefiltert zurück.

    if (!searchQuery.trim()) return []; // Keine Vorschläge bei leerer Suche
    
    // Wenn suggestionItems vorhanden sind, diese verwenden.
    // Die komplexe Filterlogik (ISBN, Verlag) kann hier ggf. entfallen oder angepasst werden,
    // je nachdem, was das Backend liefert.
    // Für dieses Beispiel geben wir suggestionItems zurück, wenn searchQuery gesetzt ist und Vorschläge da sind.
    // Eine einfache Filterung könnte sein, sicherzustellen, dass die Vorschläge noch zum aktuellen searchQuery passen,
    // falls das Debouncing und die Backend-Antwort nicht perfekt synchron sind.
    return sourceBooks.filter(book => {
      const query = searchQuery.toLowerCase().trim();
      const normalizedQuery = normalizeISBN(query);

      // Grundlegende Prüfung, ob Titel, Autor oder ISBN passen
      if (book.title && book.title.toLowerCase().includes(query)) return true;
      if (book.author && book.author.toLowerCase().includes(query)) return true;
      if (book.isbn) {
        const normalizedBookISBN = normalizeISBN(book.isbn);
        if (normalizedBookISBN.includes(normalizedQuery)) return true;
      }
      return false;
    });
  }, [suggestionItems, searchQuery]);

  const handleSearch = () => {
    // Nur suchen, wenn es einen Suchbegriff gibt
    if (searchQuery.trim()) {
      onSearch(searchQuery);
      setIsDropdownOpen(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    onSearch("");
    setIsDropdownOpen(false);
  };

  // Handler für die Änderung des Suchfelds
  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setIsDropdownOpen(value.trim().length > 0);
    if (value.trim().length > 0) {
      setIsFetchingSuggestions(true);
      debouncedFetchSuggestions(value);
    } else {
      setSuggestionItems([]); // Leeren, wenn Suchfeld geleert wird
      setIsFetchingSuggestions(false);
      setIsDropdownOpen(false);
    }
  };

  // Handler für das Keydown-Event im Suchfeld
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };

  const selectBook = (book: any) => {
    // Die UI aktualisieren
    setSearchQuery(book.title);
    setIsDropdownOpen(false);
    
    // Präzise Suche durchführen
    if (book.id) {
      // Wenn die ID verfügbar ist, nach dieser suchen (genauester Treffer)
      console.log("Selecting book by ID:", book.id, "with title:", book.title);
      
      // Die ID für die Suche übergeben, aber in der Anzeige den Buchtitel verwenden
      onSearch(book.id, book.title);
    } else if (book.title && book.author) {
      // Wenn kein ID, aber Titel und Autor, suche mit genauerer Abfrage
      console.log("Selecting book by title and author:", book.title, book.author);
      onSearch(`"${book.title}" ${book.author}`, book.title);
    } else {
      // Fallback auf normale Titelsuche
      console.log("Selecting book by title only:", book.title);
      onSearch(book.title, book.title);
    }
  };

  return (
    <header
      className={`sticky top-0 z-50 w-full bg-white border-b border-gray-200 px-4 py-3 shadow-sm ${className}`}
    >
      <div className="w-full flex flex-col sm:flex-row items-center gap-4">
        <div className="flex-1 flex items-center gap-2 relative">
          <div className="relative flex-1 max-w-2xl">
            <Input
              ref={inputRef}
              type="text"
              placeholder={isMobileView ? "Suche nach Titel Autor..." : "Suche nach Titel, Autor, Verlag, Beschreibung..."}
              value={searchQuery}
              onChange={handleSearchInputChange}
              onKeyDown={handleKeyDown}
              className="pr-10 text-[16px]"
              style={{ touchAction: "manipulation" }}
              onFocus={() => setIsDropdownOpen(searchQuery.trim().length > 0)}
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <Button onClick={handleSearch} disabled={isLoading || !searchQuery.trim()} size="icon" className="h-10 w-10">
            <Search className="w-4 h-4" />
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="p-2 text-gray-500 hover:text-gray-700">
                  <Info size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <div className="text-sm">
                  <p className="font-semibold mb-1">Suchfunktion:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Geben Sie einfach den Suchbegriff ein</li>
                    <li>Verlagsnamen wie <span className="font-mono">Westermann</span> werden automatisch erkannt</li>
                    <li>Bei Verlagsnamen werden bevorzugt Bücher des entsprechenden Verlags angezeigt</li>
                    <li>Die Suche berücksichtigt alle Felder (Titel, Autor, etc.)</li>
                  </ul>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Dropdown für Suchergebnisse */}
          {isDropdownOpen && (
            <div 
              ref={dropdownRef}
              className="absolute top-full left-0 right-0 mt-1 max-w-2xl bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-[60vh] overflow-y-auto"
            >
              <Command className="rounded-lg border shadow-md">
                <CommandList>
                  {isFetchingSuggestions ? (
                    <CommandEmpty>
                      <div className="py-6 text-center text-sm text-gray-500">
                        Lädt Vorschläge...
                      </div>
                    </CommandEmpty>
                  ) : filteredSuggestions.length === 0 ? (
                    <CommandEmpty>
                      <div className="py-6 text-center">
                        <p>Keine Ergebnisse gefunden.</p>
                        <p className="text-sm text-gray-500 mt-2">
                          Versuchen Sie einen anderen Suchbegriff oder korrigieren Sie Ihre Eingabe.
                        </p>
                      </div>
                    </CommandEmpty>
                  ) : (
                    <CommandGroup heading="Bücher">
                      {filteredSuggestions.map((book) => (
                        <div 
                          key={book.id || `${book.title}-${book.author}`}
                          className="cursor-pointer w-full hover:bg-gray-100 px-2 py-2"
                          onClick={() => selectBook(book)}
                        >
                          <CommandItem
                            className="pointer-events-none"
                          >
                            <div className="flex flex-col w-full">
                              <span>{book.title}</span>
                              <span className="text-sm text-gray-500">
                                {book.author} • {book.publisher ? `${book.publisher} • ` : ""}{book.subject} • {book.level}
                              </span>
                            </div>
                          </CommandItem>
                        </div>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default SearchHeader;
