import React, { useState, useRef, useEffect, createContext, useContext, useCallback } from 'react';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { Send, FileText, User, ChevronDown, ChevronLeft, Loader2, RefreshCw } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { ScrollArea } from "../ui/scroll-area";
import { useToast } from '../ui/use-toast';
import { askPdfQuestion } from '@/lib/api';
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
  const { getToken } = useAuth();
  const { isAuthenticated } = useSupabaseAuth();
  
  // Speichere den Auth-Token in einer Ref für die Wiederverwendung
  const authTokenRef = useRef<string | null>(null);
  
  // Neue Ref zur Verfolgung, ob initial bereits geladen wurde
  const initialLoadDoneRef = useRef<boolean>(false);
  
  const fetchAuthToken = async (): Promise<string | null> => {
    // Wenn wir bereits einen Token haben, wiederverwendern wir ihn
    if (authTokenRef.current) {
      return authTokenRef.current;
    }
    
    // Ansonsten holen wir einen neuen Token
    if (isAuthenticated) {
      try {
        const token = await getToken({ template: 'supabase' });
        // Speichere den Token für zukünftige Verwendung
        authTokenRef.current = token;
        return token;
      } catch (error) {
        console.error('Fehler beim Abrufen des Auth-Tokens:', error);
        return null;
      }
    }
    return null;
  };
  
  const loadPdfs = async () => {
    if (!isAuthenticated) return;
    
    console.log("🔍 loadPdfs ausgeführt", new Date().toISOString(), "Authentifizierter Benutzer:", !!isAuthenticated, "Initial Load Done:", initialLoadDoneRef.current);
    
    setIsLoadingPdfs(true);
    try {
      // API-Endpunkt für den Zugriff auf Cloudflare R2
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const endpoint = `${apiUrl}/api/listPdfs`;
      
      // Auth-Token holen, wenn der Benutzer angemeldet ist
      const authToken = await fetchAuthToken();
      
      console.log("🔍 API Aufruf an", endpoint, "mit Auth-Token:", !!authToken);
      
      // Headers vorbereiten
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }
      
      // API-Anfrage senden
      const response = await fetch(endpoint, {
        method: "GET",
        headers
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data || !data.files) return;
      
      // PDF-Dateien formatieren
      const pdfFiles = data.files
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
      
      console.log("🔍 Gefundene PDFs:", pdfFiles.length, "Dateien");
      
      // Aktualisiere den State mit allen gefundenen PDFs
      setAvailablePdfs(pdfFiles);
      
      // Markiere, dass initial geladen wurde
      initialLoadDoneRef.current = true;
    } catch (error) {
      console.error('Fehler beim Laden der PDFs:', error);
    } finally {
      setIsLoadingPdfs(false);
    }
  };
  
  // Beim ersten Laden PDFs abrufen
  useEffect(() => {
    console.log("🔍 useEffect für Authentifizierung ausgelöst, isAuthenticated:", !!isAuthenticated);
    
    // Nur PDFs laden, wenn der Benutzer authentifiziert ist UND wir noch keine PDFs haben UND nicht bereits laden
    // UND nicht bereits einmal initial geladen haben
    if (isAuthenticated && availablePdfs.length === 0 && !isLoadingPdfs && !initialLoadDoneRef.current) {
      console.log("🔍 Lade PDFs, da Benutzer authentifiziert und keine PDFs vorhanden sind");
      loadPdfs();
    } else {
      console.log("🔍 Überspringe PDF-Laden, Grund:", 
        !isAuthenticated ? "Nicht authentifiziert" : 
        availablePdfs.length > 0 ? `Bereits ${availablePdfs.length} PDFs geladen` : 
        isLoadingPdfs ? "Ladevorgang bereits aktiv" : 
        initialLoadDoneRef.current ? "Initial Load bereits durchgeführt" : "Unbekannt");
    }
  }, [isAuthenticated, availablePdfs.length, isLoadingPdfs]);
  
  // Verwende useCallback für die refreshPdfs-Funktion
  const refreshPdfs = useCallback(async () => {
    if (isLoadingPdfs) {
      console.log("🔍 Überspringe manuellen Refresh, da Ladevorgang bereits aktiv");
      return;
    }
    
    console.log("🔍 Manueller Refresh ausgelöst");
    await loadPdfs();
  }, [isLoadingPdfs]);
  
  return (
    <PdfContext.Provider value={{ 
      availablePdfs, 
      isLoadingPdfs, 
      refreshPdfs,
      authToken: authTokenRef.current
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
    console.error('Fehler beim Speichern des PDF-Chat-Verlaufs:', error);
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
    console.error('Fehler beim Laden des PDF-Chat-Verlaufs:', error);
    return [];
  }
};

export function PdfChat({ open, onOpenChange, fullScreen = false, initialPdf }: PdfChatProps) {
  // Auth-Client holen
  const { supabase, isAuthenticated } = useSupabaseAuth();
  
  // PDF-Kontext nutzen
  const { availablePdfs, isLoadingPdfs, refreshPdfs, authToken } = usePdfContext();
  
  // State für PDF-Chat
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedPdf, setSelectedPdf] = useState<string>(initialPdf || '');
  const [selectedPdfName, setSelectedPdfName] = useState<string>('');
  const [pendingPdf, setPendingPdf] = useState<string | undefined>(initialPdf); // Speichert das zu ladende PDF
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [chatSessions, setChatSessions] = useState<PdfChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(`pdf-chat-${Date.now()}`);
  const [isMobile, setIsMobile] = useState(false);
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

  // Chat-Verlauf laden, wenn Komponente geöffnet wird
  useEffect(() => {
    if (open) {
      const history = loadPdfChatHistory();
      setChatSessions(history);
      
      // Wenn es initialPdf gibt, setze es als pendingPdf
      if (initialPdf) {
        setPendingPdf(initialPdf);
      }
      // Wenn es keinen aktiven Chat gibt, starte einen neuen
      else if (messages.length === 0 && selectedPdf === '') {
        setCurrentSessionId(`pdf-chat-${Date.now()}`);
      }
    }
  }, [open, initialPdf]);

  // Scroll zum Ende, wenn neue Nachrichten hinzugefügt werden
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Suche nach pendingPdf, wenn alle PDFs geladen sind
  useEffect(() => {
    if (pendingPdf && availablePdfs.length > 0) {
      console.log("Suche nach pendingPdf:", pendingPdf);
      const matchingPdf = availablePdfs.find(pdf => pdf.path === pendingPdf);
      
      if (matchingPdf) {
        console.log("PDF gefunden:", matchingPdf);
        // Das PDF wurde gefunden, wähle es aus
        setSelectedPdf(pendingPdf);
        setSelectedPdfName(matchingPdf.name);
        
        // Begrüßungsnachricht hinzufügen
        setMessages([{
          type: 'assistant',
          content: `Ich bin bereit, Fragen zu "${matchingPdf.name}" zu beantworten. Was möchten Sie wissen?`,
          timestamp: new Date()
        }]);
        
        // Zurücksetzen nach erfolgreicher Auswahl
        setPendingPdf(undefined);
      } else {
        console.warn(`PDF "${pendingPdf}" wurde nicht im Bucket gefunden`);
        toast({
          variant: "default",
          title: "PDF nicht gefunden",
          description: `Das PDF "${pendingPdf}" konnte nicht gefunden werden.`
        });
      }
    }
  }, [availablePdfs, pendingPdf, toast]);

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
    if (!inputValue.trim() || !selectedPdf || isLoading) return;
    
    console.log("📝 sendQuestion START", new Date().toISOString(), "SessionID:", currentSessionId);
    
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
      // API-Anfrage senden mit dem zwischengespeicherten Token
      console.log("🔍 Frage an PDF senden", selectedPdf, "Frage:", inputValue.substring(0, 50) + (inputValue.length > 50 ? "..." : ""));
      console.log("📝 VOR askPdfQuestion Aufruf", new Date().toISOString());
      const answer = await askPdfQuestion(
        selectedPdf, 
        inputValue,
        authToken || undefined
      );
      console.log("📝 NACH askPdfQuestion Aufruf", new Date().toISOString());
      console.log("🔍 Antwort erhalten von der API");
      
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
      console.log("📝 Chat-Session gespeichert", updatedSession.id);
    } catch (error: any) {
      console.error("Fehler bei der Anfrage:", error);
      console.log("📝 FEHLER bei askPdfQuestion", new Date().toISOString(), error.message);
      
      // Fehlermeldung als Nachricht anzeigen
      const errorMessage: Message = {
        type: 'assistant',
        content: `Bei der Verarbeitung ist ein Fehler aufgetreten: ${error.message || 'Unbekannter Fehler'}`,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorMessage]);
      
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error.message || "Bei der Verarbeitung ist ein Fehler aufgetreten."
      });
    } finally {
      setIsLoading(false);
      console.log("📝 sendQuestion ENDE", new Date().toISOString());
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
    <div className={`mb-4 flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[90%] items-start gap-2 ${message.type === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
        <Avatar className={`mt-1 ${message.type === 'user' ? 'bg-primary' : 'bg-muted'}`}>
          <AvatarFallback>
            {message.type === 'user' ? <User className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>
        <div className={`rounded-lg p-3 text-sm ${
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
            // Für Assistenten-Antworten den HTML-Inhalt rendern
            <div dangerouslySetInnerHTML={{ __html: message.content }} />
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
          
          {chatSessions.map((session) => (
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
            console.log("🔍 Refresh-Button geklickt, refreshPdfs aufgerufen", new Date().toISOString());
            // Nur aufrufen, wenn nicht bereits lädt
            if (!isLoadingPdfs) {
              refreshPdfs();
            } else {
              console.log("🔍 Refresh ignoriert, da bereits ein Ladevorgang aktiv ist");
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
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent 
        className={`p-0 gap-0 ${fullScreen ? 'w-screen h-screen max-w-none max-h-none rounded-none' : 'max-w-3xl w-[90vw] max-h-[90vh] h-[600px]'}`}
      >
        {isMobile && <MobileHeader />}
        
        <div className="flex h-full">
          {/* Linke Spalte: Chat-Verlauf (nur auf Desktop oder wenn geöffnet auf Mobil) */}
          {(!isMobile || showChatHistory) && (
            <div className={`${isMobile ? 'w-full absolute inset-0 bg-background z-10' : 'w-1/4'}`}>
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
          <div className={`flex flex-col ${(!isMobile || !showChatHistory) ? 'block' : 'hidden'} ${isMobile ? 'w-full' : 'w-3/4'}`}>
            {!isMobile && (
              <DialogHeader className="px-4 py-2 border-b text-left">
                <DialogTitle>PDF Chat</DialogTitle>
              </DialogHeader>
            )}
            
            {/* PDF-Selector */}
            <PdfSelector />
            
            {/* Chat-Bereich */}
            <div className="flex-1 overflow-hidden">
              {selectedPdf ? (
                <div className="flex flex-col h-full">
                  {/* Nachrichten-Bereich */}
                  <ScrollArea 
                    ref={scrollAreaRef} 
                    className="flex-1"
                  >
                    <div className="p-4">
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
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>
                  
                  {/* Eingabebereich */}
                  <div className="p-4 border-t">
                    <div className="flex gap-2">
                      <Input
                        ref={inputRef}
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
        </div>
      </DialogContent>
    </Dialog>
  );
} 