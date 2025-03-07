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
    <div className="bg-white p-6 min-h-screen">
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Bücher</h2>
        {isAdmin && (
          <Button onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Buch hinzufügen
          </Button>
        )}
      </div>
      
      <BookFilter
        levels={LEVELS}
        selectedLevels={selectedLevels}
        onLevelChange={setSelectedLevels}
        schools={SCHOOLS}
        selectedSchool={selectedSchool}
        onSchoolChange={setSelectedSchool}
        types={BOOK_TYPES}
        selectedType={selectedType}
        onTypeChange={setSelectedType}
        subjects={SUBJECTS}
        selectedSubjects={selectedSubjects}
        onSubjectChange={setSelectedSubjects}
        yearRange={YEAR_RANGE}
        selectedYearRange={selectedYearRange}
        onYearRangeChange={setSelectedYearRange}
        selectedAvailability={selectedAvailability}
        onAvailabilityChange={setSelectedAvailability}
        locations={LOCATIONS}
        selectedLocation={selectedLocation}
        onLocationChange={setSelectedLocation}
        onClearFilters={clearFilters}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.isArray(filteredBooks) && filteredBooks.length > 0 ? (
          filteredBooks.map((book) => (
            <Card
              key={book.id}
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedBook(book);
                setShowDetailsDialog(true);
              }}
            >
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-lg">{book.title}</h3>
                    <p className="text-sm text-gray-600">{book.author}</p>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBook(book);
                          setShowEditForm(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBook(book);
                          setShowDeleteDialog(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="w-full">
                        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                          <Badge
                            variant={book.available ? "default" : "secondary"}
                          >
                            {book.available ? "Verfügbar" : "Ausgeliehen"}
                          </Badge>
                          <Badge variant="outline">{book.subject}</Badge>
                          <Badge variant="outline">{book.level}</Badge>
                          {book.type && (
                            <Badge variant="outline">{book.type}</Badge>
                          )}
                          {book.school && (
                            <Badge variant="outline">{book.school}</Badge>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Fach: {book.subject}</p>
                        <p>Stufe: {book.level}</p>
                        <p>Typ: {book.type || "Lehrmittel"}</p>
                        <p>Schulhaus: {book.school || "Chriesiweg"}</p>
                        <p>Standort: {book.location}</p>
                        <p>
                          Status: {book.available ? "Verfügbar" : "Ausgeliehen"}
                        </p>
                        {!book.available && book.borrowed_at && (
                          <p>
                            Ausgeliehen am:{" "}
                            {new Date(book.borrowed_at).toLocaleDateString()}
                          </p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">
                      ISBN: {book.isbn}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">
                      Jahr: {book.year}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full text-center py-8 text-gray-500">
            Keine Bücher gefunden
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
