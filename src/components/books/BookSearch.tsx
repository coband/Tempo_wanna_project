import React, { useState } from 'react';
import { useSupabase } from '@/contexts/SupabaseContext';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import { Search, X } from 'lucide-react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';

interface Book {
  id: string;
  title: string;
  author: string;
  subject: string;
  level: string;
  description: string;
  similarity: number;
}

export function BookSearch() {
  const supabase = useSupabase(); // Authentifizierten Client aus dem Hook verwenden
  const [query, setQuery] = useState('');
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setIsLoading(true);
    try {
      // Zuerst die aktuelle Sitzung und den Token abrufen
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('Fehler beim Abrufen der Sitzung:', sessionError);
        throw sessionError;
      }
      
      const { data, error } = await supabase.functions.invoke('search-books', {
        body: { query }
      });
      
      if (error) throw error;
      setBooks(data.books || []);
    } catch (error) {
      console.error('Error searching books:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const clearSearch = () => {
    setQuery('');
    setBooks([]);
  };

  // Handle key press for search
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">Erweiterte Buchsuche</h2>
        <p className="text-gray-500">Suche nach Büchern mit spezifischen Suchbegriffen</p>
      </div>
      
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <Input
            type="text"
            placeholder="Suche nach Titel, Autor, Fach oder Stufe..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyPress}
            className="pr-10"
            onFocus={() => setIsCommandOpen(true)}
          />
          {query && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <Button onClick={handleSearch} disabled={isLoading || !query.trim()}>
          <Search className="w-4 h-4 mr-2" />
          {isLoading ? 'Suche läuft...' : 'Suchen'}
        </Button>
      </div>

      <CommandDialog open={isCommandOpen} onOpenChange={setIsCommandOpen}>
        <Command>
          <CommandInput placeholder="Tippen zum Suchen..." />
          <CommandList>
            <CommandEmpty>Keine Ergebnisse gefunden.</CommandEmpty>
            <CommandGroup heading="Vorschläge">
              {books.slice(0, 5).map((book) => (
                <CommandItem
                  key={book.id}
                  onSelect={() => {
                    setQuery(book.title);
                    setIsCommandOpen(false);
                    handleSearch();
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

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, index) => (
            <Card key={index} className="overflow-hidden">
              <CardContent className="p-4">
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2 mb-4" />
                <div className="flex gap-2 mb-4">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {books.length > 0 ? (
            <>
              <h3 className="text-lg font-medium mb-3">Suchergebnisse ({books.length}):</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {books.map((book) => (
                  <Card 
                    key={book.id} 
                    className="hover:shadow-lg transition-shadow"
                  >
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-lg mb-1">{book.title}</h3>
                      <p className="text-sm text-gray-600 mb-3">{book.author}</p>
                      
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <Badge variant="outline">{book.subject}</Badge>
                        <Badge variant="outline">{book.level}</Badge>
                        <Badge 
                          variant="secondary"
                          className="ml-auto"
                        >
                          {(book.similarity * 100).toFixed()}% Ähnlichkeit
                        </Badge>
                      </div>
                      
                      <p className="text-sm text-gray-700 line-clamp-3">{book.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : query && !isLoading ? (
            <div className="text-center py-12 border rounded-lg">
              <p className="text-gray-500">Keine Bücher gefunden, die zu deiner Suchanfrage passen.</p>
              <p className="text-gray-400 text-sm mt-2">Versuche es mit anderen Suchbegriffen oder einer allgemeineren Suche.</p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
