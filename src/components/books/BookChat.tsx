import React, { useState, useRef, useEffect } from 'react';
import { useSupabase } from '@/contexts/SupabaseContext';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import { Send, Book as BookIcon, User, X, Eye, Clock, ChevronDown, ChevronLeft, Loader2, Search, MessageCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { ScrollArea } from "../ui/scroll-area";
import BookDetails from "./BookDetails";
import { useToast } from '../ui/use-toast';
import type { Book } from '@/lib/books';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "../ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "../ui/tooltip";
import { useNavigate } from 'react-router-dom';

// Interface für Suchergebnisse, die von der Supabase-Funktion zurückgegeben werden
interface SearchBook {
  id: string;
  title: string;
  author: string;
  subject: string;
  level: string;
  description: string;
  similarity: number;
  available?: boolean; // Status der Verfügbarkeit
  has_pdf?: boolean;   // Flag, ob ein PDF vorhanden ist
  isbn?: string;       // ISBN des Buches für PDF-Zugriff
}

interface Message {
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface SearchSession {
  id: string;
  query: string;
  timestamp: Date;
  books: SearchBook[];
}

interface BookChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Hilfsfunktionen für localStorage
const storageSearchKey = 'book_search_history';

const saveSearchHistory = (session: SearchSession) => {
  try {
    localStorage.setItem(storageSearchKey, JSON.stringify({
      ...session,
      timestamp: session.timestamp.toISOString()
    }));
  } catch (error) {
    // Fehler beim Speichern des Suchverlaufs
  }
};

const loadSearchHistory = (): SearchSession | null => {
  try {
    const saved = localStorage.getItem(storageSearchKey);
    if (!saved) return null;
    
    const parsed = JSON.parse(saved);
    return {
      ...parsed,
      timestamp: new Date(parsed.timestamp)
    };
  } catch (error) {
    // Fehler beim Laden des Suchverlaufs
    return null;
  }
};

export function BookChat({ open, onOpenChange }: BookChatProps) {
  // Authentifizierten Supabase-Client vom Hook beziehen
  const supabase = useSupabase();
  const clerkAuth = useClerkAuth();
  const navigate = useNavigate();
  
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [books, setBooks] = useState<SearchBook[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [isLoadingBookDetails, setIsLoadingBookDetails] = useState(false);
  const [currentSearchQuery, setCurrentSearchQuery] = useState<string>('');
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [isMobile, setIsMobile] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [keyboardTransitioning, setKeyboardTransitioning] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const { toast } = useToast();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Überprüfen, ob Mobilgerät
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);
    
    return () => {
      window.removeEventListener('resize', checkIfMobile);
    };
  }, []);

  // Optimierte Keyboard-Erkennung für iOS Safari
  useEffect(() => {
    const handleVisualViewportResize = () => {
      const windowHeight = window.innerHeight;
      const visibleHeight = window.visualViewport?.height || windowHeight;
      const wasKeyboardOpen = keyboardOpen;
      const isKeyboardOpen = visibleHeight < windowHeight * 0.75;
      
      // Erkennen des Übergangs zwischen Tastatur auf/zu
      if (!wasKeyboardOpen && isKeyboardOpen) {
        // Tastatur wird geöffnet
        setKeyboardTransitioning(true);
        setTimeout(() => setKeyboardTransitioning(false), 500); // Animation dauert ca. 400ms
      } else if (wasKeyboardOpen && !isKeyboardOpen) {
        // Tastatur wird geschlossen
        setKeyboardTransitioning(true);
        setTimeout(() => setKeyboardTransitioning(false), 500);
      }
      
      setKeyboardOpen(isKeyboardOpen);
    };

    handleVisualViewportResize();
    
    window.addEventListener('resize', handleVisualViewportResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportResize);
      window.visualViewport.addEventListener('scroll', handleVisualViewportResize);
    }
    
    return () => {
      window.removeEventListener('resize', handleVisualViewportResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportResize);
        window.visualViewport.removeEventListener('scroll', handleVisualViewportResize);
      }
    };
  }, [keyboardOpen]);

  // Suchverlauf beim Komponenten-Laden abrufen
  useEffect(() => {
    if (open) {
      const history = loadSearchHistory();
      if (history) {
        setCurrentSessionId(history.id);
        setCurrentSearchQuery(history.query);
        setBooks(history.books);
        setShowResults(history.books.length > 0);
      }
    }
  }, [open]);

  // Scroll zum Ende, wenn neue Bücher hinzugefügt werden
  useEffect(() => {
    if (open && showResults) {
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }, [books, open, showResults]);

  useEffect(() => {
    // Wenn der Dialog geöffnet ist, verhindere das Scrollen des Hauptdokuments
    if (open && isMobile) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.height = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
    }
    
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
    };
  }, [open, isMobile]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSearch = async () => {
    if (!inputValue.trim()) return;
    
    // Speichere die Suchanfrage
    const searchQuery = inputValue;
    setCurrentSearchQuery(searchQuery);
    setInputValue('');
    setIsLoading(true);
    setShowResults(false);
    
    try {
      // Hole Clerk-Token für Supabase
      let authToken = null;
      try {
        authToken = await clerkAuth.getToken({ template: 'supabase' });
      } catch (tokenError) {
        console.warn("Fehler beim Abrufen des Auth-Tokens:", tokenError);
      }
      
      // Verwende Edge Function statt RPC
      let data;
      if (authToken) {
        const functionsUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search-books`;
        const response = await fetch(functionsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ query: searchQuery })
        });
        
        if (!response.ok) {
          throw new Error(`Fehler beim Aufruf der Suchfunktion: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        data = result.books || [];
      } else {
        // Alternativ: Supabase Functions API nutzen
        if (!supabase || !supabase.functions) {
          throw new Error("Supabase nicht verfügbar");
        }
        
        const { data: result, error } = await supabase.functions.invoke('search-books', {
          body: { query: searchQuery }
        });
        
        if (error) {
          throw new Error(`Fehler bei der Suche: ${error.message}`);
        }
        
        data = result.books || [];
      }
      
      if (data && Array.isArray(data) && data.length > 0) {
        // Überprüfe für jedes Buch, ob es ein PDF mit passender ISBN gibt
        const bucketName = import.meta.env.VITE_PDF_BUCKET_NAME || 'books';
        
        // PDFs im Bucket abrufen
        let pdfList: string[] = [];
        try {
          // Prüfe, ob supabase und storage verfügbar sind
          if (supabase && supabase.storage) {
            const { data: pdfData } = await supabase.storage
              .from(bucketName)
              .list();
            
            if (pdfData) {
              // Nur PDF-Dateien filtern
              pdfList = pdfData
                .filter(file => file.name.toLowerCase().endsWith('.pdf'))
                .map(file => file.name);
            }
          } else {
            console.warn("Supabase Storage nicht verfügbar");
          }
        } catch (error) {
          console.error("Fehler beim Abrufen der PDFs:", error);
        }
        
        // Bücher mit PDF-Flag versehen
        const booksWithPdfFlag = data.map(book => {
          // Prüfe zuerst, ob das Buch bereits ein has_pdf-Attribut aus der Datenbank hat
          if (book.has_pdf !== undefined) {
            return {
              ...book,
              has_pdf: Boolean(book.has_pdf)
            };
          }
          
          // Falls nicht, prüfe, ob ein PDF mit der ISBN existiert (exakt oder als Präfix)
          // Prüfe zuerst, ob ISBN vorhanden ist
          if (!book.isbn) {
            return {
              ...book,
              has_pdf: false
            };
          }
          
          const exactMatch = pdfList.includes(`${book.isbn}.pdf`);
          const prefixMatch = pdfList.some(pdf => pdf.startsWith(book.isbn));
          const hasPdf = exactMatch || prefixMatch;
          
          return {
            ...book,
            has_pdf: hasPdf
          };
        });
        
        // Speichere Suchsitzung
        const sessionId = `session_${Date.now()}`;
        const session: SearchSession = {
          id: sessionId,
          query: searchQuery,
          timestamp: new Date(),
          books: booksWithPdfFlag
        };
        
        setCurrentSessionId(sessionId);
        setBooks(booksWithPdfFlag);
        setShowResults(true);
        saveSearchHistory(session);
      } else {
        setBooks([]);
        toast({
          title: "Keine Ergebnisse",
          description: "Keine passenden Bücher gefunden. Bitte versuche einen anderen Suchbegriff.",
          variant: "default"
        });
      }
      
    } catch (error) {
      console.error("Fehler bei der Buchsuche:", error);
      
      toast({
        variant: "destructive",
        title: "Fehler bei der Suche",
        description: "Es ist ein Problem aufgetreten. Bitte versuche es später erneut."
      });
      
    } finally {
      setIsLoading(false);
      // Fokus wieder auf das Eingabefeld setzen
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
      e.preventDefault();
      handleSearch();
    }
  };

  const openBookDetails = async (searchBook: SearchBook) => {
    try {
      setIsLoadingBookDetails(true);
      
      // Transition-Effekt starten
      setIsTransitioning(true);
      
      // Hole Clerk-Token für Supabase
      let authToken = null;
      try {
        authToken = await clerkAuth.getToken({ template: 'supabase' });
      } catch (tokenError) {
        console.warn("Fehler beim Abrufen des Auth-Tokens:", tokenError);
      }
      
      // Sicherstellen, dass Supabase verfügbar ist
      if (!supabase) {
        throw new Error("Supabase nicht verfügbar");
      }
      
      // Lade vollständige Buchinformationen
      const { data: bookData, error } = await supabase
        .from('books')
        .select('id, title, author, isbn, subject, level, year, type, publisher, description, available, location, school, has_pdf, created_at, borrowed_at, borrowed_by')
        .eq('id', searchBook.id)
        .single();
      
      if (error) {
        throw error;
      }
      
      // Typumwandlung zu Book, da wir wissen, dass es ein Buch ist
      const typedBookData = bookData as unknown as Book;
      
      // Stellen Sie sicher, dass alle benötigten Eigenschaften in bookData enthalten sind
      const completeBookData = {
        ...typedBookData,
        id: typedBookData.id || searchBook.id,
        title: typedBookData.title || searchBook.title,
        author: typedBookData.author || searchBook.author,
        available: typeof typedBookData.available !== 'undefined' ? typedBookData.available : true,
        // Behalten Sie den has_pdf-Wert aus den DB-Daten bei, anstatt ihn zu überschreiben
        has_pdf: typeof typedBookData.has_pdf !== 'undefined' ? typedBookData.has_pdf : searchBook.has_pdf
      };
      
      // Vorbereitungen für den Übergang
      setSelectedBook(completeBookData as unknown as Book);
      
      // Schließe alle Dialoge (Mobile-Chat-Ansicht), bevor neue geöffnet werden
      if (isMobile) {
        // Wir behalten den Übergangseffekt und schließen den Chat
        onOpenChange(false);
        
        // Kurze Verzögerung, dann Details öffnen
        setTimeout(() => {
          setShowDetailsDialog(true);
          // Transition-Effekt nach einer weiteren kurzen Verzögerung beenden
          setTimeout(() => {
            setIsTransitioning(false);
          }, 300);
        }, 100);
      } else {
        // Auf Desktop können wir direkt setzen
        setShowDetailsDialog(true);
        // Transition-Effekt nach kurzer Verzögerung beenden
        setTimeout(() => {
          setIsTransitioning(false);
        }, 300);
      }
      
    } catch (error) {
      console.error("Fehler beim Laden der Buchdetails:", error);
      setIsTransitioning(false);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Die Buchdetails konnten nicht geladen werden."
      });
    } finally {
      setIsLoadingBookDetails(false);
    }
  };

  // Funktion zum Öffnen des PDF-Chats mit dem Buch
  const openPdfChat = async (book: SearchBook) => {
    try {
      // Transition-Effekt starten
      setIsTransitioning(true);
      
      // Wenn wir eine Buch-ID haben, navigiere einfach zur neuen /chat/:id Route
      if (book.id) {
        navigate(`/chat/${book.id}`);
        return;
      }

      // Fallback zur alten Methode, falls keine ID vorhanden ist
      // Prüfe ob supabase verfügbar ist
      if (!supabase || !supabase.storage) {
        throw new Error("Supabase Storage nicht verfügbar");
      }
      
      // Prüfe zuerst, ob ISBN vorhanden ist
      if (!book.isbn) {
        throw new Error("Keine ISBN für dieses Buch vorhanden");
      }
      
      const bucketName = import.meta.env.VITE_PDF_BUCKET_NAME || 'books';
      
      // Versuche zuerst, PDFs im Hauptverzeichnis des Buckets zu finden
      let { data, error } = await supabase.storage
        .from(bucketName)
        .list();
      
      if (error) {
        throw error;
      }
      
      // Unterordner im Bucket finden
      const folders = data?.filter(item => item.id === null) || [];
      let allPdfs: { name: string, fullPath: string }[] = [];
      
      // PDFs im Hauptverzeichnis hinzufügen
      let mainDirPdfs = data?.filter(file => file.name.toLowerCase().endsWith('.pdf')) || [];
      allPdfs = mainDirPdfs.map(file => ({ name: file.name, fullPath: file.name }));
      
      // In jedem Unterordner suchen
      for (const folder of folders) {
        const { data: folderFiles, error: folderError } = await supabase.storage
          .from(bucketName)
          .list(folder.name);
          
        if (!folderError && folderFiles) {
          // PDFs aus diesem Unterordner hinzufügen
          const folderPdfs = folderFiles.filter(file => file.name.toLowerCase().endsWith('.pdf'));
          allPdfs = [...allPdfs, ...folderPdfs.map(file => ({ 
            name: file.name, 
            fullPath: `${folder.name}/${file.name}` 
          }))];
        }
      }
      
      // Falls keine Dateien gefunden wurden, versuche die PDF-Dateien direkt zu laden
      if (allPdfs.length === 0) {
        // Versuche direkt eine Datei mit der ISBN zu laden
        const pdfPath = `${book.isbn}.pdf`;
        const { data: fileData } = await supabase.storage
          .from(bucketName)
          .getPublicUrl(pdfPath);
          
        if (fileData?.publicUrl) {
          navigate(`/pdf-chat?pdf=${encodeURIComponent(pdfPath)}`);
          return;
        }
        
        throw new Error("Keine PDFs gefunden");
      }
      
      // Nach PDF mit der ISBN als Präfix suchen
      const pdfNamePattern = new RegExp(`^${book.isbn}.*\\.pdf$`, 'i');
      const matchingPdf = allPdfs.find(file => pdfNamePattern.test(file.name));
      
      if (!matchingPdf) {
        throw new Error(`Kein PDF mit ISBN ${book.isbn} gefunden`);
      }
      
      // PDF gefunden, navigiere zur PDF-Chat-Seite mit dem PDF als Parameter
      navigate(`/pdf-chat?pdf=${encodeURIComponent(matchingPdf.fullPath)}`);
      
    } catch (error: any) {
      console.error("Fehler beim Öffnen des PDF-Chats:", error);
      setIsTransitioning(false);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error.message || "Das PDF konnte nicht geladen werden."
      });
    }
  };

  // Mobile Header Komponente
  const MobileHeader = () => {
    return (
      <div className="flex flex-col bg-white sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between p-3 border-b">
          <button 
            onClick={() => onOpenChange(false)}
            className="flex items-center text-gray-700 hover:text-blue-600 transition-colors"
          >
            <ChevronLeft className="h-5 w-5 mr-1" />
            <span>Zurück</span>
          </button>
          <h2 className="text-lg font-semibold">Bibliothekssuche</h2>
          <div className="w-8"></div> {/* Placeholder für Balance */}
        </div>
        
        {/* Info-Header mit Suchbegriff und Ergebnissen */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50">
          {currentSearchQuery && (
            <div className="px-4 py-2.5 text-gray-800 font-medium">
              Suche: <span className="text-blue-600 font-semibold">"{currentSearchQuery}"</span>
            </div>
          )}
          
          {showResults && books.length > 0 && (
            <div className="px-4 py-2.5 font-medium text-gray-700 border-t border-blue-100 flex items-center">
              <BookIcon className="h-4 w-4 mr-1.5 text-blue-500" />
              <span>Gefunden: <span className="font-semibold text-blue-600">({books.length})</span></span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Transition-Overlay für nahtlose Übergänge */}
      {isTransitioning && (
        <div 
          className="fixed inset-0 bg-white z-[9999] flex items-center justify-center"
          style={{
            opacity: 1,
            transition: 'opacity 0.3s ease-in-out'
          }}
        >
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      )}
      
      <Dialog open={open} onOpenChange={(newOpen) => {
        // Wenn Dialog geschlossen wird, während wir in Transition sind, ignorieren
        if (isTransitioning && !newOpen) return;
        onOpenChange(newOpen);
      }}>
        <DialogContent
          className={`
            ${isMobile 
              ? 'w-full h-[100dvh] max-h-[100dvh] max-w-full p-0 m-0 rounded-none inset-0 translate-x-0 translate-y-0 top-0 left-0' 
              : 'sm:max-w-[900px] max-h-[92vh]'
            } overflow-hidden flex flex-col
          `}
          style={isMobile ? {
            position: 'fixed',
            transform: 'none',
            zIndex: 9999,
            isolation: 'isolate',
            top: 0,
            bottom: 0,
            background: 'white',
            height: '-webkit-fill-available',
            width: '100%',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)', // iOS-sichere Randzone
            margin: 0
          } : {}}
        >
          {/* Backdrop für Tastatur-Transitionen */}
          {isMobile && (keyboardOpen || keyboardTransitioning) && (
            <div 
              className="fixed inset-0 bg-white" 
              style={{ 
                zIndex: 9990, 
                position: 'fixed', 
                top: 0, 
                left: 0, 
                right: 0, 
                bottom: 0,
                height: '-webkit-fill-available'
              }}
            />
          )}
         
          {/* Safari unterer Bar Overlay */}
          {isMobile && (
            <div 
              className="fixed left-0 right-0 bottom-0 bg-white" 
              style={{ 
                zIndex: 9995, 
                height: 'env(safe-area-inset-bottom, 20px)',
                bottom: 0
              }}
            />
          )}

          {isMobile ? (
            <>
              <MobileHeader />
              
              <div 
                className={`flex-1 overflow-hidden flex flex-col mt-0 ${keyboardOpen ? 'h-[60vh]' : 'flex-1'}`}
                style={{ 
                  position: 'relative', 
                  zIndex: 9996,
                  marginBottom: '60px' // Platz für Suchfeld unten
                }}
              >
                <ScrollArea 
                  className="flex-1 px-3 overflow-y-auto"
                  ref={scrollAreaRef}
                  style={{ background: 'white' }}
                >
                  {/* Ladezustand anzeigen */}
                  {isLoading && (
                    <div className="flex flex-col items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4" />
                      <p className="text-gray-600">Suche nach passenden Büchern...</p>
                    </div>
                  )}
                  
                  {/* Keine Ergebnisse */}
                  {!isLoading && showResults && books.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12">
                      <BookIcon className="h-8 w-8 text-gray-400 mb-4" />
                      <p className="text-gray-600 text-center mb-2">Keine passenden Bücher gefunden.</p>
                      <p className="text-gray-500 text-sm text-center">Versuche es mit einem anderen Suchbegriff.</p>
                    </div>
                  )}
                  
                  {/* Willkommensnachricht wenn keine Suche durchgeführt wurde */}
                  {!isLoading && !showResults && books.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12">
                      <BookIcon className="h-12 w-12 text-blue-500 mb-6" />
                      <h3 className="text-xl font-medium text-gray-800 mb-3 text-center">Nach was für einem Lehrmittel/Buch suchst du?</h3>
                      <p className="text-gray-600 text-center max-w-xs">
                        Gib deine Suche unten ein, z.B. nach Thema, Fach, Klassenstufe oder konkretem Lerninhalt.
                      </p>
                    </div>
                  )}
                  
                  {/* Buchergebnisse */}
                  {!isLoading && showResults && books.length > 0 && (
                    <div className="py-3 pb-4">
                      <div className="grid grid-cols-1 gap-3">
                        {books.map((book) => {
                          return (
                          <Card 
                            key={book.id} 
                            className="hover:shadow-md transition-shadow border-l-4 overflow-hidden shadow-sm"
                            style={{ borderLeftColor: book.available === false ? '#f87171' : '#4ade80' }}
                          >
                            <CardContent className="p-3">
                              <div className="flex justify-between items-start gap-2">
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-semibold text-md line-clamp-1">{book.title}</h3>
                                  <p className="text-xs text-gray-600 mb-1">{book.author}</p>
                                  
                                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                    <Badge variant="outline" className="text-xs px-1.5 py-0 h-5">{book.subject}</Badge>
                                    <Badge variant="outline" className="text-xs px-1.5 py-0 h-5">{book.level}</Badge>
                                    <Badge 
                                      variant="secondary"
                                      className="ml-auto text-xs px-1.5 py-0 h-5"
                                    >
                                      {(book.similarity * 100).toFixed()}%
                                    </Badge>
                                  </div>
                                  
                                  <p className="text-xs text-gray-700 line-clamp-2">{book.description}</p>
                                </div>
                                
                                <div className="flex flex-col items-end gap-1.5 ml-1 shrink-0">
                                  {book.has_pdf && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-7 w-7 p-0 shrink-0 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-full"
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
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openBookDetails(book);
                                    }}
                                    disabled={isLoadingBookDetails}
                                  >
                                    <Eye className="h-3 w-3 mr-1" />
                                    Details
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                          );
                        })}
                      </div>
                      <div ref={messagesEndRef} className="h-2" />
                    </div>
                  )}
                </ScrollArea>
              </div>

              <div 
                className={`border-t py-3 px-3 flex flex-shrink-0 fixed bottom-0 left-0 right-0 bg-white shadow-lg ${keyboardOpen ? 'mb-0' : ''}`}
                style={{ 
                  position: 'fixed', 
                  zIndex: 9997,
                  paddingBottom: 'calc(env(safe-area-inset-bottom, 8px) + 8px)'
                }}
              >
                <div className="flex gap-2 w-full">
                  <Input
                    ref={inputRef}
                    placeholder="Ich suche..."
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyPress}
                    onClick={() => {
                      // Fokus setzen beim Klick - verhindert Flackern
                      if (isMobile) {
                        setKeyboardTransitioning(true);
                        setTimeout(() => setKeyboardTransitioning(false), 500);
                      }
                    }}
                    disabled={isLoading}
                    className="flex-1 text-[16px] h-10 rounded-full border-blue-100 focus-visible:ring-blue-400"
                    style={{ 
                      touchAction: "manipulation",
                      WebkitAppearance: "none",
                      fontSize: "16px"
                    }}
                  />
                  <Button 
                    onClick={handleSearch} 
                    disabled={isLoading || !inputValue.trim()}
                    size="icon"
                    className="h-10 w-10 rounded-full bg-blue-500 hover:bg-blue-600"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <DialogHeader className="border-b pb-4 mb-0">
                <div>
                  <DialogTitle className="text-xl font-semibold mb-1">Buch-Suche</DialogTitle>
                  <DialogDescription className="text-base">
                    Durchsuche die Bibliothek nach Büchern und Lehrmitteln
                  </DialogDescription>
                </div>
              </DialogHeader>
              
              <div className="flex-1 overflow-hidden flex flex-col h-[65vh]">
                <div className="mb-3">
                  {currentSearchQuery && (
                    <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-md text-gray-800 font-medium">
                      Aktuelle Suche: <span className="text-blue-600 font-semibold">"{currentSearchQuery}"</span>
                    </div>
                  )}
                </div>
                
                <ScrollArea className="flex-1 pr-4 mb-2 max-h-full overflow-y-auto" ref={scrollAreaRef}>
                  {/* Ladezustand anzeigen */}
                  {isLoading && (
                    <div className="flex flex-col items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4" />
                      <p className="text-gray-600">Suche nach passenden Büchern...</p>
                    </div>
                  )}
                  
                  {/* Keine Ergebnisse */}
                  {!isLoading && showResults && books.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12">
                      <BookIcon className="h-8 w-8 text-gray-400 mb-4" />
                      <p className="text-gray-600 text-center mb-2">Keine passenden Bücher gefunden.</p>
                      <p className="text-gray-500 text-sm text-center">Versuche es mit einem anderen Suchbegriff.</p>
                    </div>
                  )}

                  {/* Willkommensnachricht wenn keine Suche durchgeführt wurde */}
                  {!isLoading && !showResults && books.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12">
                      <BookIcon className="h-12 w-12 text-blue-500 mb-6" />
                      <h3 className="text-xl font-medium text-gray-800 mb-3 text-center">Nach was für einem Lehrmittel/Buch suchst du?</h3>
                      <p className="text-gray-600 text-center max-w-md">
                        Gib deine Suche unten ein, z.B. nach Thema, Fach, Klassenstufe oder konkretem Lerninhalt.
                      </p>
                    </div>
                  )}

                  {showResults && books.length > 0 && (
                    <div className="mb-4">
                      <h3 className="text-lg font-medium mb-3 flex items-center">
                        <BookIcon className="h-5 w-5 mr-2 text-blue-500" />
                        Gefundene Bücher ({books.length})
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[58vh] overflow-y-auto pr-2">
                        {books.map((book) => {
                          return (
                          <Card 
                            key={book.id} 
                            className="overflow-hidden border-l-4 shadow-sm hover:shadow-md transition-shadow"
                            style={{ borderLeftColor: book.available === false ? '#f87171' : '#4ade80' }}
                          >
                            <CardContent className="p-3">
                              <div className="flex justify-between items-start gap-2">
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-semibold text-md line-clamp-1">{book.title}</h4>
                                  <p className="text-xs text-gray-600 mb-1">{book.author}</p>
                                  
                                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                    <Badge variant="outline" className="text-xs px-1.5 py-0 h-5">{book.subject}</Badge>
                                    <Badge variant="outline" className="text-xs px-1.5 py-0 h-5">{book.level}</Badge>
                                    <Badge 
                                      variant="secondary"
                                      className="ml-auto text-xs px-1.5 py-0 h-5"
                                    >
                                      {(book.similarity * 100).toFixed()}%
                                    </Badge>
                                  </div>
                                  
                                  <p className="text-xs text-gray-700 line-clamp-2">{book.description}</p>
                                </div>
                                
                                <div className="flex flex-col items-end gap-1.5 ml-1 shrink-0">
                                  {book.has_pdf && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-7 w-7 p-0 shrink-0 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-full"
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
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openBookDetails(book);
                                    }}
                                    disabled={isLoadingBookDetails}
                                  >
                                    <Eye className="h-3 w-3 mr-1" />
                                    Details
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </ScrollArea>
              </div>

              <DialogFooter className="flex-shrink-0 sm:justify-between border-t pt-4">
                <div className="flex gap-2 w-full">
                  <Input
                    ref={inputRef}
                    placeholder="Ich suche..."
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyPress}
                    disabled={isLoading}
                    className="flex-1 rounded-full border-blue-100 focus-visible:ring-blue-400"
                  />
                  <Button 
                    onClick={handleSearch} 
                    disabled={isLoading || !inputValue.trim()}
                    className="rounded-full px-4 bg-blue-500 hover:bg-blue-600"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Suche
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4 mr-2" />
                        Suchen
                      </>
                    )}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Die BookDetails-Komponente wird komplett getrennt und außerhalb aller Dialoge gerendert */}
      {selectedBook && (
        <BookDetails
          book={selectedBook}
          open={showDetailsDialog}
          onOpenChange={(open) => {
            if (!open && isMobile) {
              // Wenn Details-Dialog geschlossen wird, zeigen wir Übergangseffekt
              setIsTransitioning(true);
            }
            
            setShowDetailsDialog(open);
            
            if (!open) {
              // Wenn Details-Dialog geschlossen wird
              if (isMobile) {
                // Kurze Verzögerung, dann Chat wieder öffnen und Transition beenden
                setTimeout(() => {
                  onOpenChange(true);
                  setTimeout(() => {
                    setIsTransitioning(false);
                    setSelectedBook(null);
                  }, 100);
                }, 100);
              } else {
                setSelectedBook(null);
              }
            }
          }}
          onBookChange={() => {}}
        />
      )}
    </>
  );
} 