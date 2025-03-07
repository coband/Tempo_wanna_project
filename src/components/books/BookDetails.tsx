import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { updateBook } from "@/lib/books";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/auth";
import type { Book } from "@/lib/books";
import { X } from "lucide-react";

interface BookDetailsProps {
  book: Book;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBookChange?: () => void;
}

function BookDetails({
  book: initialBook,
  open,
  onOpenChange,
  onBookChange,
}: BookDetailsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [book, setBook] = useState(initialBook);
  const { toast } = useToast();
  const { user } = useAuth();

  // Update local book state when prop changes
  useEffect(() => {
    setBook(initialBook);
  }, [initialBook]);

  // Check if the current user is the one who borrowed the book
  const isBookBorrowedByCurrentUser = book.borrowed_by === user?.id;

  const handleAvailabilityToggle = async () => {
    if (!user) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Sie müssen eingeloggt sein, um Bücher auszuleihen.",
      });
      return;
    }

    // If book is not available and current user is not the borrower, they can't return it
    if (!book.available && !isBookBorrowedByCurrentUser) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          "Dieses Buch wurde von einem anderen Benutzer ausgeliehen.",
      });
      return;
    }

    setIsLoading(true);
    try {
      const updateData = {
        available: !book.available,
        borrowed_at: book.available ? new Date().toISOString() : null,
        borrowed_by: book.available ? user.id : null,
      };

      await updateBook(book.id, updateData);

      // Update local state immediately
      setBook((prev) => ({
        ...prev,
        ...updateData,
      }));

      toast({
        title: "Erfolg",
        description: `Buch erfolgreich ${book.available ? "ausgeliehen" : "zurückgegeben"}.`,
      });

      if (onBookChange) {
        onBookChange();
      }
    } catch (error) {
      console.error("Error toggling availability:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: `Fehler beim ${book.available ? "Ausleihen" : "Zurückgeben"} des Buchs.`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Determine if the borrow/return button should be disabled
  const isButtonDisabled =
    isLoading || (!book.available && !isBookBorrowedByCurrentUser);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto p-0">
        <div className="sticky top-0 z-10 bg-white p-6 pb-4 border-b">
          <div className="flex justify-between items-start">
            <DialogTitle className="text-2xl font-bold pr-6">{book.title}</DialogTitle>
            <DialogClose className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100">
              <X className="h-4 w-4" />
            </DialogClose>
          </div>
          <p className="text-gray-600 text-lg mt-1">{book.author}</p>
        </div>
        
        <div className="px-6 py-3 flex items-center justify-between border-b">
          <div className="flex flex-wrap gap-2">
            <Badge variant={book.available ? "default" : "secondary"} className="font-medium">
              {book.available ? "Verfügbar" : "Ausgeliehen"}
            </Badge>
            {book.subject && <Badge variant="outline">{book.subject}</Badge>}
            {book.level && <Badge variant="outline">{book.level}</Badge>}
          </div>
          <Button
            onClick={handleAvailabilityToggle}
            disabled={isButtonDisabled}
            variant={book.available ? "default" : "secondary"}
            className="ml-2"
          >
            {isLoading && (
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-b-transparent" />
            )}
            {book.available
              ? "Ausleihen"
              : isBookBorrowedByCurrentUser
                ? "Zurückgeben"
                : "Ausgeliehen"}
          </Button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <p className="text-sm font-medium text-gray-500">ISBN</p>
              <p className="font-medium">{book.isbn}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Erscheinungsjahr</p>
              <p className="font-medium">{book.year}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Standort</p>
              <p className="font-medium">{book.location}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Fach</p>
              <p className="font-medium">{book.subject}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Verlag</p>
              <p className="font-medium">{book.publisher || "Keine Angabe"}</p>
            </div>
          </div>

          {book.description && (
            <div className="mt-4 pt-4 border-t">
              <h3 className="text-md font-semibold mb-2">Beschreibung</h3>
              <p className="text-gray-600 whitespace-pre-wrap text-sm">
                {book.description}
              </p>
            </div>
          )}

          {!book.available && book.borrowed_by && book.borrowed_at && (
            <div className="mt-4 pt-4 border-t">
              <h3 className="text-md font-semibold mb-2">Ausleih-Information</h3>
              <div className="bg-gray-50 p-3 rounded-md text-sm">
                <p className="text-gray-600">
                  Ausgeliehen am: <span className="font-medium">{new Date(book.borrowed_at).toLocaleDateString()}</span>
                </p>
                {isBookBorrowedByCurrentUser && (
                  <p className="text-gray-600 mt-1">
                    Von Ihnen ausgeliehen
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default BookDetails;
