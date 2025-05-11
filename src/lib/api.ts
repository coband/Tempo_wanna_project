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
  try {
    // URL basierend auf Umgebung bestimmen (analog zu fetchPdfs)
    const isCloudflare = window.location.hostname.includes('pages.dev');
    // Für Cloudflare direkt /processPdf verwenden, sonst /api/processPdf
    const endpoint = isCloudflare ? "/processPdf" : "/api/processPdf";

    // Headers vorbereiten
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    // Auth-Token hinzufügen, falls vorhanden
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }
    
    // Erstelle URL mit Query-Parametern
    const url = new URL(endpoint, window.location.origin);
    url.searchParams.append('key', pdfPath);
    url.searchParams.append('question', encodeURIComponent(question));
    // Cache-busting Parameter hinzufügen
    url.searchParams.append('_cb', Date.now().toString());
    
    // GET-Anfrage mit Query-Parametern statt POST mit Body
    const response = await fetch(url.toString(), {
      method: "GET",
      headers,
      cache: "no-store"
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorData?.error || 'Unbekannter Fehler'}`);
    }

    const data = await response.json();
    
    if (!data || !data.answer) {
      throw new Error("Keine gültige Antwort von der API erhalten");
    }

    return data.answer;
  } catch (error: any) {
    throw error;
  }
}

/**
 * Ruft die Liste der verfügbaren PDF-Dateien vom API-Endpunkt ab
 * @param authToken Der JWT-Token für die Authentifizierung
 * @returns Eine Liste mit PDF-Datei-Informationen
 */
export async function fetchPdfs(authToken?: string) {
  try {
    // URL basierend auf Umgebung bestimmen
    const isCloudflare = window.location.hostname.includes('pages.dev');
    // Für Cloudflare direkt /listPdfs verwenden, sonst /api/listPdfs
    const endpoint = isCloudflare ? "/listPdfs" : "/api/listPdfs";

    // Headers vorbereiten
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    // Auth-Token hinzufügen, falls vorhanden
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }
    
    // Cache-busting Parameter für die API-Anfrage hinzufügen
    const cacheBuster = Date.now();
    const requestUrl = `${endpoint}?_cb=${cacheBuster}`;
    
    const response = await fetch(requestUrl, {
      method: "GET",
      headers,
      // Cache-Kontrolle hinzufügen
      cache: "no-store"
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorData?.error || 'Unbekannter Fehler'}`);
    }

    const data = await response.json();
    
    if (!data || !data.files) {
      throw new Error("Keine gültigen Daten von der API erhalten");
    }

    return data.files;
  } catch (error) {
    throw error;
  }
}
