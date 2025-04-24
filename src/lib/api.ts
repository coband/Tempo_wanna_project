// Funktion, die einen Supabase API Key für direkte Aufrufe der Edge-Funktionen holt
// Wir verwenden anon key für öffentliche Edge-Funktions-Aufrufe
const getApiKey = () => {
  return import.meta.env.VITE_SUPABASE_ANON_KEY || '';
};

export async function fetchBookInfo(isbn: string, authToken?: string) {
  try {
    // URL für Edge-Funktionen aus Umgebungsvariablen
    const functionsUrl = import.meta.env.VITE_SUPABASE_URL ? 
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1` : 
      '';

    if (!functionsUrl) {
      throw new Error("Supabase URL is not configured");
    }

    // API Key holen - verwende authToken falls vorhanden
    const apiKey = authToken || getApiKey();

    // Headers vorbereiten
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // Authentifizierungsheader hinzufügen - wir verwenden den Token oder den anonymen API-Key
      "Authorization": `Bearer ${apiKey}`,
      // x-client-info header hinzufügen für Supabase
      "x-client-info": "@supabase/auth-helpers-nextjs"
    };
    
    // Edge-Funktion mit Authentifizierung aufrufen
    const response = await fetch(`${functionsUrl}/book-info`, {
      method: "POST",
      headers,
      body: JSON.stringify({ isbn, preview: true }), // Wir verwenden den Preview-Modus
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data) {
      throw new Error("No data returned from function");
    }

    return {
      title: data.title || "",
      author: data.author || "",
      isbn: data.isbn || isbn,
      level: data.level || "",
      subject: data.subject || "",
      year: data.year ? parseInt(data.year) : new Date().getFullYear(),
      location: data.location || "Bibliothek",
      available: true,
      description: data.description || "",
      type: data.type || "",
      school: data.school || "Chriesiweg",
      publisher: data.publisher || "",
    };
  } catch (error) {
    console.error("Error fetching book info:", error);
    throw error;
  }
}

/**
 * Sendet eine Frage zu einer PDF-Datei an die processPdf-API und gibt die Antwort zurück
 * @param pdfPath Der Pfad zur PDF-Datei im Cloudflare R2 Bucket
 * @param question Die Frage, die zu dieser PDF beantwortet werden soll
 * @param authToken Optionaler Auth-Token für authentifizierte Anfragen
 * @returns Die Antwort der Gemini-API
 */
export async function askPdfQuestion(pdfPath: string, question: string, authToken?: string) {
  // Eindeutige ID für diese Anfrage generieren
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  
  console.log(`📊 [${requestId}] API.TS: askPdfQuestion START`, new Date().toISOString());
  console.log(`📊 [${requestId}] PDF: "${pdfPath}", Frage: "${question.substring(0, 30)}..."`);
  console.log(`📊 [${requestId}] Auth-Token vorhanden: ${!!authToken}`);
  
  try {
    // Basis-URL aus der Umgebung lesen
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const endpoint = `${baseUrl}/api/processPdf`;
    
    console.log(`📊 [${requestId}] Bereite Anfrage an ${endpoint} vor`);

    // Headers vorbereiten
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    // Auth-Token hinzufügen, falls vorhanden
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
      console.log(`📊 [${requestId}] Authorization-Header hinzugefügt`);
    }
    
    // API-Anfrage senden
    console.log(`📊 [${requestId}] Sende Anfrage an ${endpoint}`, new Date().toISOString());
    const startTime = performance.now();
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ pdfPath, question }),
    });
    
    const endTime = performance.now();
    console.log(`📊 [${requestId}] Antwort erhalten nach ${Math.round(endTime - startTime)}ms`, new Date().toISOString());
    console.log(`📊 [${requestId}] Status: ${response.status}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.log(`📊 [${requestId}] Fehler: ${JSON.stringify(errorData)}`);
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorData?.error || 'Unbekannter Fehler'}`);
    }

    console.log(`📊 [${requestId}] Antwortobjekt wird gelesen...`);
    const data = await response.json();
    
    if (!data || !data.answer) {
      console.log(`📊 [${requestId}] Keine gültige Antwort erhalten: ${JSON.stringify(data)}`);
      throw new Error("Keine gültige Antwort von der API erhalten");
    }

    console.log(`📊 [${requestId}] Antwort erfolgreich verarbeitet, Länge: ${data.answer.length} Zeichen`);
    console.log(`📊 [${requestId}] askPdfQuestion ENDE`, new Date().toISOString());
    return data.answer;
  } catch (error: any) {
    console.error(`📊 [${requestId}] FEHLER:`, error);
    console.log(`📊 [${requestId}] askPdfQuestion FEHLER ENDE`, new Date().toISOString());
    throw error;
  }
}
