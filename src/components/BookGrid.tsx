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
import { Book, createBook, updateBook, deleteBook } from "@/lib/books";
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

export default function BookGrid({ books = [], onBookChange }: BookGridProps) {
  const { isAdmin } = useAuth();
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const { toast } = useToast();
  
  // Filter-States
  const [filteredBooks, setFilteredBooks] = useState<Book[]>(books);
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [selectedSchool, setSelectedSchool] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedYearRange, setSelectedYearRange] = useState<[number, number]>(YEAR_RANGE);
  const [selectedAvailability, setSelectedAvailability] = useState<boolean | null>(null);
  const [selectedLocation, setSelectedLocation] = useState("");
  
  // Bücher filtern, wenn sich Filter oder Bücher ändern
  useEffect(() => {
    let result = [...books];
    
    // Nach Klassenstufe filtern
    if (selectedLevels.length > 0) {
      result = result.filter(book => {
        // Wir teilen den level-String an Kommas, um alle Stufen zu erhalten
        const bookLevels = book.level?.split(', ') || [];
        // Wir prüfen, ob mindestens eine der ausgewählten Stufen im Buch vorkommt
        return selectedLevels.some(level => bookLevels.includes(level));
      });
    }
    
    // Nach Schulhaus filtern
    if (selectedSchool) {
      result = result.filter(book => book.school === selectedSchool);
    }
    
    // Nach Buchtyp filtern
    if (selectedType) {
      result = result.filter(book => book.type === selectedType);
    }
    
    // Nach Fach filtern
    if (selectedSubjects.length > 0) {
      result = result.filter(book => selectedSubjects.includes(book.subject));
    }
    
    // Nach Erscheinungsjahr filtern
    result = result.filter(book => {
      const year = book.year;
      return year >= selectedYearRange[0] && year <= selectedYearRange[1];
    });
    
    // Nach Verfügbarkeit filtern
    if (selectedAvailability !== null) {
      result = result.filter(book => book.available === selectedAvailability);
    }
    
    // Nach Standort filtern
    if (selectedLocation) {
      result = result.filter(book => book.location === selectedLocation);
    }
    
    setFilteredBooks(result);
  }, [
    books, 
    selectedLevels, 
    selectedSchool, 
    selectedType,
    selectedSubjects,
    selectedYearRange,
    selectedAvailability,
    selectedLocation
  ]);

  // Filter zurücksetzen
  const clearFilters = () => {
    setSelectedLevels([]);
    setSelectedSchool("");
    setSelectedType("");
    setSelectedSubjects([]);
    setSelectedYearRange(YEAR_RANGE);
    setSelectedAvailability(null);
    setSelectedLocation("");
  };
  
  const handleAdd = async (book: Omit<Book, "id">) => {
    try {
      await createBook(book);
      if (onBookChange) onBookChange();
    } catch (error) {
      console.error("Error adding book:", error);
      throw error;
    }
  };

  const handleEdit = async (book: Partial<Book>) => {
    if (!selectedBook) return;
    try {
      await updateBook(selectedBook.id, book);
      if (onBookChange) onBookChange();
    } catch (error) {
      console.error("Error updating book:", error);
      throw error;
    }
  };

  const handleDelete = async () => {
    if (!selectedBook) return;
    try {
      await deleteBook(selectedBook.id);
      if (onBookChange) onBookChange();

      toast({
        title: "Success",
        description: "Book deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting book:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete book",
      });
    } finally {
      setShowDeleteDialog(false);
      setSelectedBook(null);
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
          selectedLevels={selectedLevels}
          selectedSchool={selectedSchool}
          selectedType={selectedType}
          selectedSubjects={selectedSubjects}
          selectedYearRange={selectedYearRange}
          selectedAvailability={selectedAvailability}
          selectedLocation={selectedLocation}
          onLevelChange={setSelectedLevels}
          onSchoolChange={setSelectedSchool}
          onTypeChange={setSelectedType}
          onSubjectChange={setSelectedSubjects}
          onYearRangeChange={setSelectedYearRange}
          onAvailabilityChange={setSelectedAvailability}
          onLocationChange={setSelectedLocation}
          onClearFilters={clearFilters}
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
                  <p className="text-sm text-gray-500 line-clamp-1 mb-2">{book.author}</p>
                  
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
        book={selectedBook}
        open={showEditForm}
        onOpenChange={(open) => {
          setShowEditForm(open);
          if (!open) setSelectedBook(null);
        }}
        onSubmit={handleEdit}
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
