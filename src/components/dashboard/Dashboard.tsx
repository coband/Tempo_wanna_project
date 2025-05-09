import { useEffect, useState } from 'react';
import { DashboardHeader } from './DashboardHeader';
import { useSupabase } from '@/contexts/SupabaseContext';
import { useAuth } from '@/hooks/useAuth';
import { Book } from '@/lib/books';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Clock, BookText, TrendingUp, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BookDetails from '../books/BookDetails';

export default function Dashboard() {
  const supabase = useSupabase();
  const { loading: authLoading } = useAuth();
  const [recentBooks, setRecentBooks] = useState<Book[]>([]);
  const [bookCount, setBookCount] = useState<number>(0);
  const [borrowedCount, setBorrowedCount] = useState<number>(0);
  const [booksAddedThisMonth, setBooksAddedThisMonth] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [totalVisits, setTotalVisits] = useState<number>(1254);
  
  // State für Buch-Details-Dialog
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);

  useEffect(() => {
    if (authLoading) return;

    const fetchDashboardData = async () => {
      setIsLoading(true);
      try {
        // Lade die 10 neuesten Bücher
        const { data: latestBooks } = await supabase
          .from("books")
          .select("id, title, author, publisher, created_at, available, has_pdf, isbn")
          .order('created_at', { ascending: false })
          .limit(10);

        // Zähle die Gesamtzahl der Bücher
        const { count: totalBooks } = await supabase
          .from("books")
          .select("*", { count: 'exact', head: true });

        // Zähle die ausgeliehenen Bücher
        const { count: borrowedBooks } = await supabase
          .from("books")
          .select("*", { count: 'exact', head: true })
          .eq("available", false);

        // Berechne das Datum vor 30 Tagen
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

        // Zähle die Bücher, die in den letzten 30 Tagen hinzugefügt wurden
        const { count: recentlyAddedBooks } = await supabase
          .from("books")
          .select("*", { count: 'exact', head: true })
          .gte('created_at', thirtyDaysAgoISO);

        if (latestBooks) {
          setRecentBooks(latestBooks as Book[]);
        }
        if (totalBooks !== null) setBookCount(totalBooks);
        if (borrowedBooks !== null) setBorrowedCount(borrowedBooks);
        if (recentlyAddedBooks !== null) setBooksAddedThisMonth(recentlyAddedBooks);
      } catch (error) {
        console.error("Fehler beim Laden der Dashboard-Daten:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [supabase, authLoading]);

  // Formatiere das Datum für die Anzeige
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date);
  };

  // Funktion zum Öffnen der Buchdetails
  const openBookDetails = (book: Book) => {
    setSelectedBook(book);
    setDetailsOpen(true);
  };

  // Funktion zum Neuladen der Daten nach Änderungen
  const handleBookChange = async () => {
    // Lade die 10 neuesten Bücher neu
    const { data: latestBooks } = await supabase
      .from("books")
      .select("id, title, author, publisher, created_at, available, has_pdf, isbn")
      .order('created_at', { ascending: false })
      .limit(10);

    if (latestBooks) {
      setRecentBooks(latestBooks as Book[]);
    }

    // Aktualisiere auch die andere Statistik
    const { count: borrowedBooks } = await supabase
      .from("books")
      .select("*", { count: 'exact', head: true })
      .eq("available", false);

    if (borrowedBooks !== null) setBorrowedCount(borrowedBooks);

    // Berechne das Datum vor 30 Tagen
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

    // Zähle die Bücher, die in den letzten 30 Tagen hinzugefügt wurden
    const { count: recentlyAddedBooks } = await supabase
      .from("books")
      .select("*", { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgoISO);

    if (recentlyAddedBooks !== null) setBooksAddedThisMonth(recentlyAddedBooks);
  };

  // Zeige eine Ladeanzeige während des Ladens
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardHeader />
        <div className="container mx-auto p-4">
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-500">Lade Dashboard-Daten...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />
      
      {/* BookDetails Dialog */}
      {selectedBook && (
        <BookDetails 
          book={selectedBook}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          onBookChange={handleBookChange}
        />
      )}
      
      <div className="container mx-auto p-4">
        <div className="flex flex-col items-start mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Willkommen bei Wanna, deiner digitalen Schulbibliothek.</p>
        </div>

        {/* Statistik-Karten */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-4">
                <div className="bg-purple-100 p-3 rounded-full">
                  <BookOpen className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Bücher gesamt</p>
                  <h3 className="text-2xl font-bold">{bookCount}</h3>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-4">
                <div className="bg-blue-100 p-3 rounded-full">
                  <Clock className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Ausgeliehen</p>
                  <h3 className="text-2xl font-bold">{borrowedCount}</h3>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-4">
                <div className="bg-amber-100 p-3 rounded-full">
                  <TrendingUp className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Neue Bücher (30 Tage)</p>
                  <h3 className="text-2xl font-bold">{booksAddedThisMonth}</h3>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Frisch hinzugefügte Bücher */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="md:col-span-2">
            <Card className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold flex items-center">
                    <BookText className="h-5 w-5 mr-2 text-purple-600" />
                    Neueste Bücher
                  </CardTitle>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/books">Alle anzeigen</Link>
                  </Button>
                </div>
                <CardDescription>Die 10 zuletzt hinzugefügten Bücher in der Bibliothek</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {recentBooks.length > 0 ? (
                    <div className="rounded-md border">
                      <div className="divide-y">
                        {recentBooks.map((book) => (
                          <div 
                            key={book.id} 
                            className="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors cursor-pointer"
                            onClick={() => openBookDetails(book)}
                          >
                            <div className="flex flex-col">
                              <span className="font-medium text-blue-600">
                                {book.title}
                              </span>
                              <div className="flex space-x-4 mt-1 text-sm text-gray-500">
                                <span>{book.author}</span>
                                {book.publisher && (
                                  <span className="hidden sm:inline">• {book.publisher}</span>
                                )}
                              </div>
                            </div>
                            <div className="text-xs text-gray-500 whitespace-nowrap">
                              {formatDate(book.created_at)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      Noch keine Bücher in der Bibliothek.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Aktivitäten & Infos */}
          <div>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center">
                  <Eye className="h-5 w-5 mr-2 text-blue-600" />
                  Auf einen Blick
                </CardTitle>
                <CardDescription>Wichtige Informationen und Links</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="rounded-md bg-blue-50 p-3">
                    <h4 className="font-medium text-blue-800 mb-1">Bücher aussuchen leicht gemacht</h4>
                    <p className="text-sm text-blue-700">
                      Verwende die Suchfunktion oder Filter, um schnell das passende Buch zu finden.
                    </p>
                  </div>
                  
                  <div className="rounded-md bg-purple-50 p-3">
                    <h4 className="font-medium text-purple-800 mb-1">PDF Chat</h4>
                    <p className="text-sm text-purple-700 mb-2">
                      Nutze KI, um mit den Inhalten deiner PDFs zu interagieren und Fragen zu stellen.
                    </p>
                    <Button size="sm" className="w-full" asChild>
                      <Link to="/pdf-chat">Zum PDF Chat</Link>
                    </Button>
                  </div>
                  
                  <div className="rounded-md bg-green-50 p-3">
                    <h4 className="font-medium text-green-800 mb-1">Nützliche Ressourcen</h4>
                    <ul className="text-sm text-green-700 list-disc list-inside space-y-1">
                      <li>Ausleihregeln</li>
                      <li>Buchempfehlungen</li>
                      <li>Nächste Buchbesprechungen</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
} 