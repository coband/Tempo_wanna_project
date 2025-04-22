import React, { useState, useRef, useEffect } from 'react';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { Send, FileText, User, ChevronDown, ChevronLeft, Loader2 } from 'lucide-react';
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

export function PdfChat({ open, onOpenChange, fullScreen = false }: PdfChatProps) {
  // Auth-Client holen
  const { supabase, isAuthenticated } = useSupabaseAuth();
  const { getToken } = useAuth();
  
  // State für PDF-Chat
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedPdf, setSelectedPdf] = useState<string>('');
  const [selectedPdfName, setSelectedPdfName] = useState<string>('');
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [chatSessions, setChatSessions] = useState<PdfChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(`pdf-chat-${Date.now()}`);
  const [isMobile, setIsMobile] = useState(false);
  const [availablePdfs, setAvailablePdfs] = useState<Array<{path: string, name: string}>>([]);
  const [isLoadingPdfs, setIsLoadingPdfs] = useState(false);
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
      
      // Wenn es keinen aktiven Chat gibt, starte einen neuen
      if (messages.length === 0 && selectedPdf === '') {
        setCurrentSessionId(`pdf-chat-${Date.now()}`);
      }
    }
  }, [open]);

  // Scroll zum Ende, wenn neue Nachrichten hinzugefügt werden
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

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
      // Auth-Token holen, wenn der Benutzer angemeldet ist
      let authToken = null;
      if (isAuthenticated) {
        authToken = await getToken({ template: 'supabase' });
      }
      
      // API-Anfrage senden
      const answer = await askPdfQuestion(
        selectedPdf, 
        inputValue,
        authToken || undefined
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
      toast({
        title: "Fehler",
        description: `Die Anfrage konnte nicht verarbeitet werden: ${error.message}`,
        variant: "destructive"
      });
      console.error("Fehler bei der PDF-Anfrage:", error);
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

  const handlePdfSelect = (pdfPath: string) => {
    const selectedPdfInfo = availablePdfs.find(pdf => pdf.path === pdfPath);
    
    if (selectedPdfInfo) {
      setSelectedPdf(pdfPath);
      setSelectedPdfName(selectedPdfInfo.name);
      
      // Neue Session beginnen
      if (messages.length > 0) {
        startNewChat();
      }
      
      // Begrüßungsnachricht hinzufügen
      setMessages([{
        type: 'assistant',
        content: `Ich bin bereit, Fragen zu "${selectedPdfInfo.name}" zu beantworten. Was möchten Sie wissen?`,
        timestamp: new Date()
      }]);
    }
  };

  // PDFs aus dem Supabase-Bucket laden
  const fetchPdfsFromBucket = async () => {
    if (!supabase) {
      console.error('Supabase-Client nicht initialisiert');
      return;
    }

    setIsLoadingPdfs(true);
    try {
      // Bucket-Name aus Umgebungsvariablen oder Standardwert
      const bucketName = import.meta.env.VITE_PDF_BUCKET_NAME || 'books';
      
      // Alle Dateien im Bucket auflisten
      const { data, error } = await supabase.storage
        .from(bucketName)
        .list();
      
      if (error) {
        throw error;
      }
      
      if (data) {
        // Nur PDF-Dateien filtern
        const pdfFiles = data
          .filter(file => file.name.toLowerCase().endsWith('.pdf'))
          .map(file => ({
            path: file.name,
            // Dateinamen für Anzeige formatieren (Erweiterung entfernen und Unterstriche durch Leerzeichen ersetzen)
            name: file.name
              .replace('.pdf', '')
              .replace(/_/g, ' ')
          }));
        
        setAvailablePdfs(pdfFiles);
      }
    } catch (error: any) {
      console.error('Fehler beim Laden der PDFs:', error);
      toast({
        title: "Fehler",
        description: `PDF-Dateien konnten nicht geladen werden: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setIsLoadingPdfs(false);
    }
  };

  // PDFs laden, wenn die Komponente geöffnet wird und der Benutzer authentifiziert ist
  useEffect(() => {
    if (open && isAuthenticated) {
      fetchPdfsFromBucket();
    }
  }, [open, isAuthenticated, supabase]);

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
          {/* Text mit Zeilenumbrüchen formatieren */}
          {message.content.split('\n').map((line, i) => (
            <React.Fragment key={i}>
              {line}
              {i < message.content.split('\n').length - 1 && <br />}
            </React.Fragment>
          ))}
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

  // Wenn es ein Vollbild-Chat ist, zeigen wir den Chat direkt an
  if (fullScreen) {
    return (
      <div className="h-screen w-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-3 bg-white">
          <h2 className="text-xl font-bold">PDF Chat</h2>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowChatHistory(!showChatHistory)}
            >
              <FileText className="h-4 w-4 mr-2" />
              Chat-Verlauf
            </Button>
          </div>
        </div>
        
        {/* Main content */}
        <div className="flex flex-1 h-[calc(100vh-61px)] overflow-hidden">
          {/* Chat history sidebar */}
          {showChatHistory && (
            <div className="w-72 border-r h-full overflow-hidden bg-white">
              <div className="p-3 border-b flex items-center justify-between">
                <h3 className="font-semibold">Chat-Verlauf</h3>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setShowChatHistory(false)}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
              </div>
              <ChatHistoryPanel />
            </div>
          )}
          
          {/* Chat area */}
          <div className={`flex flex-col flex-1 ${showChatHistory ? '' : 'w-full'}`}>
            {/* PDF-Auswahl (nur wenn kein PDF ausgewählt oder keine Nachrichten) */}
            {(!selectedPdf || messages.length === 0) && (
              <div className="p-4 border-b">
                <label className="block text-sm font-medium mb-2">PDF auswählen</label>
                <Select value={selectedPdf} onValueChange={handlePdfSelect} disabled={isLoadingPdfs}>
                  <SelectTrigger>
                    <SelectValue placeholder={isLoadingPdfs ? "Lade PDFs..." : "PDF auswählen"} />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingPdfs ? (
                      <div className="flex items-center justify-center p-2">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span>Lade PDFs...</span>
                      </div>
                    ) : availablePdfs.length > 0 ? (
                      availablePdfs.map((pdf) => (
                        <SelectItem key={pdf.path} value={pdf.path}>
                          {pdf.name}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-2 text-center text-muted-foreground">
                        Keine PDF-Dokumente gefunden
                      </div>
                    )}
                  </SelectContent>
                </Select>
                {!isAuthenticated && (
                  <p className="mt-2 text-sm text-amber-600">
                    Bitte melden Sie sich an, um auf PDF-Dokumente zuzugreifen.
                  </p>
                )}
              </div>
            )}
            
            {/* Ausgewähltes PDF anzeigen, wenn vorhanden */}
            {selectedPdf && (
              <Collapsible className="border-b">
                <CollapsibleTrigger className="flex w-full items-center justify-between p-3 text-left">
                  <div className="flex items-center">
                    <FileText className="mr-2 h-4 w-4" />
                    <span className="font-medium">{selectedPdfName}</span>
                  </div>
                  <ChevronDown className="h-4 w-4" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-3 pb-3">
                    <Button variant="outline" size="sm" className="w-full" onClick={startNewChat}>
                      Neuen Chat starten
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
            
            {/* Chat-Nachrichten */}
            <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
              <div className="space-y-4 max-w-[900px] mx-auto">
                {messages.map((message, index) => (
                  <MessageItem key={index} message={message} />
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex max-w-[90%] items-start gap-2">
                      <Avatar className="mt-1 bg-muted">
                        <AvatarFallback>
                          <FileText className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="rounded-lg p-4 bg-muted text-foreground text-sm">
                        <div className="flex items-center gap-2 mb-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="font-medium">Verarbeite Anfrage...</span>
                        </div>
                        <p className="text-muted-foreground">
                          Die Analyse des PDF-Dokuments und die Generierung einer präzisen Antwort kann 
                          einige Momente dauern. Je nach Größe und Komplexität des Dokuments 
                          kann dieser Vorgang zwischen 10-30 Sekunden beanspruchen.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            
            {/* Eingabefeld */}
            <div className="border-t p-4 bg-white">
              <div className="flex gap-2 max-w-[900px] mx-auto">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyPress}
                  placeholder="Stellen Sie eine Frage..."
                  disabled={isLoading || !selectedPdf}
                  className="flex-1"
                />
                <Button 
                  onClick={sendQuestion} 
                  disabled={isLoading || !inputValue.trim() || !selectedPdf}
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
        </div>
      </div>
    );
  }

  // Ursprünglicher Dialog-Modus für nicht-Vollbild
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${isMobile ? 'h-[100dvh] p-0 max-h-none w-full max-w-full m-0 rounded-none' : 'max-h-[90vh] w-full max-w-[90vw]'}`}>
        {!isMobile && (
          <DialogHeader>
            <DialogTitle>PDF Chat</DialogTitle>
          </DialogHeader>
        )}
        
        <div className={`flex h-full ${isMobile ? 'flex-col' : 'gap-4'}`}>
          {/* Mobile Header */}
          {isMobile && <MobileHeader />}
          
          {/* Chat Verlauf (auf Mobilgeräten als Overlay) */}
          {(showChatHistory || !isMobile) && (
            <div className={`
              ${isMobile 
                ? 'absolute inset-0 z-20 bg-background' 
                : 'w-1/5 min-w-[200px]'
              }
            `}>
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
          
          {/* Haupt-Chat-Bereich */}
          <div className={`flex flex-col ${isMobile ? 'flex-1' : 'w-4/5'}`}>
            {/* PDF-Auswahl (nur wenn kein PDF ausgewählt oder keine Nachrichten) */}
            {(!selectedPdf || messages.length === 0) && (
              <div className="p-4 border-b">
                <label className="block text-sm font-medium mb-2">PDF auswählen</label>
                <Select value={selectedPdf} onValueChange={handlePdfSelect} disabled={isLoadingPdfs}>
                  <SelectTrigger>
                    <SelectValue placeholder={isLoadingPdfs ? "Lade PDFs..." : "PDF auswählen"} />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingPdfs ? (
                      <div className="flex items-center justify-center p-2">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span>Lade PDFs...</span>
                      </div>
                    ) : availablePdfs.length > 0 ? (
                      availablePdfs.map((pdf) => (
                        <SelectItem key={pdf.path} value={pdf.path}>
                          {pdf.name}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-2 text-center text-muted-foreground">
                        Keine PDF-Dokumente gefunden
                      </div>
                    )}
                  </SelectContent>
                </Select>
                {!isAuthenticated && (
                  <p className="mt-2 text-sm text-amber-600">
                    Bitte melden Sie sich an, um auf PDF-Dokumente zuzugreifen.
                  </p>
                )}
              </div>
            )}
            
            {/* Ausgewähltes PDF anzeigen, wenn vorhanden */}
            {selectedPdf && (
              <Collapsible className="border-b">
                <CollapsibleTrigger className="flex w-full items-center justify-between p-3 text-left">
                  <div className="flex items-center">
                    <FileText className="mr-2 h-4 w-4" />
                    <span className="font-medium">{selectedPdfName}</span>
                  </div>
                  <ChevronDown className="h-4 w-4" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-3 pb-3">
                    <Button variant="outline" size="sm" className="w-full" onClick={startNewChat}>
                      Neuen Chat starten
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
            
            {/* Chat-Nachrichten */}
            <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
              <div className="space-y-4 max-w-[900px] mx-auto">
                {messages.map((message, index) => (
                  <MessageItem key={index} message={message} />
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex max-w-[90%] items-start gap-2">
                      <Avatar className="mt-1 bg-muted">
                        <AvatarFallback>
                          <FileText className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="rounded-lg p-4 bg-muted text-foreground text-sm">
                        <div className="flex items-center gap-2 mb-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="font-medium">Verarbeite Anfrage...</span>
                        </div>
                        <p className="text-muted-foreground">
                          Die Analyse des PDF-Dokuments und die Generierung einer präzisen Antwort kann 
                          einige Momente dauern. Je nach Größe und Komplexität des Dokuments 
                          kann dieser Vorgang zwischen 10-30 Sekunden beanspruchen.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            
            {/* Eingabefeld */}
            <div className="border-t p-4">
              <div className="flex gap-2 max-w-[800px] mx-auto">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyPress}
                  placeholder="Stellen Sie eine Frage..."
                  disabled={isLoading || !selectedPdf}
                  className="flex-1"
                />
                <Button 
                  onClick={sendQuestion} 
                  disabled={isLoading || !inputValue.trim() || !selectedPdf}
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
        </div>
      </DialogContent>
    </Dialog>
  );
} 