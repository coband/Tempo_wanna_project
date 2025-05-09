import * as React from 'react';
import { useState, useEffect } from 'react';
import { PdfChat, PdfProvider } from '@/components/books/PdfChat';
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { useSearchParams, useParams } from 'react-router-dom';
import { useSupabase } from '@/contexts/SupabaseContext';

export default function PdfChatPage() {
  // Chat ist standardmäßig geöffnet
  const [chatOpen, setChatOpen] = useState(true);
  const [searchParams] = useSearchParams();
  const params = useParams();
  const chatId = params.id;
  const pdfParam = searchParams.get('pdf');
  const [pdfFile, setPdfFile] = useState<string | undefined>(pdfParam || undefined);
  const supabase = useSupabase();

  // Wenn ein chatId in der URL ist, suche nach dem passenden PDF
  useEffect(() => {
    const loadPdfForChatId = async () => {
      if (!chatId || pdfParam) return; // Nichts tun, wenn kein chatId oder bereits ein PDF-Parameter vorhanden

      try {
        // Prüfe, ob der chatId ein gültiges UUID-Format hat (kann für Chat-IDs nützlich sein)
        const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chatId);
        
        if (!isValidUUID) {
          console.warn("Ungültiger Chat-ID-Format:", chatId);
          return;
        }

        // Suche nach Buchinformationen basierend auf der chatId
        // Implementiere hier deine Logik, um ein Buch anhand der ID zu finden
        // Beispiel: Bei einer Buch-ID könntest du zuerst das Buch abrufen
        const { data: book, error } = await supabase
          .from("books")
          .select("isbn, title")
          .eq("id", chatId)
          .single();

        if (error || !book) {
          console.error("Fehler beim Laden des Buchs:", error);
          return;
        }

        // Wenn die ISBN gefunden wurde, suche nach dem zugehörigen PDF
        if (book.isbn) {
          // Suche nach PDF im R2 Bucket mit ISBN-Präfix
          const bucketName = import.meta.env.VITE_PDF_BUCKET_NAME || 'books';
          
          // PDF-Dateiname nach dem Muster aus BookDetails.tsx
          const pdfPath = `${book.isbn} _${book.title?.replace(/[^\w\säöüÄÖÜß]/g, '')}.pdf`;
          
          // Setze die PDF-Datei
          setPdfFile(pdfPath);
        }
      } catch (err) {
        console.error("Fehler beim Laden des PDFs für Chat:", err);
      }
    };

    loadPdfForChatId();
  }, [chatId, pdfParam, supabase]);

  return (
    <ProtectedRoute>
      <div className="h-screen bg-gray-50 flex flex-col">
        <DashboardHeader className="flex-shrink-0" />
        <div className="flex-1 h-[calc(100vh-4rem)] overflow-hidden">
          <PdfProvider>
            <PdfChat 
              open={chatOpen} 
              onOpenChange={setChatOpen} 
              fullScreen={true} 
              initialPdf={pdfFile}
            />
          </PdfProvider>
        </div>
      </div>
    </ProtectedRoute>
  );
} 