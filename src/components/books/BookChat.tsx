import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import { Send, Book as BookIcon, User, X, Eye } from 'lucide-react';
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

interface BookChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BookChat({ open, onOpenChange }: BookChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      type: 'assistant',
      content: 'Hallo! Wie kann ich dir bei der Suche nach einem Buch helfen? Du kannst mir sagen, wonach du suchst, zum Beispiel "Ich brauche ein Buch über Mathematik für die Oberstufe" oder "Hast du etwas zur Graphomotorik?"',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [books, setBooks] = useState<SearchBook[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [isLoadingBookDetails, setIsLoadingBookDetails] = useState(false);
  const { toast } = useToast();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      // Reset state when dialog opens
      scrollToBottom();
    }
  }, [messages, open]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSearch = async () => {
    if (!inputValue.trim()) return;

    // Benutzer-Nachricht hinzufügen
    const userMessage: Message = {
      type: 'user',
      content: inputValue,
      timestamp: new Date(),
    };
    
    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
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
      
      // Session abrufen, um das Access Token zu bekommen
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      
      if (!session) {
        console.log('Keine aktive Sitzung gefunden, verwende anonymen Zugriff');
      }
      
      // Edge Function mit JWT Token aufrufen
      const response = await supabase.functions.invoke('search-books', {
        body: { query: userMessage.content },
        headers: session ? {
          Authorization: `Bearer ${session.access_token}`
        } : undefined
      });
      
      console.log('Edge-Funktion Antwort:', response);
      
      if (response.error) {
        console.error('Function error:', response.error);
        throw new Error(`Edge-Funktion Fehler: ${JSON.stringify(response.error)}`);
      }
      
      const data = response.data;
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
          
          <div className="flex-1 overflow-hidden flex flex-col h-[500px]">
            <ScrollArea className="flex-1 pr-4 mb-4">
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
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
                        <p>{message.content}</p>
                        <p className="text-xs opacity-70 mt-1">
                          {message.timestamp.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {showResults && (
              <div className="mb-4">
                <h3 className="text-lg font-medium mb-3">Gefundene Bücher:</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[200px] overflow-y-auto pr-2">
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