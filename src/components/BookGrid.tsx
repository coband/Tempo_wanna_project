import { useState } from "react";
import { Card, CardContent } from "./ui/card";
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
  console.log("BookGrid received books:", books);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const { toast } = useToast();

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
        <Button onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Buch hinzufügen
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.isArray(books) && books.length > 0 ? (
          books.map((book) => (
            <Card key={book.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-lg">{book.title}</h3>
                    <p className="text-sm text-gray-600">{book.author}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedBook(book);
                        setShowEditForm(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedBook(book);
                        setShowDeleteDialog(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="w-full">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Badge>{book.subject}</Badge>
                          <Badge variant="outline">{book.level}</Badge>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Fach: {book.subject}</p>
                        <p>Stufe: {book.level}</p>
                        <p>Standort: {book.location}</p>
                        <p>
                          Status: {book.available ? "Verfügbar" : "Ausgeliehen"}
                        </p>
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
                      Year: {book.year}
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
