import { useState, useEffect } from "react";
import { Card, CardContent } from "./ui/card";
import { useAuth } from "@/hooks/useAuth";
import BookDetails from "./books/BookDetails";
import { Badge } from "./ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Button } from "./ui/button";
import { BookForm } from "./books/BookForm";
import { FetchedBook, Book as FullBookType } from "./dashboard/BookManagement";
import { NewBook, BookUpdate } from "@/lib/books";
import { useSupabase } from '@/contexts/SupabaseContext';
import { useToast } from "./ui/use-toast";
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
import { Edit, Plus, Trash2, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface BookGridProps {
  books?: FetchedBook[];
  onBookChange?: () => void;
}

export default function BookGrid({ books = [], onBookChange }: BookGridProps) {
  const { isAdmin } = useAuth();
  const supabase = useSupabase();
  const navigate = useNavigate();
  const [selectedBook, setSelectedBook] = useState<FetchedBook | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const { toast } = useToast();
  
  const handleAdd = async (bookData: NewBook) => {
    try {
      // Zuerst prüfen, ob ein Buch mit dieser ISBN bereits existiert
      const { data: existingBook, error: queryError } = await supabase
        .from("books")
        .select("id, title")
        .eq("isbn", bookData.isbn)
        .maybeSingle();

      if (queryError) {
        throw queryError;
      }

      // Wenn das Buch bereits existiert, zeige eine Fehlermeldung an
      if (existingBook) {
        toast({
          variant: "destructive",
          title: "Duplikat",
          description: `Ein Buch mit der ISBN ${bookData.isbn} existiert bereits: "${existingBook.title}"`
        });
        throw new Error(`Ein Buch mit dieser ISBN existiert bereits: ${existingBook.title}`);
      }

      // Verwende den authentifizierten Client
      const { data, error } = await supabase
        .from("books")
        .insert(bookData)
        .select();
      
      if (error) throw error;
      
      // Wenn ein Embedding erstellt werden soll, rufe die Edge-Funktion auf
      if (data && data.length > 0) {
        const newBookId = data[0].id;
        const createdBook = data[0] as FullBookType;
        
        try {
          // Rufe die createEmbeddings-Funktion mit dem authentifizierten Client auf
          const { data: embeddingData, error: embeddingError } = await supabase.functions.invoke('createEmbeddings', {
            body: { book_id: newBookId }
          });
          
          if (embeddingError) {
            console.warn("Fehler beim Erstellen des Embeddings:", embeddingError);
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
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Das Buch konnte nicht hinzugefügt werden. Bitte versuche es erneut."
      });
      
      throw error;
    }
  };
  
  const handleUpdate = async (bookData: BookUpdate) => {
    try {
      // Verwende den authentifizierten Client
      const { data, error } = await supabase
        .from("books")
        .update(bookData)
        .eq("id", bookData.id)
        .select();
      
      if (error) throw error;
      
      // Wenn das Embedding neu erstellt werden sollte
      if (data && data.length > 0) {
        const updatedBook = data[0] as FullBookType;
        if (updatedBook.embedding === null) {
          try {
            const { data: embeddingData, error: embeddingError } = await supabase.functions.invoke('createEmbeddings', {
              body: { book_id: bookData.id }
            });
            
            if (embeddingError) {
              console.warn("Fehler beim Erstellen des Embeddings:", embeddingError);
            }
          } catch (err) {
            console.warn("Fehler beim Aufruf der Embedding-Funktion:", err);
          }
        }
      }
      
      if (onBookChange) onBookChange();
      
      toast({
        title: "Buch aktualisiert",
        description: "Das Buch wurde erfolgreich aktualisiert."
      });
    } catch (error) {
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
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Das Buch konnte nicht gelöscht werden. Bitte versuche es erneut."
      });
    }
  };

  // Funktion zum Finden und Öffnen des PDFs
  const openPdfChat = async (book: FetchedBook) => {
    if (book.has_pdf && book.id) {
      navigate(`/chat/${book.id}`);
    } else {
      toast({
        variant: "default",
        title: "Kein PDF verfügbar",
        description: "Für dieses Buch ist leider kein PDF für den Chat vorhanden."
      });
    }
  };

  return (
    <div className="p-4">
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
        {Array.isArray(books) && books.length > 0 ? (
          books.map((book) => (
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
                  <div className="flex justify-between items-start">
                    <h3 className="font-medium text-base line-clamp-2 mb-1">{book.title}</h3>
                    {book.has_pdf && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 p-0 ml-1 shrink-0 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-full"
                              onClick={(e) => {
                                e.stopPropagation();
                                openPdfChat(book);
                              }}
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Chat mit PDF</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
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
