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
 * @param pdfPath Der Pfad zur PDF-Datei im Supabase-Bucket
 * @param question Die Frage, die zu dieser PDF beantwortet werden soll
 * @param authToken Optionaler Auth-Token für authentifizierte Anfragen
 * @returns Die Antwort der Gemini-API
 */
export async function askPdfQuestion(pdfPath: string, question: string, authToken?: string) {
  try {
    // Basis-URL aus der Umgebung lesen
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const endpoint = `${baseUrl}/api/processPdf`;

    // API Key holen - verwende authToken falls vorhanden
    const apiKey = authToken || getApiKey();

    // Headers vorbereiten
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // Authentifizierungsheader hinzufügen - wir verwenden den Token oder den anonymen API-Key
      "Authorization": `Bearer ${apiKey}`,
    };
    
    // API-Anfrage senden
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ pdfPath, question }),
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
  } catch (error) {
    console.error("Fehler beim Abfragen der PDF:", error);
    throw error;
  }
}
