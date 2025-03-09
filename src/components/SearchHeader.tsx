import React, { useState, useMemo, useEffect } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Search, X, Info } from "lucide-react";
import {
  Command,
  CommandDialog,
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

interface SearchHeaderProps {
  className?: string;
  onSearch?: (query: string) => void;
  books?: any[];
  isLoading?: boolean;
}

const SearchHeader = ({
  className = "",
  onSearch = () => {},
  books = [],
  isLoading = false,
}: SearchHeaderProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [commandInputValue, setCommandInputValue] = useState("");

  // Synchronisiere commandInputValue mit searchQuery, wenn das Suchfeld fokussiert wird
  useEffect(() => {
    if (isCommandOpen) {
      setCommandInputValue(searchQuery);
    }
  }, [isCommandOpen, searchQuery]);

  // Helper function to normalize ISBN (remove all non-alphanumeric characters)
  const normalizeISBN = (isbn: string): string => {
    return isbn.replace(/[^0-9a-zA-Z]/g, '');
  };

  // Filter books for the command dialog based on input value
  const filteredSuggestions = useMemo(() => {
    if (!commandInputValue.trim()) return books;
    
    const query = commandInputValue.toLowerCase().trim();
    const normalizedQuery = normalizeISBN(query);
    
    // Check if it might be an ISBN (digits with optional dashes)
    const looksLikeISBN = /^[\d\-]+$/.test(query) && normalizedQuery.length >= 5;
    
    if (looksLikeISBN) {
      // Suche nach ISBN mit oder ohne Bindestriche
      const isbnMatches = books.filter(book => {
        if (!book.isbn) return false;
        const normalizedBookISBN = normalizeISBN(book.isbn);
        return normalizedBookISBN.includes(normalizedQuery);
      });
      
      if (isbnMatches.length > 0) {
        console.log(`ISBN-Suche: ${isbnMatches.length} Bücher gefunden für "${query}"`);
        return isbnMatches;
      }
    }
    
    // Check if it might be a publisher search
    const knownPublishers = ["westermann", "cornelsen", "klett", "diesterweg", "duden", "carlsen", "beltz", "raabe"];
    const mightBePublisher = knownPublishers.some(p => query.includes(p));
    
    // If it looks like a publisher, prioritize publisher matches
    if (mightBePublisher) {
      const publisherMatches = books.filter(book => 
        book.publisher && book.publisher.toLowerCase().includes(query)
      );
      
      if (publisherMatches.length > 0) {
        console.log(`Dropdown zeigt ${publisherMatches.length} Bücher vom Verlag mit "${query}"`);
        return publisherMatches;
      }
    }
    
    // Otherwise do normal filtering for title, author, etc.
    return books.filter(book => {
      // Spezielle Behandlung für ISBN, falls es eine teilweise ISBN-Übereinstimmung geben könnte
      if (book.isbn) {
        const normalizedBookISBN = normalizeISBN(book.isbn);
        if (normalizedBookISBN.includes(normalizedQuery)) {
          return true;
        }
      }
      
      const searchableFields = [
        book.title,
        book.author,
        book.publisher,
        book.subject,
        book.level,
        book.type
      ]
      .filter(Boolean)
      .map(field => field.toLowerCase());
      
      return searchableFields.some(field => field.includes(query));
    });
  }, [books, commandInputValue]);

  const handleSearch = () => {
    // Nur suchen, wenn es einen Suchbegriff gibt
    if (searchQuery.trim()) {
      onSearch(searchQuery);
      // CommandDialog nach der Suche schließen
      setIsCommandOpen(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setCommandInputValue("");
    onSearch("");
    // Optional: CommandDialog schließen
    setIsCommandOpen(false);
  };

  // Handler für die Änderung des Hauptsuchfelds
  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    
    // Wenn das Command-Dialog offen ist, auch den Command-Input aktualisieren
    if (isCommandOpen) {
      setCommandInputValue(value);
    }
  };

  // Handler für die Änderung des Command-Inputs (innerhalb des Dropdowns)
  const handleCommandInputChange = (value: string) => {
    setCommandInputValue(value);
    // Wir synchronisieren auch das Hauptsuchfeld, damit die Werte konsistent bleiben
    setSearchQuery(value);
  };

  // Handler für das Keydown-Event im Hauptsuchfeld
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    } else if (e.key === 'Escape') {
      setIsCommandOpen(false);
    }
  };

  // Handler für den Wechsel des Command-Dialog-Zustands
  const handleCommandDialogOpenChange = (open: boolean) => {
    setIsCommandOpen(open);
    // Wenn das Dialog geschlossen wird, synchronisiere die Werte
    if (!open) {
      setCommandInputValue(searchQuery);
    }
  };

  return (
    <header
      className={`sticky top-0 z-50 w-full bg-white border-b border-gray-200 px-4 py-3 shadow-sm ${className}`}
    >
      <div className="w-full flex flex-col sm:flex-row items-center gap-4">
        <div className="flex-1 flex items-center gap-2">
          <div className="relative flex-1 max-w-2xl">
            <Input
              type="text"
              placeholder="Suche nach Titel, Autor, Verlag, Beschreibung..."
              value={searchQuery}
              onChange={handleSearchInputChange}
              onKeyDown={handleKeyDown}
              className="pr-10"
              onFocus={() => setIsCommandOpen(true)}
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
          <Button onClick={handleSearch} disabled={isLoading || !searchQuery.trim()}>
            <Search className="w-4 h-4 mr-2" />
            Suchen
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
        </div>

        <CommandDialog open={isCommandOpen} onOpenChange={handleCommandDialogOpenChange}>
          <Command shouldFilter={false}>
            <CommandInput 
              placeholder="Type to search..." 
              value={commandInputValue}
              onValueChange={handleCommandInputChange}
            />
            <CommandList>
              <CommandEmpty>
                <div className="py-6 text-center">
                  <p>Keine Ergebnisse gefunden.</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Versuchen Sie einen anderen Suchbegriff oder korrigieren Sie Ihre Eingabe.
                  </p>
                </div>
              </CommandEmpty>
              {filteredSuggestions.length > 0 && (
                <CommandGroup heading="Bücher">
                  {filteredSuggestions.map((book) => {
                    const selectBook = () => {
                      setSearchQuery(book.title);
                      setIsCommandOpen(false);
                      onSearch(book.title);
                    };
                    
                    return (
                      <div 
                        key={book.id}
                        className="cursor-pointer w-full hover:bg-gray-100 px-2 py-2"
                        onClick={selectBook}
                      >
                        <CommandItem
                          onSelect={selectBook}
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
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </CommandDialog>
      </div>
    </header>
  );
};

export default SearchHeader;
