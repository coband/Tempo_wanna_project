import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";

// Typ für Buchdaten
interface BookPreview {
  isbn: string;
  title: string | null;
  author: string | null;
  year: number | null;
  subject: string | null;
  level: string | null;
  selected: boolean; // Flag zur Auswahl/Abwahl
  error?: string; // Für Fehler beim Abrufen der Vorschau
}

export default function BulkImportBooks() {
  const [isbnList, setIsbnList] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  
  // Neuer State für die Vorschau
  const [previewMode, setPreviewMode] = useState(false);
  const [bookPreviews, setBookPreviews] = useState<BookPreview[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

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

  // Funktion zum Abrufen von Buchvorschauen
  const fetchBookPreviews = async () => {
    setPreviewLoading(true);
    setError('');
    
    try {
      // ISBN-Nummern in ein Array umwandeln (nach Zeilenumbrüchen oder Kommas trennen)
      const isbns = isbnList
        .split(/[\n,]+/)
        .map(isbn => isbn.trim())
        .filter(isbn => isbn.length > 0);
      
      if (isbns.length === 0) {
        setError('Bitte gib mindestens eine ISBN-Nummer ein.');
        setPreviewLoading(false);
        return;
      }

      setProgress({ current: 0, total: isbns.length });
      console.log(`Starte Vorschau für ${isbns.length} Bücher`);
      
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        throw new Error('Keine aktive Sitzung gefunden');
      }

      const accessToken = session.data.session.access_token;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bulk-import-books`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({ isbns, preview: true }) // preview-Flag hinzugefügt
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server antwortet mit Statuscode ${response.status}: ${errorText}`);
      }

      const data = await response.json();
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
          selected: true // Standardmäßig ausgewählt
        })),
        ...data.failed.map((item: any) => ({
          isbn: item.isbn,
          title: null,
          author: null,
          year: null,
          subject: null,
          level: null,
          selected: false, // Fehlgeschlagene standardmäßig nicht ausgewählt
          error: item.error
        }))
      ];
      
      setBookPreviews(previews);
      setPreviewMode(true);
    } catch (err: any) {
      console.error('Fehler bei der Buchvorschau:', err);
      setError('Fehler bei der Vorschau: ' + (err.message || err));
    } finally {
      setPreviewLoading(false);
    }
  };

  // Funktion zum Abschließen des Imports der ausgewählten Bücher
  const importSelectedBooks = async () => {
    setLoading(true);
    setError('');
    setResults(null);
    
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
      
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        throw new Error('Keine aktive Sitzung gefunden');
      }

      const accessToken = session.data.session.access_token;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bulk-import-books`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({ isbns: selectedIsbns }) // Nur ausgewählte ISBNs senden
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server antwortet mit Statuscode ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      setResults(data);
      console.log('Import abgeschlossen:', data);
      
      // Zurück zum Anfangszustand
      setPreviewMode(false);
      setBookPreviews([]);
    } catch (err: any) {
      console.error('Fehler beim Massenimport:', err);
      setError('Fehler beim Import: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  // Funktion, um die Vorschau abzubrechen und zum Anfangszustand zurückzukehren
  const cancelPreview = () => {
    setPreviewMode(false);
    setBookPreviews([]);
  };

  return (
    <Card className="p-4 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Bücher Massenimport</h2>
      
      {!previewMode ? (
        // Eingabebereich für ISBN-Nummern (nur sichtbar, wenn keine Vorschau angezeigt wird)
        <div className="mb-4">
          <label className="block mb-2">
            ISBN-Nummern (eine pro Zeile oder durch Kommas getrennt):
            <Textarea 
              className="w-full p-2 border rounded mt-1" 
              rows={10}
              value={isbnList}
              onChange={(e) => setIsbnList(e.target.value)}
              disabled={previewLoading}
              placeholder="9783453317796&#10;9783453319950&#10;9783426281567"
            />
          </label>
        </div>
      ) : (
        // Vorschaubereich für Bücher
        <div className="mb-4">
          <h3 className="text-xl font-bold mb-2">Buchvorschau</h3>
          <p className="mb-4">Bitte überprüfe die folgenden Bücher und wähle aus, welche importiert werden sollen:</p>
          
          <div className="max-h-96 overflow-y-auto border rounded p-2">
            {bookPreviews.map((book) => (
              <div key={book.isbn} className={`p-2 mb-2 border rounded ${book.error ? 'bg-red-50' : 'bg-gray-50'}`}>
                <div className="flex items-start">
                  <Checkbox 
                    id={`book-${book.isbn}`}
                    className="mr-2 mt-1"
                    checked={book.selected}
                    onCheckedChange={() => toggleBookSelection(book.isbn)}
                    disabled={!!book.error}
                  />
                  <div className="flex-1">
                    <p className="font-bold">ISBN: {book.isbn}</p>
                    {book.error ? (
                      <p className="text-red-600 text-sm">{book.error}</p>
                    ) : (
                      <>
                        <p><span className="font-medium">Titel:</span> {book.title || 'Nicht verfügbar'}</p>
                        <p><span className="font-medium">Autor:</span> {book.author || 'Nicht verfügbar'}</p>
                        <div className="grid grid-cols-3 gap-2 text-sm mt-1">
                          <p><span className="font-medium">Jahr:</span> {book.year || 'N/A'}</p>
                          <p><span className="font-medium">Fach:</span> {book.subject || 'N/A'}</p>
                          <p><span className="font-medium">Stufe:</span> {book.level || 'N/A'}</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-4 flex justify-between">
            <Button
              variant="outline"
              onClick={cancelPreview}
              disabled={loading}
            >
              Zurück zur ISBN-Eingabe
            </Button>
            
            <div>
              <span className="mr-2 text-sm">
                {bookPreviews.filter(b => b.selected).length} von {bookPreviews.length} Büchern ausgewählt
              </span>
              <Button
                variant="default"
                onClick={importSelectedBooks}
                disabled={loading || bookPreviews.filter(b => b.selected).length === 0}
              >
                {loading ? 'Importiere...' : 'Ausgewählte Bücher importieren'}
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {!previewMode && (
        <Button
          variant="default"
          className="px-4 py-2"
          onClick={fetchBookPreviews}
          disabled={previewLoading || !isbnList.trim()}
        >
          {previewLoading ? 'Vorschau wird geladen...' : 'Vorschau anzeigen'}
        </Button>
      )}
      
      {(loading || previewLoading) && progress.total > 0 && (
        <div className="mt-4">
          <p>Verarbeite Bücher... Bitte warten.</p>
          <p>Dies kann einige Minuten dauern bei großen Mengen.</p>
        </div>
      )}
      
      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}
      
      {results && !previewMode && (
        <div className="mt-4">
          <h3 className="text-xl font-bold">Ergebnisse</h3>
          <p>Gesamt: {results.total}, Erfolgreich: {results.successful.length}, Fehlgeschlagen: {results.failed.length}</p>
          
          {results.successful.length > 0 && (
            <div className="mt-2">
              <h4 className="font-bold">Erfolgreich importierte Bücher:</h4>
              <div className="max-h-60 overflow-y-auto border p-2 rounded mt-1">
                {results.successful.map((item: any, index: number) => (
                  <p key={index} className="text-sm">
                    ISBN {item.isbn}: {item.data?.title || 'Titel nicht verfügbar'}
                  </p>
                ))}
              </div>
            </div>
          )}
          
          {results.failed.length > 0 && (
            <div className="mt-2">
              <h4 className="font-bold text-red-600">Fehlgeschlagene Importe:</h4>
              <div className="max-h-60 overflow-y-auto border p-2 rounded mt-1 text-red-600">
                {results.failed.map((item: any, index: number) => (
                  <p key={index} className="text-sm">
                    ISBN {item.isbn}: {item.error}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
} 