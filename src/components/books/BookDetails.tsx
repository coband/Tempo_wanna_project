import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useSupabase } from '@/contexts/SupabaseContext';
import type { FetchedBook, Book as FullBookType } from "../dashboard/BookManagement";
import { ArrowLeft, X, ChevronLeft, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface BookDetailsProps {
  book: FetchedBook;
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
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [bookData, setBookData] = useState<FetchedBook | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const supabase = useSupabase();
  const navigate = useNavigate();

  // Mobile Erkennung
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    // Initial check
    checkIfMobile();
    
    // Event listener für Fenstergrößenänderungen
    window.addEventListener('resize', checkIfMobile);
    
    // Cleanup
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  // Lade vollständige Buchdaten beim Öffnen des Dialogs
  useEffect(() => {
    if (!open || !initialBook?.id) return;
    
    const fetchCompleteBookData = async () => {
      try {
        setIsDataLoading(true);
        
        // Direktes Laden aus der Datenbank mit Fokus auf Verfügbarkeit
        const { data, error } = await supabase
          .from("books")
          .select("*")
          .eq("id", initialBook.id)
          .single();
          
        if (error) {
          // Fallback auf initialBook bei Fehler
          setBookData(initialBook);
          return;
        }
        
        if (data) {
          setBookData(data as unknown as FetchedBook);
        } else {
          setBookData(initialBook);
        }
      } catch (err) {
        setBookData(initialBook);
      } finally {
        setIsDataLoading(false);
      }
    };
    
    fetchCompleteBookData();
  }, [initialBook?.id, open, supabase]);

  // Wenn keine Daten geladen sind, zeige initialBook
  const book = bookData || initialBook;
  
  // Bestimme den Verfügbarkeitsstatus eindeutig
  // Explizite Konvertierung zu Boolean für konsistente Behandlung
  const isAvailable = bookData ? Boolean(bookData.available) : Boolean(initialBook.available);
  
  // PDF verfügbar?
  const hasPdf = bookData ? Boolean(bookData.has_pdf) : Boolean(initialBook.has_pdf);
  
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

    if (!isAvailable && !isBookBorrowedByCurrentUser) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Dieses Buch wurde von einem anderen Benutzer ausgeliehen.",
      });
      return;
    }

    setIsLoading(true);
    try {
      const updateData = isAvailable
        ? {
            available: false,
            borrowed_at: new Date().toISOString(),
            borrowed_by: user.id,
          }
        : {
            available: true,
            borrowed_at: null,
            borrowed_by: null,
          };
      
      const { error } = await supabase
        .from("books")
        .update(updateData)
        .eq("id", book.id);
        
      if (error) throw error;

      // Aktualisiere lokalen Status
      if (bookData) {
        setBookData({
          ...bookData,
          ...updateData,
        });
      }

      toast({
        title: "Erfolg",
        description: `Buch erfolgreich ${isAvailable ? "ausgeliehen" : "zurückgegeben"}.`,
      });

      if (onBookChange) {
        onBookChange();
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: `Fehler beim ${isAvailable ? "Ausleihen" : "Zurückgeben"} des Buchs.`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handler für das Öffnen des PDF-Chats
  const handleOpenPdfChat = () => {
    try {
      // Cloudflare R2 Bucket verwendet genau dieses Format: "ISBN _Titel.pdf"
      const pdfPath = `${book.isbn} _${book.title?.replace(/[^\w\säöüÄÖÜß]/g, '')}.pdf`;
      
      // Direkt zum PDF-Chat navigieren
      navigate(`/pdf-chat?pdf=${encodeURIComponent(pdfPath)}`);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Fehler beim Öffnen des PDF-Chats",
        description: error.message || "Das PDF konnte nicht geladen werden."
      });
    }
  };

  const isButtonDisabled =
    isLoading || isDataLoading || (!isAvailable && !isBookBorrowedByCurrentUser);

  // Mobile Header Komponente
  const MobileHeader = () => (
    <div className="fixed top-0 left-0 right-0 bg-white z-20 border-b px-4 py-3">
      <div className="flex items-center justify-between">
        <button 
          onClick={() => onOpenChange(false)}
          className="flex items-center text-gray-700"
        >
          <ChevronLeft className="h-5 w-5 mr-1" />
          <span>Zurück</span>
        </button>
        <div className="flex gap-2">
          {hasPdf && (
            <Button
              onClick={handleOpenPdfChat}
              variant="outline"
              size="sm"
              className="bg-blue-50 hover:bg-blue-100 text-blue-600"
            >
              <MessageCircle className="h-4 w-4 mr-1" />
              <span>Chat mit PDF</span>
            </Button>
          )}
          <Button
            onClick={handleAvailabilityToggle}
            disabled={isButtonDisabled}
            variant={isAvailable ? "default" : "secondary"}
            size="sm"
          >
            {(isLoading || isDataLoading) && (
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-b-transparent" />
            )}
            {isAvailable
              ? "Ausleihen"
              : isBookBorrowedByCurrentUser
                ? "Zurückgeben"
                : "Ausgeliehen"}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className={`
          ${isMobile 
            ? 'w-full h-[100vh] max-h-[100vh] max-w-full p-0 m-0 rounded-none inset-0 translate-x-0 translate-y-0 top-0 left-0' 
            : 'sm:max-w-[600px] max-h-[90vh]'
          } overflow-y-auto p-0
        `}
        style={isMobile ? {
          position: 'fixed',
          transform: 'none',
          height: '100dvh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column'
        } : {}}
      >
        <DialogDescription className="sr-only">
          Detailansicht für das Buch {book.title} von {book.author}
        </DialogDescription>
        {isMobile ? (
          <>
            <MobileHeader />
            <div className="pt-14 pb-6 flex-1 overflow-y-auto">
              {/* Mobile Titel & Autor Bereich */}
              <div className="px-4 py-5">
                <h1 className="text-2xl font-bold">{book.title}</h1>
                <p className="text-gray-600 text-lg mt-1">{book.author}</p>
              </div>
              
              {/* Mobile Status Bereich */}
              <div className="px-4 mb-4 flex flex-wrap gap-2">
                {isDataLoading ? (
                  <Badge variant="outline" className="bg-gray-100">Lädt...</Badge>
                ) : (
                  <Badge variant={isAvailable ? "default" : "secondary"} className="font-medium">
                    {isAvailable ? "Verfügbar" : "Ausgeliehen"}
                  </Badge>
                )}
                {book.subject && <Badge variant="outline">{book.subject}</Badge>}
                {book.level && <Badge variant="outline">{book.level}</Badge>}
                {book.type && <Badge variant="outline" className="bg-gray-100">{book.type}</Badge>}
              </div>
              
              {/* Mobile Buch Details */}
              <div className="px-4 space-y-5 pb-20">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 bg-gray-50 rounded-lg p-4">
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
                  <div>
                    <p className="text-sm font-medium text-gray-500">Typ</p>
                    <p className="font-medium">{book.type || "Keine Angabe"}</p>
                  </div>
                </div>

                {book.description && (
                  <div className="pt-3">
                    <h3 className="text-md font-semibold mb-2">Beschreibung</h3>
                    <p className="text-gray-600 whitespace-pre-wrap text-sm bg-gray-50 p-4 rounded-lg">
                      {book.description}
                    </p>
                  </div>
                )}

                {!isAvailable && book.borrowed_by && book.borrowed_at && (
                  <div className="pt-3">
                    <h3 className="text-md font-semibold mb-2">Ausleih-Information</h3>
                    <div className="bg-gray-50 p-4 rounded-lg text-sm">
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
            </div>
          </>
        ) : (
          <>
            {/* Desktop Version */}
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
                {isDataLoading ? (
                  <Badge variant="outline" className="bg-gray-100">Lädt...</Badge>
                ) : (
                  <Badge variant={isAvailable ? "default" : "secondary"} className="font-medium">
                    {isAvailable ? "Verfügbar" : "Ausgeliehen"}
                  </Badge>
                )}
                {book.subject && <Badge variant="outline">{book.subject}</Badge>}
                {book.level && <Badge variant="outline">{book.level}</Badge>}
                {book.type && <Badge variant="outline" className="bg-gray-100">{book.type}</Badge>}
              </div>
              <div className="flex gap-2">
                {hasPdf && (
                  <Button
                    onClick={handleOpenPdfChat}
                    variant="outline"
                    className="bg-blue-50 hover:bg-blue-100 text-blue-600"
                  >
                    <MessageCircle className="h-4 w-4 mr-1" />
                    <span>Chat mit PDF</span>
                  </Button>
                )}
                <Button
                  onClick={handleAvailabilityToggle}
                  disabled={isButtonDisabled}
                  variant={isAvailable ? "default" : "secondary"}
                  className="ml-2"
                >
                  {(isLoading || isDataLoading) && (
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-b-transparent" />
                  )}
                  {isAvailable
                    ? "Ausleihen"
                    : isBookBorrowedByCurrentUser
                      ? "Zurückgeben"
                      : "Ausgeliehen"}
                </Button>
              </div>
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
                <div>
                  <p className="text-sm font-medium text-gray-500">Typ</p>
                  <p className="font-medium">{book.type || "Keine Angabe"}</p>
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

              {!isAvailable && book.borrowed_by && book.borrowed_at && (
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default BookDetails;
