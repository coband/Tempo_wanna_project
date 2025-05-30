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
    // Domain-Erkennung mit erweiterter Bedingung und Logging
    const hostname = window.location.hostname;
    console.log('Hostname:', hostname);
    
    // Cloudflare oder Produktions-Domain erkennen
    const isCloudflare = hostname.includes('pages.dev') || hostname.includes('wanna-books.ch');
    console.log('isCloudflare erkannt:', isCloudflare);
    
    // Für Cloudflare oder Produktion direkt /processPdf verwenden, sonst /api/processPdf
    const basePath = isCloudflare ? "/processPdf" : "/api/processPdf";

    // Der key Parameter sollte exakt der Dateipfad sein, der im R2 Bucket verwendet wird
    // Stellen wir sicher, dass pdfPath keine Slash am Anfang hat oder andere unerwünschte Zeichen
    const cleanPdfPath = pdfPath.replace(/^\/+/, '');
    
    // Absolute URL direkt verwenden, wenn auf Produktionsdomäne
    const baseUrl = hostname.includes('wanna-books.ch') 
      ? 'https://www.wanna-books.ch'
      : window.location.origin;
    
    // Request URL konstruieren, ohne Cache-Buster da dies für Fragen nicht nötig ist
    const requestUrl = `${baseUrl}${basePath}?key=${encodeURIComponent(cleanPdfPath)}&question=${encodeURIComponent(question)}`;
    
    console.log('PDF-Chat API-Aufruf:', requestUrl);
    
    // Headers vorbereiten
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    // Auth-Token hinzufügen, falls vorhanden
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }
    
    // GET-Anfrage mit Query-Parametern
    const response = await fetch(requestUrl, {
      method: "GET",
      headers,
      cache: "no-store"
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      
      console.error('PDF-Chat API-Fehler:', {
        status: response.status,
        url: requestUrl,
        response: errorData
      });
      
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorData?.error || errorText || 'Unbekannter Fehler'}`);
    }

    // Antwort abrufen und analysieren
    const data = await response.json();
    console.log('PDF-Chat API-Antwort:', data);
    
    // Prüfen, ob überhaupt Daten zurückgegeben wurden
    if (!data) {
      throw new Error("Leere Antwort von der API erhalten");
    }
    
    // Prüfen, ob answer-Feld vorhanden ist
    if (!data.answer) {
      console.warn("API-Antwort enthält kein answer-Feld:", data);
      
      // Versuche ein alternatives Feld zu finden
      for (const field of ['summary', 'text', 'content', 'result']) {
        if (data[field] && typeof data[field] === 'string' && data[field].trim()) {
          console.log(`Alternatives Feld '${field}' verwendet`);
          return data[field];
        }
      }
      
      // Wenn kein passendes Feld gefunden wurde, wirf einen Fehler
      throw new Error("Keine gültige Antwort von der API erhalten");
    }
    
    // Prüfen, ob die Antwort leer ist
    if (typeof data.answer !== 'string' || !data.answer.trim()) {
      throw new Error("Die API hat eine leere Antwort zurückgegeben");
    }

    return data.answer;
  } catch (error: any) {
    console.error('PDF-Chat Fehler:', error);
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
    // Domain-Erkennung mit erweiterter Bedingung und Logging
    const hostname = window.location.hostname;
    console.log('Hostname:', hostname);
    
    // Cloudflare oder Produktions-Domain erkennen
    const isCloudflare = hostname.includes('pages.dev') || hostname.includes('wanna-books.ch');
    console.log('isCloudflare erkannt:', isCloudflare);
    
    // Für Cloudflare oder Produktion direkt /listPdfs verwenden, sonst /api/listPdfs
    const endpoint = isCloudflare ? "/listPdfs" : "/api/listPdfs";

    // Headers vorbereiten
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    // Auth-Token hinzufügen, falls vorhanden
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }
    
    // Cache-Strategie verbessern - nur alle 5 Minuten aktualisieren
    // Statische Variable für den letzten API-Aufruf und die Ergebnisse
    if (!fetchPdfs.lastFetchTime) {
      fetchPdfs.lastFetchTime = 0;
      fetchPdfs.cachedResults = null;
    }
    
    // Prüfen, ob der Cache noch gültig ist (nicht älter als 5 Minuten)
    const now = Date.now();
    const cacheAge = now - fetchPdfs.lastFetchTime;
    const cacheValidDuration = 5 * 60 * 1000; // 5 Minuten in Millisekunden
    
    // Wenn wir gültige Ergebnisse im Cache haben, verwenden wir diese
    if (fetchPdfs.cachedResults && cacheAge < cacheValidDuration) {
      console.log('Verwende zwischengespeicherte PDF-Liste (Alter:', Math.round(cacheAge/1000), 's)');
      return fetchPdfs.cachedResults;
    }
    
    // Absolute URL direkt verwenden, wenn auf Produktionsdomäne
    const requestUrl = hostname.includes('wanna-books.ch') 
      ? `https://www.wanna-books.ch${endpoint}`
      : `${window.location.origin}${endpoint}`;
    
    console.log('ListPDFs API-Aufruf:', requestUrl);
    
    const response = await fetch(requestUrl, {
      method: "GET",
      headers,
      // Cache-Kontrolle festlegen - wir verwenden jetzt unseren eigenen Cache
      cache: "no-store"
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      
      console.error('ListPDFs API-Fehler:', {
        status: response.status,
        url: requestUrl,
        response: errorData
      });
      
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorData?.error || errorText || 'Unbekannter Fehler'}`);
    }

    const data = await response.json();
    
    if (!data || !data.files) {
      throw new Error("Keine gültigen Daten von der API erhalten");
    }

    // Ergebnisse im Cache speichern
    fetchPdfs.lastFetchTime = now;
    fetchPdfs.cachedResults = data.files;
    
    return data.files;
  } catch (error) {
    console.error('ListPDFs Fehler:', error);
    throw error;
  }
}

// Typdefinitionen für die statischen Eigenschaften der fetchPdfs-Funktion
declare global {
  interface Function {
    lastFetchTime?: number;
    cachedResults?: any;
  }
}
