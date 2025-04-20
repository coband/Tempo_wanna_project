import React, { useState, useRef, useEffect } from 'react';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import { Send, Book as BookIcon, User, X, Eye, Clock, ChevronDown, ChevronLeft } from 'lucide-react';
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

// Interface für Suchergebnisse, die von der Supabase-Funktion zurückgegeben werden
interface SearchBook {
  id: string;
  title: string;
  author: string;
  subject: string;
  level: string;
  description: string;
  similarity: number;
}

interface Message {
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatSession {
  id: string;
  messages: Message[];
  timestamp: Date;
  books: SearchBook[];
  showBooks: boolean;
}

interface BookChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Hilfsfunktionen für localStorage
const storageChatKey = 'book_chat_history';

const saveChatHistory = (sessions: ChatSession[]) => {
  try {
    // ISO Strings für Datumsangaben verwenden
    const sessionsToSave = sessions.map(session => ({
      ...session,
      timestamp: session.timestamp.toISOString(),
      messages: session.messages.map(msg => ({
        ...msg,
        timestamp: msg.timestamp.toISOString()
      }))
    }));
    localStorage.setItem(storageChatKey, JSON.stringify(sessionsToSave));
  } catch (error) {
    console.error('Fehler beim Speichern des Chat-Verlaufs:', error);
  }
};

const loadChatHistory = (): ChatSession[] => {
  try {
    const saved = localStorage.getItem(storageChatKey);
    if (!saved) return [];
    
    // Parse und konvertiere ISO Strings zurück zu Date-Objekten
    const sessions = JSON.parse(saved);
    return sessions.map((session: any) => ({
      ...session,
      timestamp: new Date(session.timestamp),
      messages: session.messages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      })),
      showBooks: false // Standardmäßig Bücher ausblenden
    }));
  } catch (error) {
    console.error('Fehler beim Laden des Chat-Verlaufs:', error);
    return [];
  }
};

export function BookChat({ open, onOpenChange }: BookChatProps) {
  // Authentifizierten Supabase-Client vom Hook beziehen
  const { supabase, publicClient } = useSupabaseAuth();
  const clerkAuth = useClerkAuth();
  // Standardnachricht für den Assistenten
  const defaultMessage = {
    type: 'assistant' as const,
    content: 'Hallo! Wie kann ich dir bei der Suche nach einem Buch helfen? Du kannst mir sagen, wonach du suchst, zum Beispiel "Ich brauche ein Buch über Mathematik für die Oberstufe" oder "Hast du etwas zur Graphomotorik?"',
    timestamp: new Date(),
  };

  const [messages, setMessages] = useState<Message[]>([defaultMessage]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [books, setBooks] = useState<SearchBook[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [isLoadingBookDetails, setIsLoadingBookDetails] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [booksCollapsed, setBooksCollapsed] = useState(false);
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

  // Keyboard-Erkennung (vereinfacht)
  useEffect(() => {
    const handleResize = () => {
      // Einfache Heuristik: wenn die Bildschirmhöhe deutlich kleiner wird, 
      // ist das Keyboard wahrscheinlich geöffnet
      const windowHeight = window.innerHeight;
      const visibleHeight = window.visualViewport?.height || windowHeight;
      
      // Wenn mehr als 25% des Bildschirms versteckt sind, nehmen wir an, dass das Keyboard offen ist
      setKeyboardOpen(visibleHeight < windowHeight * 0.75);
    };

    // Initial und bei Resize prüfen
    handleResize();
    
    window.addEventListener('resize', handleResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  // Chat-Historie beim Komponenten-Laden abrufen
  useEffect(() => {
    const history = loadChatHistory();
    setChatHistory(history);
  }, []);

  // Alle Nachrichten aus dem Verlauf zusammenführen
  useEffect(() => {
    // Erstelle ein kombiniertes Array mit allen Nachrichten in chronologischer Reihenfolge (älteste zuerst)
    let combinedMessages: Message[] = [];
    
    // Füge historische Sitzungen hinzu (älteste zuerst)
    if (chatHistory.length > 0) {
      // Sortiere die Sitzungen nach Datum (älteste zuerst)
      const sortedHistory = [...chatHistory].sort((a, b) => 
        a.timestamp.getTime() - b.timestamp.getTime()
      );
      
      // Füge alle Nachrichten der älteren Sitzungen hinzu (älteste zuerst)
      sortedHistory.forEach((session, sessionIndex) => {
        // Sitzungsnachrichten hinzufügen
        combinedMessages = [
          ...combinedMessages,
          ...session.messages
        ];
        
        // Trennlinie nach jeder Sitzung hinzufügen (außer nach der letzten)
        if (sessionIndex < sortedHistory.length - 1) {
          combinedMessages.push({
            type: 'assistant',
            content: '------- Früheres Gespräch -------',
            timestamp: new Date(),
          });
        }
      });
      
      // Füge eine Trennnachricht zwischen den früheren und der aktuellen Sitzung ein
      if (messages.length > 1) {
        combinedMessages.push({
          type: 'assistant',
          content: '------- Aktuelles Gespräch -------',
          timestamp: new Date(),
        });
      }
    }
    
    // Füge die aktuellen Nachrichten hinzu (als letztes/unten)
    combinedMessages = [
      ...combinedMessages,
      ...messages
    ];
    
    setAllMessages(combinedMessages);
  }, [messages, chatHistory]);

  // Neue Sitzung erstellen oder bestehende verwenden, wenn der Dialog geöffnet wird
  useEffect(() => {
    if (open) {
      // Wenn keine aktive Sitzung vorhanden ist, erstelle eine neue
      if (!currentSessionId) {
        const newSessionId = `session_${Date.now()}`;
        setCurrentSessionId(newSessionId);
        setMessages([defaultMessage]);
        setInputValue('');
        setBooks([]);
        setShowResults(false);
      }
      
      // Scroll zum Ende (neue Nachrichteneingabe)
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }, [open]);

  // Chat-Historie aktualisieren, wenn sich Nachrichten oder Bücher ändern
  useEffect(() => {
    if (currentSessionId && messages.length > 1) {
      const updatedHistory = [...chatHistory];
      const existingSessionIndex = updatedHistory.findIndex(
        session => session.id === currentSessionId
      );

      if (existingSessionIndex >= 0) {
        // Bestehende Sitzung aktualisieren
        updatedHistory[existingSessionIndex] = {
          ...updatedHistory[existingSessionIndex],
          messages,
          books,
          timestamp: new Date(),
          showBooks: showResults
        };
      } else {
        // Neue Sitzung hinzufügen
        updatedHistory.push({
          id: currentSessionId,
          messages,
          books,
          timestamp: new Date(),
          showBooks: showResults
        });

        // Begrenze die Anzahl der gespeicherten Sitzungen auf 10
        if (updatedHistory.length > 10) {
          updatedHistory.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
          updatedHistory.splice(10);
        }
      }

      setChatHistory(updatedHistory);
      saveChatHistory(updatedHistory);
    }
  }, [messages, books, showResults]);

  // Scroll zum Ende, wenn neue Nachrichten hinzugefügt werden
  useEffect(() => {
    if (open && messages.length > 0) {
      // Kurze Verzögerung für das Scrollen, damit das Rendering abgeschlossen ist
      setTimeout(() => {
        scrollToBottom();
      }, 50);
    }
  }, [messages, open]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Einmal beim Öffnen des Chats zum Ende scrollen
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        scrollToBottom();
      }, 300);
    }
  }, [open]);

  // Hilfsfunktion, um Trennlinien zu identifizieren
  const isSeparatorMessage = (message: Message) => {
    return message.type === 'assistant' && 
           (message.content.includes('-------') || 
            message.content.includes('Frühere') ||
            message.content.includes('Aktuelles'));
  };

  // Rendern der Chatnachrichten
  const renderMessages = () => {
    // Alle verarbeiteten Nachrichten als React-JSX-Elemente
    const renderedMessages: React.ReactNode[] = [];
    
    // Verarbeite alle Nachrichten (bereits in chronologischer Reihenfolge)
    allMessages.forEach((message, index) => {
      renderedMessages.push(
        <div
          key={`message-${index}`}
          className={`flex ${
            message.type === 'user' ? 'justify-end' : 'justify-start'
          } ${isSeparatorMessage(message) ? 'justify-center text-gray-500 text-sm my-3' : 'mb-4'}`}
        >
          {!isSeparatorMessage(message) && (
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.type === 'user' 
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              {message.content}
            </div>
          )}
          
          {isSeparatorMessage(message) && (
            <div className="w-full text-center">
              <div className="inline-block px-2">{message.content}</div>
            </div>
          )}
        </div>
      );
    });
    
    return renderedMessages;
  };

  const handleSearch = async () => {
    if (!inputValue.trim()) return;
    
    // Benutzeranfrage zur Nachrichtenliste hinzufügen
    const userMessage: Message = {
      type: 'user',
      content: inputValue,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    
    try {
      // Hole Clerk-Token für Supabase
      let authToken = null;
      try {
        authToken = await clerkAuth.getToken({ template: 'supabase' });
      } catch (tokenError) {
        console.warn("Fehler beim Abrufen des Auth-Tokens:", tokenError);
        // Wir fahren trotzdem fort, supabase wird dann den anon key verwenden
      }
      
      // Verwende Edge Function statt RPC
      let data;
      if (authToken) {
        // Direkter Aufruf der Edge-Funktion mit fetch und Auth-Token
        const functionsUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search-books`;
        const response = await fetch(functionsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ query: userMessage.content })
        });
        
        if (!response.ok) {
          throw new Error(`Fehler beim Aufruf der Suchfunktion: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        data = result.books || [];
      } else {
        // Alternativ: Supabase Functions API nutzen
        const { data: result, error } = await publicClient.functions.invoke('search-books', {
          body: { query: userMessage.content }
        });
        
        if (error) {
          throw new Error(`Fehler bei der Suche: ${error.message}`);
        }
        
        data = result.books || [];
      }
      
      // Antwort des Assistenten erstellen
      let responseContent = '';
      
      if (data && Array.isArray(data) && data.length > 0) {
        // Wenn Bücher gefunden wurden
        responseContent = `Ich habe ${data.length} Bücher gefunden, die zu deiner Anfrage passen:`;
        setBooks(data);
        setShowResults(true);
      } else {
        // Wenn keine Bücher gefunden wurden
        responseContent = "Leider konnte ich keine passenden Bücher finden. Bitte versuche es mit anderen Suchbegriffen oder beschreibe dein gesuchtes Thema genauer.";
        setBooks([]);
        setShowResults(false);
      }
      
      // Assistentenantwort hinzufügen
      const assistantMessage: Message = {
        type: 'assistant',
        content: responseContent,
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
    } catch (error) {
      console.error("Fehler bei der Buchsuche:", error);
      
      // Fehlermeldung als Assistentenantwort
      const errorMessage: Message = {
        type: 'assistant',
        content: "Entschuldigung, bei der Suche ist ein Fehler aufgetreten. Bitte versuche es später noch einmal.",
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, errorMessage]);
      
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
    setIsLoadingBookDetails(true);
    
    try {
      // Hole Clerk-Token für Supabase
      let authToken = null;
      try {
        authToken = await clerkAuth.getToken({ template: 'supabase' });
      } catch (tokenError) {
        console.warn("Fehler beim Abrufen des Auth-Tokens:", tokenError);
      }
      
      // Bestimme, welchen Client wir verwenden
      const client = authToken ? supabase : publicClient;
      
      // Lade vollständige Buchinformationen
      const { data: bookData, error } = await client
        .from('books')
        .select('*')
        .eq('id', searchBook.id)
        .single();
      
      if (error) {
        throw error;
      }
      
      // Type Assertion hinzufügen, um Typfehler zu vermeiden
      setSelectedBook(bookData as unknown as Book);
      setShowDetailsDialog(true);
      
    } catch (error) {
      console.error("Fehler beim Laden der Buchdetails:", error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Die Buchdetails konnten nicht geladen werden."
      });
    } finally {
      setIsLoadingBookDetails(false);
    }
  };

  // Mobile Header Komponente
  const MobileHeader = () => {
    // Letzte Benutzernachricht für Kontext finden
    const lastUserMessage = allMessages.filter(m => m.type === 'user').pop();
    const searchQuery = lastUserMessage ? lastUserMessage.content : '';
    
    return (
      <div className="flex flex-col bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between p-3 border-b">
          <button 
            onClick={() => onOpenChange(false)}
            className="flex items-center text-gray-700"
          >
            <ChevronLeft className="h-5 w-5 mr-1" />
            <span>Zurück</span>
          </button>
          <h2 className="text-lg font-semibold">Buch-Chatbot</h2>
          <div className="w-8"></div> {/* Placeholder für Balance */}
        </div>
        {searchQuery && (
          <div className="px-4 py-3 bg-gray-50 text-gray-800 font-medium">
            Suche: <span className="text-blue-600">"{searchQuery}"</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={`
            ${isMobile 
              ? 'w-full h-[100vh] max-h-[100vh] max-w-full p-0 m-0 rounded-none inset-0 translate-x-0 translate-y-0 top-0 left-0' 
              : 'sm:max-w-[800px] max-h-[90vh]'
            } overflow-hidden flex flex-col
          `}
          style={isMobile ? {
            position: 'fixed',
            transform: 'none'
          } : {}}
        >
          {isMobile ? (
            <>
              <MobileHeader />
              <div className={`flex-1 overflow-hidden flex flex-col ${keyboardOpen ? 'h-[60vh]' : 'h-[calc(100vh-160px)]'}`}>
                <ScrollArea 
                  className="flex-1 px-3 overflow-y-auto"
                  ref={scrollAreaRef}
                >
                  <div className="space-y-4 py-3 mb-24">
                    {/* Nur die letzten zwei Nachrichten anzeigen: letzte Benutzereingabe und Antwort */}
                    {allMessages.length > 0 && allMessages.slice(-2).map((message, index) => (
                      <div
                        key={`last-message-${index}`}
                        className={`flex ${
                          message.type === 'user' ? 'justify-end' : 'justify-start'
                        } mb-4`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg p-3 ${
                            message.type === 'user' 
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-100 text-gray-900'
                          }`}
                        >
                          {message.content}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} className="h-5" />
                  </div>
                </ScrollArea>

                {showResults && books.length > 0 && (
                  <div className="pt-0 px-0 mb-20 bg-white z-10 relative flex-grow">
                    <div className="bg-gray-100 px-4 py-3 mb-2 font-medium">
                      Gefundene Bücher ({books.length})
                    </div>
                    <div className="grid grid-cols-1 gap-4 overflow-y-auto px-3 pb-24" style={{ maxHeight: 'calc(100vh - 200px)' }}>
                      {books.map((book) => (
                        <Card key={book.id} className="overflow-hidden border-l-4 border-l-blue-400">
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="font-semibold">{book.title}</h4>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => openBookDetails(book)}
                                disabled={isLoadingBookDetails}
                                className="h-8 px-2 ml-2"
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                <span className="text-xs">Details</span>
                              </Button>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{book.author}</p>
                            
                            <div className="flex items-center gap-2 mb-3 flex-wrap">
                              <Badge variant="outline">{book.subject}</Badge>
                              <Badge variant="outline">{book.level}</Badge>
                              <Badge 
                                variant="secondary"
                                className="ml-auto"
                              >
                                {(book.similarity * 100).toFixed()}% Ähnlichkeit
                              </Badge>
                            </div>
                            
                            <p className="text-sm text-gray-700 line-clamp-3">{book.description}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {isLoading && (
                  <div className="py-2 px-3">
                    <Skeleton className="h-3 w-2/3 mb-2" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                )}
              </div>

              <div className={`border-t py-3 px-3 flex flex-shrink-0 fixed bottom-0 left-0 right-0 bg-white shadow-lg z-20 ${keyboardOpen ? 'mb-0' : ''}`}>
                <div className="flex gap-2 w-full">
                  <Input
                    ref={inputRef}
                    placeholder="Schreibe deine Frage hier..."
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyPress}
                    disabled={isLoading}
                    className="flex-1 text-[16px] h-10"
                    style={{ touchAction: "manipulation" }}
                  />
                  <Button 
                    onClick={handleSearch} 
                    disabled={isLoading || !inputValue.trim()}
                    size="icon"
                    className="h-10 w-10"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Buch-Chatbot</DialogTitle>
                <DialogDescription>
                  Stelle eine Frage, um passende Bücher zu finden
                </DialogDescription>
              </DialogHeader>
              
              <div className="flex-1 overflow-hidden flex flex-col h-[60vh]">
                <ScrollArea className="flex-1 pr-4 mb-4 max-h-full overflow-y-auto" ref={scrollAreaRef}>
                  <div className="space-y-4 pb-2">
                    {renderMessages()}
                    <div ref={messagesEndRef} className="h-1" />
                  </div>
                </ScrollArea>

                {showResults && (
                  <div className="mb-4 mt-2 border-t pt-4">
                    <h3 className="text-lg font-medium mb-3">Gefundene Bücher:</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[30vh] overflow-y-auto pr-2">
                      {books.map((book) => (
                        <Card key={book.id} className="overflow-hidden">
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="font-semibold text-md">{book.title}</h4>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => openBookDetails(book)}
                                disabled={isLoadingBookDetails}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{book.author}</p>
                            
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <Badge variant="outline">{book.subject}</Badge>
                              <Badge variant="outline">{book.level}</Badge>
                              <Badge 
                                variant="secondary"
                                className="ml-auto"
                              >
                                {(book.similarity * 100).toFixed()}% Ähnlichkeit
                              </Badge>
                            </div>
                            
                            <p className="text-sm text-gray-700 line-clamp-2">{book.description}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {isLoading && (
                  <div className="mb-4">
                    <Skeleton className="h-4 w-2/3 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                )}
              </div>

              <DialogFooter className="flex-shrink-0 sm:justify-between border-t pt-4">
                <div className="flex gap-2 w-full">
                  <Input
                    ref={inputRef}
                    placeholder="Schreibe deine Frage hier..."
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyPress}
                    disabled={isLoading}
                    className="flex-1"
                  />
                  <Button onClick={handleSearch} disabled={isLoading || !inputValue.trim()}>
                    <Send className="h-4 w-4" />
                    <span className="sr-only">Senden</span>
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {selectedBook && (
        <BookDetails
          book={selectedBook}
          open={showDetailsDialog}
          onOpenChange={(open) => {
            setShowDetailsDialog(open);
            if (!open) setSelectedBook(null);
          }}
          onBookChange={() => {}}
        />
      )}
    </>
  );
} 