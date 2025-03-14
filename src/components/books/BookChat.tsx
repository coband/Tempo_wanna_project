import React, { useState, useRef, useEffect } from 'react';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import { Send, Book as BookIcon, User, X, Eye, Clock, ChevronDown } from 'lucide-react';
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
  const { toast } = useToast();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Chat-Historie beim Komponenten-Laden abrufen
  useEffect(() => {
    const history = loadChatHistory();
    setChatHistory(history);
  }, []);

  // Alle Nachrichten aus dem Verlauf zusammenführen
  useEffect(() => {
    // Erstelle ein kombiniertes Array mit allen Nachrichten aus der Historie und aktuellen Nachrichten
    let combinedMessages: Message[] = [...messages];
    
    // Füge Nachrichten aus früheren Sitzungen hinzu
    if (chatHistory.length > 0) {
      // Sortiere die Sitzungen nach Datum (neueste zuerst)
      const sortedHistory = [...chatHistory].sort((a, b) => 
        b.timestamp.getTime() - a.timestamp.getTime()
      );
      
      // Füge eine Trennnachricht zwischen den Sitzungen ein, wenn aktuelle Sitzung Nachrichten hat
      if (messages.length > 1) {
        combinedMessages.push({
          type: 'assistant',
          content: '------- Frühere Gespräche -------',
          timestamp: new Date(),
        });
      }
      
      // Füge alle Nachrichten der Sitzungen hinzu
      sortedHistory.forEach((session, sessionIndex) => {
        // Trennlinie zwischen den Sessions
        if (sessionIndex > 0) {
          combinedMessages.push({
            type: 'assistant',
            content: '------- Früheres Gespräch -------',
            timestamp: new Date(),
          });
        }
        
        combinedMessages = [
          ...combinedMessages,
          ...session.messages
        ];
      });
    }
    
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

  const handleSearch = async () => {
    if (!inputValue.trim()) return;

    // Temporäres Input speichern und sofort zurücksetzen
    const currentInput = inputValue.trim();
    setInputValue('');

    // Benutzer-Nachricht hinzufügen
    const userMessage: Message = {
      type: 'user',
      content: currentInput,
      timestamp: new Date(),
    };
    
    // Sofort die Benutzernachricht anzeigen
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setShowResults(false);

    try {
      // Rate Limiting: Prüfen, ob der Benutzer zu viele Anfragen sendet
      const lastRequestTime = localStorage.getItem('lastSearchRequestTime');
      const now = Date.now();
      const timeThreshold = 2000; // 2 Sekunden zwischen Anfragen
      
      if (lastRequestTime && now - parseInt(lastRequestTime) < timeThreshold) {
        throw new Error('Bitte warte einen Moment zwischen den Suchanfragen.');
      }
      
      // Aktuelle Zeit für Rate Limiting speichern
      localStorage.setItem('lastSearchRequestTime', now.toString());
      
      console.log('Rufe Edge-Funktion search-books auf...');
      
      // Hole Clerk-Token für Supabase
      let authToken = null;
      try {
        authToken = await clerkAuth.getToken({ template: 'supabase' });
        console.log('Auth-Token erhalten:', !!authToken);
      } catch (tokenError) {
        console.warn('Fehler beim Abrufen des Auth-Tokens:', tokenError);
      }
      
      // Manuell die Edge-Funktion aufrufen mit dem Token
      const functionsUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search-books`;
      
      let data: any;
      
      if (authToken) {
        // Direkter Aufruf mit fetch
        try {
          const fetchResponse = await fetch(functionsUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`,
            },
            body: JSON.stringify({ query: userMessage.content }),
          });
          
          if (!fetchResponse.ok) {
            console.error('Function error:', fetchResponse.status, fetchResponse.statusText);
            throw new Error(`Edge-Funktion Fehler: ${fetchResponse.status} ${fetchResponse.statusText}`);
          }
          
          data = await fetchResponse.json();
          console.log('Edge-Funktion Antwort:', data);
        } catch (fetchError) {
          console.error('Fetch error:', fetchError);
          throw fetchError;
        }
      } else {
        // Wenn wir keinen Token haben, nutzen wir die Supabase invoke-Methode
        const supabaseResponse = await publicClient.functions.invoke('search-books', {
          body: { query: userMessage.content },
        });
        
        console.log('Edge-Funktion Antwort:', supabaseResponse);
        
        if (supabaseResponse.error) {
          console.error('Function error:', supabaseResponse.error);
          throw new Error(`Edge-Funktion Fehler: ${JSON.stringify(supabaseResponse.error)}`);
        }
        
        data = supabaseResponse.data;
      }
      
      // Verarbeite Daten, unabhängig von der Quelle
      setBooks(data.books || []);

      // Antwort des Assistenten hinzufügen
      const assistantMessage: Message = {
        type: 'assistant',
        content: `Ich habe ${data.books.length} Bücher gefunden, die deiner Anfrage entsprechen. Hier sind die Ergebnisse:`,
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, assistantMessage]);
      setShowResults(true);
    } catch (error) {
      console.error('Error searching books:', error);
      
      // Detailliertere Fehlermeldung für den Benutzer
      let errorMessage: Message;
      
      if (error instanceof Error) {
        errorMessage = {
          type: 'assistant',
          content: `Es tut mir leid, aber bei der Suche ist ein Fehler aufgetreten: ${error.message}. Bitte versuche es später noch einmal oder kontaktiere den Support, wenn das Problem weiterhin besteht.`,
          timestamp: new Date(),
        };
        
        // Detaillierte Fehlerinformationen in die Konsole schreiben
        console.error('Vollständiger Fehler:', {
          message: error.message,
          stack: error.stack
        });
        
        // Toast mit Fehlerdetails anzeigen
        toast({
          title: "Fehler bei der Buchsuche",
          description: `${error.message}`,
          variant: "destructive"
        });
      } else {
        errorMessage = {
          type: 'assistant',
          content: 'Es tut mir leid, aber bei der Suche ist ein unbekannter Fehler aufgetreten. Bitte versuche es später noch einmal.',
          timestamp: new Date(),
        };
      }
      
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const openBookDetails = async (searchBook: SearchBook) => {
    setIsLoadingBookDetails(true);
    try {
      // Vollständige Buchdaten aus der Datenbank abrufen
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', searchBook.id)
        .single();
      
      if (error) throw error;
      
      if (data) {
        setSelectedBook(data);
        setShowDetailsDialog(true);
      } else {
        toast({
          title: "Fehler",
          description: "Das ausgewählte Buch konnte nicht gefunden werden.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error fetching book details:', error);
      toast({
        title: "Fehler",
        description: "Beim Laden der Buchdetails ist ein Fehler aufgetreten.",
        variant: "destructive"
      });
    } finally {
      setIsLoadingBookDetails(false);
    }
  };

  // Prüft, ob ein nachricht eine Separatorlinie ist
  const isSeparatorMessage = (message: Message) => {
    return message.type === 'assistant' && (
      message.content === '------- Frühere Gespräche -------' ||
      message.content === '------- Früheres Gespräch -------'
    );
  };

  const renderMessages = () => {
    // Kombinierte Nachrichten: frühere Sitzungen + aktuelle Sitzung
    let allMessages: React.ReactNode[] = [];
    
    // Frühere Nachrichten hinzufügen (älteste zuerst)
    const historicalMessages = chatHistory
      .filter(session => session.id !== currentSessionId) // Aktuelle Sitzung ausschließen
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()) // Älteste zuerst
      .flatMap((session, sessionIndex, array) => {
        const sessionMessages = session.messages.map((message, msgIndex) => (
          <div key={`history-${session.id}-${msgIndex}`}
            className={`flex ${
              message.type === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`flex max-w-[80%] ${
                message.type === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              <div className={`flex-shrink-0 ${message.type === 'user' ? 'ml-3' : 'mr-3'}`}>
                <Avatar>
                  <AvatarFallback>
                    {message.type === 'user' ? <User size={18} /> : <BookIcon size={18} />}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div
                className={`p-3 rounded-lg ${
                  message.type === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                <p className="whitespace-normal break-words">{message.content}</p>
                <p className="text-xs opacity-70 mt-1">
                  {message.timestamp.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          </div>
        ));
        
        // Trennlinie nach jeder Sitzung hinzufügen (außer nach der letzten)
        if (sessionIndex < array.length - 1) {
          sessionMessages.push(
            <div key={`separator-${session.id}`} className="flex justify-center my-6">
              <div className="bg-muted px-3 py-1 rounded-md text-xs text-muted-foreground">
                ------- Früheres Gespräch -------
              </div>
            </div>
          );
        }
        
        return sessionMessages;
      });
    
    allMessages = [...historicalMessages];
    
    // Trennlinie hinzufügen, wenn es frühere Chats gibt und die aktuelle Sitzung Nachrichten hat
    if (chatHistory.filter(session => session.id !== currentSessionId).length > 0 && messages.length > 1) {
      allMessages.push(
        <div key="current-separator" className="flex justify-center my-6">
          <div className="bg-muted px-3 py-1 rounded-md text-xs text-muted-foreground">
            ------- Aktuelles Gespräch -------
          </div>
        </div>
      );
    }
    
    // Aktuelle Nachrichten hinzufügen (als letztes/unten)
    const currentMessages = messages.map((message, index) => (
      <div key={`current-${index}`}
        className={`flex ${
          message.type === 'user' ? 'justify-end' : 'justify-start'
        }`}
      >
        <div
          className={`flex max-w-[80%] ${
            message.type === 'user' ? 'flex-row-reverse' : 'flex-row'
          }`}
        >
          <div className={`flex-shrink-0 ${message.type === 'user' ? 'ml-3' : 'mr-3'}`}>
            <Avatar>
              <AvatarFallback>
                {message.type === 'user' ? <User size={18} /> : <BookIcon size={18} />}
              </AvatarFallback>
            </Avatar>
          </div>
          <div
            className={`p-3 rounded-lg ${
              message.type === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted'
            }`}
          >
            <p className="whitespace-normal break-words">{message.content}</p>
            <p className="text-xs opacity-70 mt-1">
              {message.timestamp.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>
      </div>
    ));
    
    return [...allMessages, ...currentMessages];
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col">
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