import * as React from 'react';
import { useState, useRef, useEffect, createContext, useContext, useCallback } from 'react';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { Send, FileText, User, ChevronDown, ChevronLeft, Loader2, RefreshCw } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { ScrollArea } from "../ui/scroll-area";
import { useToast } from '../ui/use-toast';
import { askPdfQuestion, fetchPdfs } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useAuth } from '@clerk/clerk-react';
import ReactMarkdown from 'react-markdown';

// Interface für eine Nachricht
interface Message {
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// Interface für gespeicherte PDF-Chats
interface PdfChatSession {
  id: string;
  pdfPath: string;
  pdfName: string;
  messages: Message[];
  timestamp: Date;
}

interface PdfChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fullScreen?: boolean;
  initialPdf?: string; // Pfad zu einem initial zu öffnenden PDF
}

// Hilfsfunktionen für localStorage
const storagePdfChatKey = 'pdf_chat_history';

interface SerializedPdfChatSession {
  id: string;
  pdfPath: string;
  pdfName: string;
  messages: Array<{
    type: 'user' | 'assistant';
    content: string;
    timestamp: string; // ISO Zeitstempel
  }>;
  timestamp: string; // ISO Zeitstempel
}

// Interface für PDF-Dateien
interface PdfFile {
  path: string;
  name: string;
}

// Neuer Kontext für die PDF-Dateien
interface PdfContextType {
  availablePdfs: PdfFile[];
  isLoadingPdfs: boolean;
  refreshPdfs: () => Promise<void>;
  authToken: string | null;
}

const PdfContext = createContext<PdfContextType>({
  availablePdfs: [],
  isLoadingPdfs: false,
  refreshPdfs: async () => {},
  authToken: null
});

// Provider für den PDF-Kontext
export function PdfProvider({ children }: { children: React.ReactNode }) {
  const [availablePdfs, setAvailablePdfs] = useState<PdfFile[]>([]);
  const [isLoadingPdfs, setIsLoadingPdfs] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const { getToken } = useAuth();
  
  // Neue Ref zur Verfolgung, ob initial bereits geladen wurde
  const initialLoadDoneRef = useRef<boolean>(false);
  
  const fetchAuthToken = async (): Promise<string | null> => {
    try {
      // Token von useAuth holen
      const token = await getToken();
      
      // Token im State speichern
      if (token) {
        setAuthToken(token);
      }
      
      return token;
    } catch (error) {
      console.error("Fehler beim Abrufen des Auth-Tokens:", error);
      return null;
    }
  };
  
  // Auth-Token beim Start holen
  useEffect(() => {
    if (!authToken) {
      fetchAuthToken();
    }
  }, []);
  
  const loadPdfs = async () => {
    setIsLoadingPdfs(true);
    try {
      // Frischen Auth-Token holen
      const currentToken = await fetchAuthToken();
      
      // Neue fetchPdfs-Funktion verwenden
      const files = await fetchPdfs(currentToken || undefined);
      
      // PDF-Dateien formatieren
      const pdfFiles = files
        .filter((file: any) => file.name.toLowerCase().endsWith('.pdf'))
        .map((file: any) => {
          // Entferne die ISBN-Nummer am Anfang (Format: ISBN_Name.pdf)
          const fileName = file.name.replace('.pdf', '');
          const parts = fileName.split('_');
          // Wenn es ein Unterstrich gibt und davor steht die ISBN, dann nutzen wir alles nach dem ersten Unterstrich
          const displayName = parts.length > 1 ? parts.slice(1).join('_') : fileName;
          
          return {
            path: file.name,
            name: displayName.replace(/_/g, ' ') // Unterstriche durch Leerzeichen ersetzen
          };
        });
      
      // Aktualisiere den State mit allen gefundenen PDFs
      setAvailablePdfs(pdfFiles);
      
      // Markiere, dass initial geladen wurde, aber nur wenn PDFs gefunden wurden
      if (pdfFiles.length > 0) {
        initialLoadDoneRef.current = true;
      }
    } catch (error) {
      // Fehler beim Laden der PDFs
      console.error("Fehler beim Laden der PDFs:", error);
    } finally {
      setIsLoadingPdfs(false);
    }
  };
  
  // Beim ersten Laden PDFs abrufen
  useEffect(() => {
    // Nur PDFs laden, wenn wir noch keine PDFs haben UND nicht bereits laden
    if (availablePdfs.length === 0 && !isLoadingPdfs && !initialLoadDoneRef.current) {
      loadPdfs();
    }
  }, [availablePdfs.length, isLoadingPdfs]);
  
  // Verwende useCallback für die refreshPdfs-Funktion
  const refreshPdfs = useCallback(async () => {
    if (isLoadingPdfs) {
      return;
    }
    
    // Neuen Token holen
    await fetchAuthToken();
    
    // Cache zurücksetzen, damit alle aktuellen Dateien neu geladen werden
    initialLoadDoneRef.current = false;
    // State leeren, damit neu geladen wird
    setAvailablePdfs([]);
    // PDFs neu laden
    await loadPdfs();
  }, [isLoadingPdfs]);
  
  return (
    <PdfContext.Provider value={{ 
      availablePdfs, 
      isLoadingPdfs, 
      refreshPdfs,
      authToken
    }}>
      {children}
    </PdfContext.Provider>
  );
}

// Hook zum Verwenden des PDF-Kontexts
export function usePdfContext() {
  return useContext(PdfContext);
}

// Funktionen für lokale Chat-Historie
const savePdfChatHistory = (session: PdfChatSession) => {
  try {
    // Bisherige Chats laden
    const savedChats = localStorage.getItem(storagePdfChatKey);
    let chats: SerializedPdfChatSession[] = savedChats ? JSON.parse(savedChats) : [];
    
    // Session serialisieren
    const serializedSession: SerializedPdfChatSession = {
      ...session,
      timestamp: session.timestamp.toISOString(),
      messages: session.messages.map(msg => ({
        ...msg,
        timestamp: msg.timestamp.toISOString()
      }))
    };
    
    // Aktuellen Chat aktualisieren oder hinzufügen
    const existingChatIndex = chats.findIndex(chat => chat.id === session.id);
    if (existingChatIndex >= 0) {
      chats[existingChatIndex] = serializedSession;
    } else {
      chats.push(serializedSession);
    }
    
    // Auf maximal 10 Chats begrenzen (die neuesten)
    const sortedChats = chats
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);
    
    localStorage.setItem(storagePdfChatKey, JSON.stringify(sortedChats));
  } catch (error) {
    // Fehler beim Speichern ignorieren
  }
};

const loadPdfChatHistory = (): PdfChatSession[] => {
  try {
    const saved = localStorage.getItem(storagePdfChatKey);
    if (!saved) return [];
    
    const parsed = JSON.parse(saved);
    
    // Serialisierte Sessions in richtige PdfChatSession-Objekte umwandeln
    return Array.isArray(parsed) ? parsed.map(chat => ({
      ...chat,
      timestamp: new Date(chat.timestamp),
      messages: chat.messages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }))
    })) : [];
  } catch (error) {
    return [];
  }
};

// Hauptkomponente für den PDF-Chat
export function PdfChat({ open, onOpenChange, fullScreen = false, initialPdf }: PdfChatProps) {
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPdf, setSelectedPdf] = useState('');
  const [selectedPdfName, setSelectedPdfName] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [pendingPdf, setPendingPdf] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState(`pdf-chat-${Date.now()}`);
  const [chatHistory, setChatHistory] = useState<PdfChatSession[]>([]);
  
  // Zugriff auf den PDF-Kontext
  const { availablePdfs, isLoadingPdfs, refreshPdfs, authToken } = usePdfContext();
  
  // Auth Hook für Direktzugriff
  const { getToken } = useAuth();
  
  // Speichere die aktuelle Fenstergröße in einen State
  const checkIfMobile = () => {
    if (typeof window !== "undefined") {
      return window.innerWidth < 768;
    }
    return false;
  };

  // Funktion zur Auswahl eines PDFs
  const handlePdfSelect = (pdfPath: string) => {
    // Nur aktualisieren, wenn sich die Auswahl geändert hat
    if (pdfPath !== selectedPdf) {
      const selectedPdfDetails = availablePdfs.find(pdf => pdf.path === pdfPath);
      
      if (selectedPdfDetails) {
        // Neuen Chat starten mit dem ausgewählten PDF
        setSelectedPdf(pdfPath);
        setSelectedPdfName(selectedPdfDetails.name);
        
        // Nachrichten zurücksetzen und Begrüßung hinzufügen
        setMessages([{
          type: 'assistant',
          content: `Ich bin bereit, Fragen zu "${selectedPdfDetails.name}" zu beantworten. Was möchten Sie wissen?`,
          timestamp: new Date()
        }]);
        
        // Neue Session-ID generieren
        setCurrentSessionId(`pdf-chat-${Date.now()}`);
        setInputValue('');
      }
    }
  };
  
  // UseEffect zum Laden der Chat-Historie beim ersten Rendern
  useEffect(() => {
    try {
      const history = loadPdfChatHistory();
      setChatHistory(history);
    } catch (error) {
      // Fehler beim Laden der Historie
    }
  }, []);
  
  // UseEffect zum Auto-Scrollen zu neuen Nachrichten
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  // Funktion zum Auto-Scrollen
  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };
  
  // UseEffect für das automatische Öffnen eines PDF, wenn eines übergeben wurde
  useEffect(() => {
    if (initialPdf && open) {
      // Prüfen, ob die verfügbaren PDFs bereits geladen sind
      if (availablePdfs.length > 0) {
        // Versuchen, das PDF zu finden
        const foundPdf = availablePdfs.find(pdf => pdf.path === initialPdf);
        
        if (foundPdf) {
          // PDF gefunden, auswählen
          handlePdfSelect(initialPdf);
        } else {
          // PDF nicht gefunden, aber wir merken es uns für später
          setPendingPdf(initialPdf);
        }
      } else {
        // PDFs noch nicht geladen, merken wir uns das zu öffnende PDF
        setPendingPdf(initialPdf);
      }
    }
  }, [initialPdf, open, availablePdfs]);
  
  // UseEffect für die Erkennung der Fenstergröße
  useEffect(() => {
    // Prüfe, ob wir im Browser sind
    if (typeof window !== "undefined") {
      // Initiale Prüfung
      setIsMobile(checkIfMobile());
      
      // Event-Listener für Größenänderungen
      const handleResize = () => {
        setIsMobile(checkIfMobile());
      };
      
      window.addEventListener('resize', handleResize);
      
      // Cleanup beim Unmount
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }
  }, []);
  
  // Versuche, ein pending PDF zu öffnen, sobald die PDFs geladen sind
  useEffect(() => {
    if (pendingPdf && availablePdfs.length > 0) {
      // Versuchen, das PDF zu finden
      const foundPdf = availablePdfs.find(pdf => pdf.path === pendingPdf);
      
      if (foundPdf) {
        // PDF gefunden, auswählen
        handlePdfSelect(pendingPdf);
        setPendingPdf(null); // Zurücksetzen des Pending-Status
      } else {
        // Versuch mit URL-decodiertem Pfad, falls er zuvor encodiert wurde
        const decodedPendingPdf = decodeURIComponent(pendingPdf);
        const foundDecodedPdf = availablePdfs.find(pdf => pdf.path === decodedPendingPdf);
        
        if (foundDecodedPdf) {
          handlePdfSelect(foundDecodedPdf.path);
          setPendingPdf(null);
          return;
        }
        
        // Versuch, nach ISBN im Dateinamen zu suchen
        const isbnMatch = pendingPdf.match(/(\d{10,13})[\s_\.]/);
        if (isbnMatch && isbnMatch[1]) {
          const isbn = isbnMatch[1];
          const foundByIsbn = availablePdfs.find(pdf => pdf.path.includes(isbn));
          
          if (foundByIsbn) {
            handlePdfSelect(foundByIsbn.path);
            setPendingPdf(null);
            return;
          }
        }
        
        // Falls das pendingPdf eine ISBN ist, gib eine konkretere Fehlermeldung aus
        if (pendingPdf.match(/^\d+\.pdf$/)) {
          const isbn = pendingPdf.replace('.pdf', '');
          toast({
            variant: "destructive",
            title: "PDF nicht gefunden",
            description: `Kein PDF mit ISBN ${isbn} konnte gefunden werden. Verfügbare PDFs: ${availablePdfs.length}`
          });
        } else {
          toast({
            variant: "destructive",
            title: "PDF nicht gefunden",
            description: `Das PDF "${pendingPdf}" konnte nicht gefunden werden. Prüfen Sie die R2 Bucket.`
          });
        }
      }
    }
  }, [availablePdfs, pendingPdf, toast, handlePdfSelect]);

  // Funktion zum Laden eines bestehenden Chats
  const loadChatSession = (session: PdfChatSession) => {
    setSelectedPdf(session.pdfPath);
    setSelectedPdfName(session.pdfName);
    setMessages(session.messages);
    setCurrentSessionId(session.id);
    setShowChatHistory(false);
  };

  // Funktion zum Starten eines neuen Chats
  const startNewChat = () => {
    setSelectedPdf('');
    setSelectedPdfName('');
    setMessages([]);
    setCurrentSessionId(`pdf-chat-${Date.now()}`);
    setShowChatHistory(false);
  };

  // Funktion zum Senden einer Frage
  const sendQuestion = async () => {
    if (!selectedPdf || !inputValue.trim() || isLoading) return;
    
    // Aktuellen Token abrufen, falls er inzwischen abgelaufen sein könnte
    let currentToken = authToken;
    
    // Kein Token? Versuche einen neuen zu bekommen
    if (!currentToken) {
      try {
        // Direkt getToken verwenden, statt useAuth innerhalb dieser Funktion
        currentToken = await getToken();
        
        if (!currentToken) {
          toast({
            title: "Authentifizierungsfehler",
            description: "Kein Authentifizierungs-Token verfügbar. Bitte neu anmelden.",
            variant: "destructive"
          });
        }
      } catch (tokenError) {
        console.error("Fehler beim Abrufen des Tokens:", tokenError);
        
        toast({
          title: "Authentifizierungsfehler",
          description: "Es gab ein Problem mit Ihrer Anmeldung. Bitte melden Sie sich erneut an.",
          variant: "destructive"
        });
        
        return; // Bei Token-Problemen nicht weitermachen
      }
    }
    
    const userMessage: Message = {
      type: 'user',
      content: inputValue,
      timestamp: new Date()
    };
    
    // Benutzeranfrage hinzufügen
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    
    try {
      // API-Anfrage senden mit dem aktuellen Token
      const answer = await askPdfQuestion(
        selectedPdf, 
        inputValue,
        currentToken || undefined
      );
      
      // Antwort hinzufügen
      const assistantMessage: Message = {
        type: 'assistant',
        content: answer,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
      // Chat-Session speichern
      const updatedSession: PdfChatSession = {
        id: currentSessionId,
        pdfPath: selectedPdf,
        pdfName: selectedPdfName,
        messages: [...messages, userMessage, assistantMessage],
        timestamp: new Date()
      };
      
      savePdfChatHistory(updatedSession);
    } catch (error: any) {
      console.error("PDF-Chat Fehler:", error);
      
      // Bei 401-Fehlern spezifischere Nachricht anzeigen
      const isAuthError = error.message.includes("401") || 
                          error.message.includes("Unauthorized") ||
                          error.message.includes("Authentifizierung");
      
      // Fehlermeldung als Nachricht anzeigen
      const errorMessage: Message = {
        type: 'assistant',
        content: isAuthError 
          ? "Authentifizierungsfehler: Bitte melden Sie sich erneut an und versuchen Sie es nochmal."
          : `Bei der Verarbeitung ist ein Fehler aufgetreten: ${error.message || 'Unbekannter Fehler'}`,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorMessage]);
      
      toast({
        variant: "destructive",
        title: isAuthError ? "Authentifizierungsfehler" : "Fehler bei der PDF-Verarbeitung",
        description: isAuthError 
          ? "Ihre Sitzung ist möglicherweise abgelaufen. Bitte melden Sie sich erneut an."
          : error.message || "Bei der Verarbeitung ist ein Fehler aufgetreten."
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuestion();
    }
  };

  // Komponente für den mobilen Header
  const MobileHeader = () => (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background p-3">
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={() => onOpenChange(false)}
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>
      <h2 className="text-lg font-semibold">PDF Chat</h2>
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={() => setShowChatHistory(!showChatHistory)}
      >
        <FileText className="h-5 w-5" />
      </Button>
    </div>
  );
  
  // Nachrichtenkomponente
  const MessageItem = ({ message }: { message: Message }) => (
    <div className="mb-4 last:mb-8">
      <div className="flex items-start gap-3 w-full">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src="" />
          <AvatarFallback>
            {message.type === 'user' ? <User className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>
        <div className={`rounded-lg p-3 text-sm w-full ${
          message.type === 'user' 
            ? 'bg-primary text-primary-foreground' 
            : 'bg-muted text-foreground'
        }`}>
          {message.type === 'user' ? (
            // Benutzeranfragen normal mit Zeilenumbrüchen anzeigen
            message.content.split('\n').map((line, i) => (
              <React.Fragment key={i}>
                {line}
                {i < message.content.split('\n').length - 1 && <br />}
              </React.Fragment>
            ))
          ) : (
            // Formatierte Anzeige der Assistenten-Antwort mit react-markdown
            <div className="prose dark:prose-invert max-w-none w-full">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Chat-Verlauf-Komponente
  const ChatHistoryPanel = () => (
    <div className="border-r h-full overflow-hidden">
      <div className="p-3 border-b">
        <h3 className="font-semibold">Chat-Verlauf</h3>
      </div>
      <ScrollArea className="h-[calc(100%-57px)]">
        <div className="p-2 space-y-2">
          <Button 
            variant="outline" 
            className="w-full justify-start" 
            onClick={startNewChat}
          >
            <FileText className="mr-2 h-4 w-4" />
            Neuer Chat
          </Button>
          
          {chatHistory.map((session) => (
            <Button 
              key={session.id}
              variant="ghost" 
              className="w-full justify-start text-left"
              onClick={() => loadChatSession(session)}
            >
              <FileText className="mr-2 h-4 w-4 shrink-0" />
              <div className="truncate">
                <span className="block font-medium truncate">{session.pdfName}</span>
                <span className="block text-xs text-muted-foreground truncate">
                  {new Date(session.timestamp).toLocaleDateString()}
                </span>
              </div>
            </Button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );

  // PDF-Auswahl-Komponente
  const PdfSelector = () => (
    <div className="p-4 border-b">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">PDF auswählen</h3>
        <Button 
          variant="ghost" 
          size="sm" 
          disabled={isLoadingPdfs}
          onClick={() => {
            // Nur aufrufen, wenn nicht bereits lädt
            if (!isLoadingPdfs) {
              refreshPdfs();
            }
          }}
          title="Liste aktualisieren"
        >
          <RefreshCw className={`h-4 w-4 ${isLoadingPdfs ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      
      {isLoadingPdfs ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <Select value={selectedPdf} onValueChange={handlePdfSelect}>
          <SelectTrigger>
            <SelectValue placeholder="PDF auswählen" />
          </SelectTrigger>
          <SelectContent>
            {availablePdfs.map((pdf) => (
              <SelectItem key={pdf.path} value={pdf.path}>
                {pdf.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Linke Spalte: Chat-Verlauf (nur auf Desktop oder wenn geöffnet auf Mobil) */}
      {(!isMobile || showChatHistory) && (
        <div className={`${isMobile ? 'w-full absolute inset-0 bg-background z-10' : 'w-1/4 h-full'} border-r`}>
          {isMobile && (
            <div className="flex items-center justify-between p-3 border-b">
              <h3 className="font-semibold">Chat-Verlauf</h3>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowChatHistory(false)}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </div>
          )}
          <ChatHistoryPanel />
        </div>
      )}
      
      {/* Rechte Spalte: Aktueller Chat */}
      <div 
        className={`${(!isMobile || !showChatHistory) ? 'flex' : 'hidden'} ${isMobile ? 'w-full' : 'w-3/4'} 
        flex-col h-full overflow-hidden`}
      >
        {!isMobile && (
          <div className="px-4 py-2 border-b">
            <h2 className="font-semibold">PDF Chat</h2>
          </div>
        )}
        
        {/* PDF-Selector */}
        <PdfSelector />
        
        {/* Chat-Bereich mit einfachen Höhenberechnungen */}
        {selectedPdf ? (
          <div className="flex flex-col flex-grow overflow-hidden" style={{ height: 'calc(100% - 70px)' }}>
            {/* Nachrichten-Container mit festem Overflow */}
            <div 
              className="flex-1 overflow-y-auto p-4 h-full" 
              ref={messagesEndRef}
              style={{ 
                overflowY: 'auto'
              }}
            >
              <div className="flex flex-col min-h-full">
                <div className="flex-1">
                  {messages.map((message, index) => (
                    <MessageItem key={index} message={message} />
                  ))}
                  {isLoading && (
                    <div className="flex justify-start mb-4">
                      <div className="bg-muted rounded-lg p-3 flex items-center">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span className="text-sm">Denke nach...</span>
                      </div>
                    </div>
                  )}
                </div>
                <div ref={messagesEndRef} className="h-4" />
              </div>
            </div>
            
            {/* Eingabebereich mit fester Höhe */}
            <div className="h-[70px] min-h-[70px] p-4 border-t flex items-center">
              <div className="flex gap-2 w-full">
                <Input
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyPress}
                  placeholder="Frage zu diesem PDF stellen..."
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button 
                  onClick={sendQuestion} 
                  disabled={!inputValue.trim() || isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <FileText className="h-12 w-12 mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">Bitte ein PDF auswählen</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Wählen Sie ein PDF aus der Liste oben, um Fragen dazu zu stellen.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}