import { supabase } from "./supabase";

export async function fetchBookInfo(isbn: string) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      throw new Error("No access token available");
    }
    
    // URL für Edge-Funktionen aus Umgebungsvariablen
    const functionsUrl = import.meta.env.VITE_SUPABASE_URL ? 
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1` : 
      '';

    const response = await fetch(`${functionsUrl}/book-info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
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
