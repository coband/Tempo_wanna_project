import React, { useState } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Search, X } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";

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

  const handleSearch = () => {
    onSearch(searchQuery);
  };

  const clearSearch = () => {
    setSearchQuery("");
    onSearch("");
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
              placeholder="Suche nach Titel, Autor, ISBN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
          <Button onClick={handleSearch} disabled={isLoading}>
            <Search className="w-4 h-4 mr-2" />
            Suchen
          </Button>
        </div>

        <CommandDialog open={isCommandOpen} onOpenChange={setIsCommandOpen}>
          <Command>
            <CommandInput placeholder="Type to search..." />
            <CommandList>
              <CommandEmpty>Keine Ergebnisse gefunden.</CommandEmpty>
              <CommandGroup heading="Bücher">
                {books.map((book) => (
                  <CommandItem
                    key={book.id}
                    onSelect={() => {
                      setSearchQuery(book.title);
                      setIsCommandOpen(false);
                      onSearch(book.title);
                    }}
                  >
                    <div className="flex flex-col">
                      <span>{book.title}</span>
                      <span className="text-sm text-gray-500">
                        {book.author} • {book.subject} • {book.level}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </CommandDialog>
      </div>
    </header>
  );
};

export default SearchHeader;
