import { useState, useEffect } from "react";
import { Card, CardContent } from "./ui/card";
import { useAuth } from "@/lib/auth";
import BookDetails from "./books/BookDetails.tsx";
import { Badge } from "./ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Button } from "./ui/button";
import { BookForm } from "./books/BookForm";
import { Book, NewBook, BookUpdate } from "@/lib/books";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useToast } from "./ui/use-toast";
import { BookFilter } from "./books/BookFilter";
import { LEVELS, SUBJECTS, BOOK_TYPES, SCHOOLS, LOCATIONS, YEAR_RANGE } from "@/lib/constants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Edit, Plus, Trash2 } from "lucide-react";

interface BookGridProps {
  books?: Book[];
  onBookChange?: () => void;
}

interface FilterValues {
  level: string[];
  school: string;
  type: string;
  subject: string[];
  year: [number, number];
  available: boolean | null;
  location: string;
}

export default function BookGrid({ books = [], onBookChange }: BookGridProps) {
  const { isAdmin } = useAuth();
  const { supabase } = useSupabaseAuth();
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const { toast } = useToast();
  
  // Filter-States
  const [filteredBooks, setFilteredBooks] = useState<Book[]>(books);
  const [activeFilters, setActiveFilters] = useState<Partial<FilterValues>>({
    available: null
  });

  // Filter books when books array or filters change
  useEffect(() => {
    filterBooks(books, activeFilters);
  }, [books, activeFilters]);

  const filterBooks = (books: Book[], filters: Partial<FilterValues>) => {
    // If no filters are active, show all books
    if (Object.keys(filters).length === 0) {
      setFilteredBooks(books);
      return;
    }

    // Apply filters
    const filtered = books.filter((book) => {
      // For each filter category
      if (filters.level && filters.level.length > 0) {
        const bookLevels = book.level?.split(', ') || [];
        if (!filters.level.some(level => bookLevels.includes(level))) {
          return false;
        }
      }

      if (filters.school && book.school !== filters.school) {
        return false;
      }

      if (filters.type && book.type !== filters.type) {
        return false;
      }

      if (filters.subject && filters.subject.length > 0) {
        if (!filters.subject.includes(book.subject)) {
          return false;
        }
      }

      if (filters.year) {
        const [min, max] = filters.year;
        if (book.year < min || book.year > max) {
          return false;
        }
      }

      if (filters.available !== null && filters.available !== undefined) {
        if (book.available !== filters.available) {
          return false;
        }
      }

      if (filters.location && book.location !== filters.location) {
        return false;
      }

      return true;
    });

    setFilteredBooks(filtered);
  };

  const handleFilterChange = (category: keyof FilterValues, value: any) => {
    setActiveFilters((prev) => ({
      ...prev,
      [category]: value
    }));
  };

  const handleAdd = async (book: NewBook) => {
    try {
      // Verwende den authentifizierten Client
      const { data, error } = await supabase
        .from("books")
        .insert(book)
        .select();
      
      if (error) throw error;
      
      // Wenn ein Embedding erstellt werden soll, rufe die Edge-Funktion auf
      if (data && data.length > 0) {
        const newBookId = data[0].id;
        
        try {
          const functionsUrl = import.meta.env.VITE_SUPABASE_URL 
            ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1` 
            : '';
          
          if (functionsUrl) {
            // Versuche, das Embedding asynchron zu erstellen
            fetch(`${functionsUrl}/create-book-embedding`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                bookId: newBookId,
                bookData: { ...book, id: newBookId }
              })
            }).catch(err => {
              console.warn("Fehler beim Erstellen des Embeddings (nicht kritisch):", err);
            });
          }
        } catch (err) {
          console.warn("Fehler beim Aufruf der Embedding-Funktion:", err);
        }
      }
      
      // Benachrichtige den Elternkomponenten
      if (onBookChange) onBookChange();
      
      toast({
        title: "Buch hinzugefügt",
        description: "Das Buch wurde erfolgreich hinzugefügt."
      });
    } catch (error) {
      console.error("Error adding book:", error);
      
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Das Buch konnte nicht hinzugefügt werden. Bitte versuche es erneut."
      });
      
      throw error;
    }
  };
  
  const handleUpdate = async (book: BookUpdate) => {
    try {
      // Verwende den authentifizierten Client
      const { data, error } = await supabase
        .from("books")
        .update(book)
        .eq("id", book.id)
        .select();
      
      if (error) throw error;
      
      if (onBookChange) onBookChange();
      
      toast({
        title: "Buch aktualisiert",
        description: "Das Buch wurde erfolgreich aktualisiert."
      });
    } catch (error) {
      console.error("Error updating book:", error);
      
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Das Buch konnte nicht aktualisiert werden. Bitte versuche es erneut."
      });
      
      throw error;
    }
  };
  
  const handleDelete = async () => {
    if (!selectedBook) return;
    
    try {
      const { error } = await supabase
        .from("books")
        .delete()
        .eq("id", selectedBook.id);
      
      if (error) throw error;
      
      setShowDeleteDialog(false);
      if (onBookChange) onBookChange();
      
      toast({
        title: "Buch gelöscht",
        description: "Das Buch wurde erfolgreich gelöscht."
      });
    } catch (error) {
      console.error("Error deleting book:", error);
      
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Das Buch konnte nicht gelöscht werden. Bitte versuche es erneut."
      });
    }
  };

  return (
    <div className="p-4">
      {/* Filter-Abschnitt */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h2 className="text-xl font-semibold mb-4">Filter</h2>
        <BookFilter
          levels={LEVELS}
          schools={SCHOOLS}
          types={BOOK_TYPES}
          subjects={SUBJECTS}
          yearRange={YEAR_RANGE}
          locations={LOCATIONS}
          selectedLevels={activeFilters.level || []}
          selectedSchool={activeFilters.school || ""}
          selectedType={activeFilters.type || ""}
          selectedSubjects={activeFilters.subject || []}
          selectedYearRange={activeFilters.year || YEAR_RANGE}
          selectedAvailability={activeFilters.available}
          selectedLocation={activeFilters.location || ""}
          onLevelChange={(values) => handleFilterChange("level", values)}
          onSchoolChange={(value) => handleFilterChange("school", value)}
          onTypeChange={(value) => handleFilterChange("type", value)}
          onSubjectChange={(values) => handleFilterChange("subject", values)}
          onYearRangeChange={(values) => handleFilterChange("year", values)}
          onAvailabilityChange={(value) => handleFilterChange("available", value)}
          onLocationChange={(value) => handleFilterChange("location", value)}
          onClearFilters={() => {
            setActiveFilters({
              available: null
            });
          }}
        />
      </div>

      {/* Add Button für Admins */}
      {isAdmin && (
        <div className="mb-6">
          <Button
            onClick={() => {
              setSelectedBook(null);
              setShowAddForm(true);
            }}
            className="w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 mr-2" />
            Buch hinzufügen
          </Button>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {Array.isArray(filteredBooks) && filteredBooks.length > 0 ? (
          filteredBooks.map((book) => (
            <Card
              key={book.id}
              className="overflow-hidden transition-all duration-200 hover:shadow-sm flex flex-col cursor-pointer"
              onClick={() => {
                setSelectedBook(book);
                setShowDetailsDialog(true);
              }}
            >
              <CardContent className="p-0 flex flex-col h-full">
                <div 
                  className="p-3 flex-grow flex flex-col"
                  style={{
                    borderLeft: book.available 
                      ? '4px solid #22c55e' 
                      : '4px solid #ef4444'
                  }}
                >
                  <h3 className="font-medium text-base line-clamp-2 mb-1">{book.title}</h3>
                  <p className="text-sm text-gray-500 line-clamp-1 mb-1">{book.author}</p>
                  {book.publisher && (
                    <p className="text-xs text-gray-400 line-clamp-1 mb-2">Verlag: {book.publisher}</p>
                  )}
                  
                  <div className="mt-auto pt-2 flex flex-wrap gap-1 text-xs">
                    {book.subject && (
                      <Badge variant="outline" className="bg-gray-100 text-xs">
                        {book.subject}
                      </Badge>
                    )}
                    {book.level && (
                      <Badge variant="outline" className="bg-gray-100 text-xs">
                        {book.level}
                      </Badge>
                    )}
                    {book.type && (
                      <Badge variant="outline" className="bg-gray-100 text-xs">
                        {book.type}
                      </Badge>
                    )}
                  </div>
                  
                  <div className="mt-2 text-xs text-gray-500 flex justify-between items-center">
                    <span className="truncate pr-2">ISBN: {book.isbn}</span>
                    <span>{book.year}</span>
                  </div>
                </div>
                
                {isAdmin && (
                  <div className="bg-gray-50 p-1.5 flex justify-end space-x-1 border-t">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBook(book);
                              setShowEditForm(true);
                            }}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Bearbeiten</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBook(book);
                              setShowDeleteDialog(true);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Löschen</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full py-8 text-center text-gray-500">
            Keine Bücher gefunden.
          </div>
        )}
      </div>

      <BookForm
        open={showAddForm}
        onOpenChange={setShowAddForm}
        onSubmit={handleAdd}
      />

      <BookForm
        book={selectedBook || undefined}
        open={showEditForm}
        onOpenChange={(open) => {
          setShowEditForm(open);
          if (!open) setSelectedBook(null);
        }}
        onSubmit={(updates) => handleUpdate(updates)}
      />

      {selectedBook && (
        <BookDetails
          book={selectedBook}
          open={showDetailsDialog}
          onOpenChange={(open) => {
            setShowDetailsDialog(open);
            if (!open) setSelectedBook(null);
          }}
          onBookChange={onBookChange}
        />
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              book.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
