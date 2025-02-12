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

interface SearchSuggestion {
  id: string;
  title: string;
  type: "book" | "author" | "isbn";
}

interface SearchHeaderProps {
  onSearch?: (query: string) => void;
  suggestions?: SearchSuggestion[];
  isLoading?: boolean;
}

const defaultSuggestions: SearchSuggestion[] = [
  { id: "1", title: "The Great Gatsby", type: "book" },
  { id: "2", title: "F. Scott Fitzgerald", type: "author" },
  { id: "3", title: "9780743273565", type: "isbn" },
  { id: "4", title: "To Kill a Mockingbird", type: "book" },
  { id: "5", title: "Harper Lee", type: "author" },
];

const SearchHeader = ({
  onSearch = () => {},
  suggestions = defaultSuggestions,
  isLoading = false,
}: SearchHeaderProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCommandOpen, setIsCommandOpen] = useState(false);

  const handleSearch = () => {
    onSearch(searchQuery);
  };

  const clearSearch = () => {
    setSearchQuery("");
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center gap-4">
        <div className="flex-1 flex items-center gap-2">
          <div className="relative flex-1 max-w-2xl">
            <Input
              type="text"
              placeholder="Search by title, author, or ISBN..."
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
            Search
          </Button>
        </div>

        <CommandDialog open={isCommandOpen} onOpenChange={setIsCommandOpen}>
          <Command>
            <CommandInput placeholder="Type to search..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Books">
                {suggestions
                  .filter((s) => s.type === "book")
                  .map((suggestion) => (
                    <CommandItem
                      key={suggestion.id}
                      onSelect={() => {
                        setSearchQuery(suggestion.title);
                        setIsCommandOpen(false);
                      }}
                    >
                      {suggestion.title}
                    </CommandItem>
                  ))}
              </CommandGroup>
              <CommandGroup heading="Authors">
                {suggestions
                  .filter((s) => s.type === "author")
                  .map((suggestion) => (
                    <CommandItem
                      key={suggestion.id}
                      onSelect={() => {
                        setSearchQuery(suggestion.title);
                        setIsCommandOpen(false);
                      }}
                    >
                      {suggestion.title}
                    </CommandItem>
                  ))}
              </CommandGroup>
              <CommandGroup heading="ISBN">
                {suggestions
                  .filter((s) => s.type === "isbn")
                  .map((suggestion) => (
                    <CommandItem
                      key={suggestion.id}
                      onSelect={() => {
                        setSearchQuery(suggestion.title);
                        setIsCommandOpen(false);
                      }}
                    >
                      {suggestion.title}
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
