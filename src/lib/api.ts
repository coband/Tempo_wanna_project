// Funktion, die einen Supabase API Key für direkte Aufrufe der Edge-Funktionen holt
// Wir verwenden anon key für öffentliche Edge-Funktions-Aufrufe
const getApiKey = () => {
  return import.meta.env.VITE_SUPABASE_ANON_KEY || '';
};

export async function fetchBookInfo(isbn: string) {
  try {
    // URL für Edge-Funktionen aus Umgebungsvariablen
    const functionsUrl = import.meta.env.VITE_SUPABASE_URL ? 
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1` : 
      '';

    if (!functionsUrl) {
      throw new Error("Supabase URL is not configured");
    }

    // API Key holen
    const apiKey = getApiKey();

    // Headers vorbereiten
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // Authentifizierungsheader hinzufügen - wir verwenden den anonymen API-Key
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
    console.log("Raw API Response:", data);

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
      location: data.location || "Bibliothek", // Default value
      available: true, // Default value
      description: data.description || "",
      type: data.type || "Lehrmittel", // Neues Feld
      school: data.school || "Chriesiweg", // Neues Feld
      publisher: data.publisher || "", // Verlagsfeld hinzufügen
    };
  } catch (error) {
    console.error("Error fetching book info:", error);
    throw error;
  }
}
