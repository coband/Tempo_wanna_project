import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { updateBook } from "@/lib/books";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/auth";

function BookDetails(props) {
  const { book, open, onOpenChange, onBookChange } = props;
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleAvailabilityToggle = async () => {
    if (!user) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Sie müssen eingeloggt sein, um Bücher auszuleihen.",
      });
      return;
    }

    setIsLoading(true);
    try {
      await updateBook(book.id, {
        available: !book.available,
        borrowed_by: !book.available ? null : user.id,
        borrowed_at: !book.available ? null : new Date().toISOString(),
      });

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] h-[90vh] overflow-y-auto">
        <DialogTitle className="text-2xl font-bold">{book.title}</DialogTitle>
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-gray-600 text-lg">{book.author}</p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-x-2">
              <Badge variant={book.available ? "default" : "secondary"}>
                {book.available ? "Verfügbar" : "Ausgeliehen"}
              </Badge>
              <Badge variant="outline">{book.subject}</Badge>
              <Badge variant="outline">{book.level}</Badge>
            </div>
            <Button
              onClick={handleAvailabilityToggle}
              disabled={isLoading}
              variant={book.available ? "default" : "secondary"}
            >
              {isLoading && (
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-b-transparent" />
              )}
              {book.available ? "Ausleihen" : "Zurückgeben"}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4 py-4 border-t border-b">
            <div>
              <p className="text-sm font-medium text-gray-500">ISBN</p>
              <p>{book.isbn}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">
                Erscheinungsjahr
              </p>
              <p>{book.year}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Standort</p>
              <p>{book.location}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Fach</p>
              <p>{book.subject}</p>
            </div>
          </div>

          {book.description && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Beschreibung</h3>
              <p className="text-gray-600 whitespace-pre-wrap">
                {book.description}
              </p>
            </div>
          )}

          {!book.available && book.borrowed_by && book.borrowed_at && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                Ausleih-Information
              </h3>
              <p className="text-sm text-gray-600">
                Ausgeliehen am:{" "}
                {new Date(book.borrowed_at).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default BookDetails;
