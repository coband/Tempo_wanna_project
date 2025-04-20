import React, { useState } from 'react';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DashboardHeader } from "../dashboard/DashboardHeader";
import { 
  Upload, 
  BookOpen, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  FileText,
  RotateCcw,
  BookMarked,
  Calendar,
  Bookmark,
  School,
  GraduationCap,
  Building,
  Info,
  ChevronDown,
  ChevronUp,
  Loader2,
  Import
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent
} from "@/components/ui/tooltip";

// Typ für Buchdaten
interface BookPreview {
  isbn: string;
  title: string | null;
  author: string | null;
  year: number | null;
  subject: string | null;
  level: string | null;
  type: string | null;
  school: string | null;
  selected: boolean; // Flag zur Auswahl/Abwahl
  error?: string; // Für Fehler beim Abrufen der Vorschau
}

export function BulkImportBooks() {
  // Supabase authentifizierten Client holen
  const { supabase: authClient, publicClient: supabase } = useSupabaseAuth();
  const [isbnList, setIsbnList] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  
  // Neuer State für die Vorschau
  const [previewMode, setPreviewMode] = useState(false);
  const [bookPreviews, setBookPreviews] = useState<BookPreview[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // Status für die Fortschrittsanzeige
  const [progressPercentage, setProgressPercentage] = useState(0);
  const [progressStage, setProgressStage] = useState('');
  
  // Status für die erweiterten Optionen
  const [isAllSelected, setIsAllSelected] = useState(true);
  const [isOnlyValidSelected, setIsOnlyValidSelected] = useState(false);
  const [currentTab, setCurrentTab] = useState('isbn');

  // Funktion zum Umschalten der Auswahl eines Buchs
  const toggleBookSelection = (isbn: string) => {
    setBookPreviews(books => 
      books.map(book => 
        book.isbn === isbn 
          ? { ...book, selected: !book.selected } 
          : book
      )
    );
  };
  
  // Funktion zum Auswählen/Abwählen aller Bücher
  const toggleSelectAll = () => {
    const newState = !isAllSelected;
    setIsAllSelected(newState);
    setBookPreviews(books => 
      books.map(book => 
        book.error ? book : { ...book, selected: newState }
      )
    );
  };
  
  // Funktion zum Auswählen nur der gültigen Bücher
  const selectOnlyValid = () => {
    setIsOnlyValidSelected(true);
    setIsAllSelected(false);
    setBookPreviews(books => 
      books.map(book => 
        ({ ...book, selected: !book.error })
      )
    );
  };

  // Funktion zum Laden der Buchvorschauen
  const fetchBookPreviews = async () => {
    setPreviewLoading(true);
    setError('');
    setProgressStage('Vorschau wird erstellt');
    setProgressPercentage(0);
    
    try {
      // Eingabe validieren und parsen
      if (!isbnList.trim()) {
        setError('Bitte gib mindestens eine ISBN-Nummer ein.');
        setPreviewLoading(false);
        return;
      }
      
      // ISBNs extrahieren (Zeilenumbrüche, Leerzeichen, Kommas als Trennzeichen betrachten)
      const isbns = isbnList
        .split(/[\n,]+/)
        .map(isbn => isbn.trim())
        .filter(isbn => isbn.length > 0);
      
      setProgress({ current: 0, total: isbns.length });
      console.log(`Vorschau für ${isbns.length} ISBN-Nummern wird geladen`);
      
      // Fortschrittsanzeige simulieren
      let currentProgress = 0;
      const progressInterval = setInterval(() => {
        // Langsam bis 95% voranschreiten, die letzten 5% werden nach Abschluss gesetzt
        if (currentProgress < 95) {
          currentProgress += (95 - currentProgress) / 10;
          setProgressPercentage(currentProgress);
        }
      }, 500);
      
      // Edge-Funktion aufrufen - mit preview: true
      const { data, error: rpcError } = await authClient.functions.invoke('bulk-import-books', {
        body: { isbns, preview: true } // Preview-Modus aktivieren
      });
      
      // Fortschrittsinterval stoppen
      clearInterval(progressInterval);
      
      if (rpcError) {
        throw new Error(`Fehler beim Aufruf der Funktion: ${rpcError.message}`);
      }
      
      // Fortschritt auf 100% setzen, wenn erfolgreich
      setProgressPercentage(100);
      
      console.log('Vorschau abgeschlossen:', data);
      
      // Vorschaudaten verarbeiten und in das richtige Format umwandeln
      const previews: BookPreview[] = [
        ...data.successful.map((item: any) => ({
          isbn: item.isbn,
          title: item.data?.title || null,
          author: item.data?.author || null,
          year: item.data?.year || null,
          subject: item.data?.subject || null,
          level: item.data?.level || null,
          type: item.data?.type || "Lehrmittel",
          school: item.data?.school || "Chriesiweg",
          selected: true // Standardmäßig ausgewählt
        })),
        ...data.failed.map((item: any) => ({
          isbn: item.isbn,
          title: null,
          author: null,
          year: null,
          subject: null,
          level: null,
          type: null,
          school: null,
          selected: false, // Fehlgeschlagene standardmäßig nicht ausgewählt
          error: item.error
        }))
      ];
      
      setBookPreviews(previews);
      setPreviewMode(true);
      setCurrentTab('preview');
    } catch (err: any) {
      console.error('Fehler bei der Buchvorschau:', err);
      setError('Fehler bei der Vorschau: ' + (err.message || err));
    } finally {
      setPreviewLoading(false);
      // Nach einem kurzen Delay Fortschrittsanzeige zurücksetzen
      setTimeout(() => setProgressPercentage(0), 1000);
    }
  };

  // Funktion zum Abschließen des Imports der ausgewählten Bücher
  const importSelectedBooks = async () => {
    setLoading(true);
    setError('');
    setResults(null);
    setProgressStage('Bücher werden importiert');
    setProgressPercentage(0);
    
    try {
      // Nur die ausgewählten ISBN-Nummern extrahieren
      const selectedIsbns = bookPreviews
        .filter(book => book.selected)
        .map(book => book.isbn);
      
      if (selectedIsbns.length === 0) {
        setError('Bitte wähle mindestens ein Buch für den Import aus.');
        setLoading(false);
        return;
      }

      setProgress({ current: 0, total: selectedIsbns.length });
      console.log(`Starte Import von ${selectedIsbns.length} ausgewählten Büchern`);
      
      // Simuliere Fortschritt für den Benutzer
      let currentProgress = 0;
      const progressInterval = setInterval(() => {
        // Langsam bis 90% voranschreiten - die letzten 10% sind für die Embedding-Erstellung reserviert
        if (currentProgress < 90) {
          currentProgress += (90 - currentProgress) / 10;
          setProgressPercentage(currentProgress);
        }
      }, 500);
      
      // Rufe die Edge-Funktion mit dem authentifizierten Supabase-Client auf
      const { data, error: rpcError } = await authClient.functions.invoke('bulk-import-books', {
        body: { isbns: selectedIsbns } // Nur ausgewählte ISBNs senden
      });
      
      // Fortschrittsinterval stoppen
      clearInterval(progressInterval);
      
      if (rpcError) {
        throw new Error(`Fehler beim Aufruf der Funktion: ${rpcError.message}`);
      }
      
      // Fortschritt erhöhen auf 95%
      setProgressPercentage(95);
      setProgressStage('Embeddings werden erstellt...');
      
      // Simuliere den letzten Schritt der Embedding-Erstellung
      setTimeout(() => {
        setProgressPercentage(100);
        setProgressStage('Import abgeschlossen');
      }, 3000);
      
      console.log('Import abgeschlossen:', data);
      setResults(data);
      
      // Zur Ergebnisansicht wechseln
      setCurrentTab('results');
      
      // Zurück zum Anfangszustand
      setPreviewMode(false);
      setBookPreviews([]);
      
      // ISBN-Liste nach erfolgreichem Import leeren
      setIsbnList('');

    } catch (err: any) {
      console.error('Fehler beim Massenimport:', err);
      setError('Fehler beim Import: ' + (err.message || err));
    } finally {
      setLoading(false);
      // Nach Abschluss und einer Verzögerung Fortschrittsanzeige zurücksetzen
      setTimeout(() => {
        setProgressPercentage(0);
        setProgressStage('');
      }, 3000);
    }
  };

  // Funktion, um die Vorschau abzubrechen und zum Anfangszustand zurückzukehren
  const cancelPreview = () => {
    setPreviewMode(false);
    setBookPreviews([]);
    setCurrentTab('isbn');
  };
  
  // Statistik für die Vorschau
  const stats = {
    total: bookPreviews.length,
    valid: bookPreviews.filter(b => !b.error).length,
    invalid: bookPreviews.filter(b => !!b.error).length,
    selected: bookPreviews.filter(b => b.selected).length
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <DashboardHeader />
      <div className="container py-4 px-2 sm:py-6 sm:px-4 max-w-6xl mx-auto">
        <Card className="bg-white shadow-sm">
          <CardHeader className="pb-3 sm:pb-4 border-b px-3 sm:px-6">
            <div className="flex items-center">
              <Upload className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 mr-2" />
              <CardTitle className="text-xl sm:text-2xl font-bold">Bücher Massenimport</CardTitle>
            </div>
            <CardDescription className="text-sm sm:text-base">
              Importiere mehrere Bücher über ihre ISBN-Nummern und erstelle automatisch Einträge in der Bibliothek.
            </CardDescription>
          </CardHeader>
          
          <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
            <div className="px-3 sm:px-6 pt-3 sm:pt-4">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="isbn" disabled={loading || previewLoading} className="text-xs sm:text-sm py-1.5 sm:py-2">
                  <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" /> ISBN
                </TabsTrigger>
                <TabsTrigger value="preview" disabled={!previewMode || loading || previewLoading} className="text-xs sm:text-sm py-1.5 sm:py-2">
                  <BookOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" /> Vorschau
                </TabsTrigger>
                <TabsTrigger value="results" disabled={!results || loading || previewLoading} className="text-xs sm:text-sm py-1.5 sm:py-2">
                  <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" /> Ergebnisse
                </TabsTrigger>
              </TabsList>
            </div>
            
            <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
              <TabsContent value="isbn" className="mt-0">
                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      ISBN-Nummern (eine pro Zeile oder durch Kommas getrennt):
                    </label>
                    <Textarea 
                      className="w-full min-h-[150px] sm:min-h-[200px] font-mono text-sm" 
                      value={isbnList}
                      onChange={(e) => setIsbnList(e.target.value)}
                      disabled={previewLoading}
                      placeholder="9783453317796&#10;9783453319950&#10;9783426281567"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      <Info className="h-3 w-3 inline mr-1" />
                      Gib die ISBN-Nummern der Bücher ein, die du importieren möchtest. Du kannst sie zeilenweise oder durch Kommas getrennt eingeben.
                    </p>
                  </div>
                  
                  <div className="flex justify-end">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm"
                            onClick={fetchBookPreviews}
                            disabled={previewLoading || !isbnList.trim()}
                          >
                            {previewLoading ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                                Verarbeite...
                              </>
                            ) : (
                              <>
                                <BookOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                Buchvorschau anzeigen
                              </>
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Zeigt eine Vorschau der Bücher, bevor sie importiert werden.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="preview" className="mt-0">
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-blue-50 p-2 sm:p-3 rounded-md">
                    <div className="flex items-center gap-2 mb-2 sm:mb-0">
                      <Info className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 flex-shrink-0" />
                      <span className="text-blue-800 text-sm">Wähle die Bücher aus, die du importieren möchtest.</span>
                    </div>
                    
                    <div className="flex flex-wrap gap-1 sm:gap-2 text-xs sm:text-sm">
                      <Badge variant="outline" className="bg-white">
                        Gesamt: {stats.total}
                      </Badge>
                      <Badge variant="outline" className="bg-white text-green-700">
                        Valide: {stats.valid}
                      </Badge>
                      {stats.invalid > 0 && (
                        <Badge variant="outline" className="bg-white text-red-700">
                          Fehler: {stats.invalid}
                        </Badge>
                      )}
                      <Badge variant="default" className="bg-blue-600">
                        Ausgewählt: {stats.selected}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-2">
                    <div className="flex gap-2 items-center mb-2 sm:mb-0">
                      <Checkbox
                        id="select-all"
                        checked={isAllSelected}
                        onCheckedChange={() => toggleSelectAll()}
                      />
                      <label htmlFor="select-all" className="text-xs sm:text-sm cursor-pointer">
                        Alle auswählen
                      </label>
                      
                      <Separator orientation="vertical" className="h-4 mx-2 hidden sm:block" />
                      
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={selectOnlyValid}
                        className="text-xs h-7 sm:h-8 ml-auto sm:ml-0"
                      >
                        Nur valide
                      </Button>
                    </div>
                    
                    <div className="flex justify-between sm:justify-end gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost" 
                              size="sm"
                              onClick={cancelPreview}
                              disabled={loading}
                              className="text-xs sm:text-sm h-8"
                            >
                              <RotateCcw className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                              Zurück
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Zurück zur ISBN-Eingabe
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              className="flex items-center text-xs sm:text-sm h-8"
                              onClick={importSelectedBooks}
                              disabled={loading || stats.selected === 0}
                            >
                              {loading ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 animate-spin" />
                                  Importiere...
                                </>
                              ) : (
                                <>
                                  <Import className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                                  {stats.selected} importieren
                                </>
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Importiere die ausgewählten Bücher in die Datenbank
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                  
                  <ScrollArea className="h-[250px] sm:h-[350px] rounded-md border p-1 sm:p-2">
                    <div className="space-y-2 sm:space-y-3 pr-2 sm:pr-3">
                      {bookPreviews.map((book) => (
                        <Collapsible 
                          key={book.isbn} 
                          className={`border rounded-md overflow-hidden transition-all ${
                            book.error ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-blue-300'
                          }`}
                        >
                          <div className="flex items-center p-2 sm:p-3">
                            <Checkbox 
                              id={`book-${book.isbn}`}
                              className="mr-2 sm:mr-3"
                              checked={book.selected}
                              onCheckedChange={() => toggleBookSelection(book.isbn)}
                              disabled={!!book.error}
                            />
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 sm:gap-2">
                                {book.error ? (
                                  <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-600 flex-shrink-0" />
                                ) : (
                                  <BookMarked className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-600 flex-shrink-0" />
                                )}
                                
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-col xs:flex-row xs:items-center xs:gap-2">
                                    <p className="font-medium truncate text-xs sm:text-sm">
                                      {book.title || `ISBN: ${book.isbn}`}
                                    </p>
                                    
                                    <Badge variant="outline" className="flex-shrink-0 text-xs mt-1 xs:mt-0 w-fit">
                                      {book.isbn}
                                    </Badge>
                                  </div>
                                  
                                  {!book.error && (
                                    <p className="text-xs text-gray-500 truncate">
                                      {book.author || 'Unbekannter Autor'}
                                    </p>
                                  )}
                                </div>
                              </div>
                              
                              {book.error && (
                                <p className="text-xs text-red-600 mt-1 line-clamp-1">{book.error}</p>
                              )}
                            </div>
                            
                            <CollapsibleTrigger asChild>
                              <button className="ml-1 sm:ml-2 p-1.5 sm:p-2 rounded-full hover:bg-gray-100">
                                <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-500" />
                              </button>
                            </CollapsibleTrigger>
                          </div>
                          
                          <CollapsibleContent>
                            {!book.error ? (
                              <div className="p-2 sm:p-3 pt-0 border-t bg-gray-50">
                                <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 text-xs sm:text-sm">
                                  <div className="flex items-center">
                                    <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-gray-500 mr-1 sm:mr-2" />
                                    <span className="font-medium mr-1">Jahr:</span> 
                                    {book.year || 'N/A'}
                                  </div>
                                  <div className="flex items-center">
                                    <Bookmark className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-gray-500 mr-1 sm:mr-2" />
                                    <span className="font-medium mr-1">Fach:</span> 
                                    {book.subject || 'N/A'}
                                  </div>
                                  <div className="flex items-center">
                                    <GraduationCap className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-gray-500 mr-1 sm:mr-2" />
                                    <span className="font-medium mr-1">Stufe:</span> 
                                    {book.level || 'N/A'}
                                  </div>
                                  <div className="flex items-center">
                                    <School className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-gray-500 mr-1 sm:mr-2" />
                                    <span className="font-medium mr-1">Typ:</span> 
                                    {book.type || 'Lehrmittel'}
                                  </div>
                                  <div className="flex items-center col-span-1 xs:col-span-2 sm:col-span-1">
                                    <Building className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-gray-500 mr-1 sm:mr-2" />
                                    <span className="font-medium mr-1">Schulhaus:</span> 
                                    <span className="truncate">{book.school || 'Chriesiweg'}</span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="p-2 sm:p-3 pt-0 border-t bg-red-50">
                                <div className="flex items-center text-xs sm:text-sm text-red-700">
                                  <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2 flex-shrink-0" />
                                  <span>
                                    Dieses Buch kann nicht importiert werden, da ein Fehler aufgetreten ist.
                                  </span>
                                </div>
                              </div>
                            )}
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </TabsContent>
              
              <TabsContent value="results" className="mt-0">
                <div className="space-y-4 sm:space-y-6">
                  <div className="bg-green-50 border border-green-200 rounded-md p-3 sm:p-4 flex items-start">
                    <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 mt-0.5 mr-2 sm:mr-3 flex-shrink-0" />
                    <div>
                      <h3 className="font-medium text-green-800 text-sm sm:text-base">Import abgeschlossen</h3>
                      <p className="text-green-700 mt-1 text-xs sm:text-sm">
                        Der Import wurde erfolgreich abgeschlossen. Die Bücher wurden in die Datenbank importiert.
                      </p>
                    </div>
                  </div>
                  
                  {results && (
                    <div className="space-y-3 sm:space-y-4">
                      <div className="flex flex-wrap gap-2 sm:gap-3">
                        <Badge variant="outline" className="flex items-center gap-1 text-xs sm:text-sm py-1 sm:py-1.5 px-2 sm:px-3">
                          <BookOpen className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          Gesamt: {results.total}
                        </Badge>
                        <Badge variant="outline" className="flex items-center gap-1 text-xs sm:text-sm py-1 sm:py-1.5 px-2 sm:px-3 bg-green-50 text-green-700 border-green-200">
                          <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          Erfolgreich: {results.successful?.length || 0}
                        </Badge>
                        {results.failed?.length > 0 && (
                          <Badge variant="outline" className="flex items-center gap-1 text-xs sm:text-sm py-1 sm:py-1.5 px-2 sm:px-3 bg-red-50 text-red-700 border-red-200">
                            <XCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            Fehlgeschlagen: {results.failed?.length || 0}
                          </Badge>
                        )}
                      </div>
                      
                      {results.successful?.length > 0 && (
                        <Collapsible className="border rounded-md overflow-hidden">
                          <CollapsibleTrigger asChild>
                            <button className="w-full bg-green-50 p-2 sm:p-3 flex justify-between items-center">
                              <div className="flex items-center">
                                <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-600 mr-1 sm:mr-2" />
                                <h4 className="font-medium text-xs sm:text-sm">Erfolgreich importierte Bücher</h4>
                              </div>
                              <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-500" />
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <ScrollArea className="h-[150px] sm:h-[200px]">
                              <div className="p-2 sm:p-3 space-y-1.5 sm:space-y-2">
                                {results.successful.map((item: any, index: number) => (
                                  <div key={index} className="flex items-center text-xs sm:text-sm border-b pb-1.5 sm:pb-2 last:border-0 last:pb-0">
                                    <BookMarked className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-600 mr-1 sm:mr-2 flex-shrink-0" />
                                    <span className="font-medium mr-1 sm:mr-2">{item.isbn}:</span>
                                    <span className="truncate">{item.data?.title || 'Titel nicht verfügbar'}</span>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                      
                      {results.failed?.length > 0 && (
                        <Collapsible className="border rounded-md overflow-hidden">
                          <CollapsibleTrigger asChild>
                            <button className="w-full bg-red-50 p-2 sm:p-3 flex justify-between items-center">
                              <div className="flex items-center">
                                <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-600 mr-1 sm:mr-2" />
                                <h4 className="font-medium text-xs sm:text-sm">Fehlgeschlagene Importe</h4>
                              </div>
                              <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-500" />
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <ScrollArea className="h-[150px] sm:h-[200px]">
                              <div className="p-2 sm:p-3 space-y-1.5 sm:space-y-2">
                                {results.failed.map((item: any, index: number) => (
                                  <div key={index} className="flex items-start text-xs sm:text-sm border-b pb-1.5 sm:pb-2 last:border-0 last:pb-0">
                                    <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4 mt-0.5 mr-1 sm:mr-2 flex-shrink-0" />
                                    <div>
                                      <span className="font-medium mr-1 sm:mr-2">{item.isbn}:</span>
                                      <span className="text-red-600">{item.error}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                      
                      <div className="flex justify-end">
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            setResults(null);
                            setCurrentTab('isbn');
                          }}
                          className="text-xs sm:text-sm"
                        >
                          <RotateCcw className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                          Neuer Import
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </CardContent>
          </Tabs>
          
          {/* Fortschrittsanzeige */}
          {(loading || previewLoading) && (
            <div className="px-3 sm:px-6 pb-4 sm:pb-6">
              <div className="bg-blue-50 p-3 sm:p-4 rounded-md border border-blue-200 space-y-2 sm:space-y-3">
                <div className="flex justify-between items-center">
                  <p className="font-medium text-blue-800 text-sm sm:text-base">{progressStage}</p>
                  <p className="text-xs sm:text-sm text-blue-700">{Math.round(progressPercentage)}%</p>
                </div>
                <Progress value={progressPercentage} className="w-full h-1.5 sm:h-2" />
                <p className="text-xs sm:text-sm text-blue-700">
                  <Loader2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 inline mr-1 animate-spin" />
                  {loading ? 'Bücher werden importiert und Embeddings erstellt...' : 'Buchvorschauen werden geladen...'}
                  <br className="sm:hidden" /><span className="hidden sm:inline"> </span>Dies kann einige Minuten dauern, besonders bei größeren Mengen.
                </p>
              </div>
            </div>
          )}
          
          {error && (
            <CardFooter className="pt-0 pb-4 sm:pb-6 px-3 sm:px-6">
              <Alert variant="destructive" className="w-full text-xs sm:text-sm">
                <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <AlertTitle>Fehler</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}

export default BulkImportBooks; 