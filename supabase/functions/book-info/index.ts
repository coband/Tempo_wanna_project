import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { getCorsHeaders, handleCorsPreflightRequest } from "../cors.ts";
import { GoogleGenAI } from "https://esm.sh/@google/genai";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

serve(async (req) => {
  // CORS-Präflight-Anfrage
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Debugging: Log des Origin-Headers
  const origin = req.headers.get("Origin");
  console.log("Anfrage-Origin:", origin);
  
  try {
    let userId = null;
    let isAuthenticated = false;
    
    // JWT Token aus dem Authorization Header extrahieren (optional)
    const authHeader = req.headers.get("Authorization");
    
    if (authHeader) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        
        if (!userError && userData?.user?.id) {
          userId = userData.user.id;
          isAuthenticated = true;
          console.log("Benutzer erfolgreich authentifiziert:", userId);
        } else {
          console.log("Token-Validierung fehlgeschlagen:", userError);
          try {
            // Evtl. Clerk-Token prüfen
            const tokenParts = token.split(".");
            if (tokenParts.length === 3) {
              console.log("Token hat eine gültige JWT-Struktur (möglicherweise Clerk-Token).");
            }
          } catch (jwtError) {
            console.error("Fehler bei der JWT-Analyse:", jwtError);
          }
        }
      } catch (authError) {
        console.error("Fehler bei der Authentifizierung:", authError);
      }
    } else {
      console.log("Kein Authorization Header vorhanden");
    }
    
    const requestBody = await req.json();
    const { isbn, preview } = requestBody;
    const isPreviewMode = preview === true;
    
    console.log(`Modus: ${isPreviewMode ? 'Vorschau' : 'Import'} für ISBN: ${isbn}`);
    
    if (!isPreviewMode && !isAuthenticated) {
      return new Response(
        JSON.stringify({ 
          error: 'Authentifizierung erforderlich für den Import-Modus',
          message: 'Bitte melden Sie sich an, um diese Funktion zu nutzen.'
        }),
        {
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    if (!isbn) {
      return new Response(
        JSON.stringify({
          error: "Ungültige Anfrage. Bitte geben Sie eine ISBN an.",
        }),
        {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    // Prüfen, ob das Buch bereits existiert
    const { data: existingBook } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      .from("books")
      .select("*")
      .eq("isbn", isbn)
      .maybeSingle();

    if (existingBook) {
      console.log(`Buch mit ISBN ${isbn} existiert bereits:`, existingBook);
      return new Response(JSON.stringify(existingBook), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // === Neuer Teil: Gemini API-Aufruf ===
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY ist nicht konfiguriert");
    }

    // API initialisieren genau wie im Beispiel
    const ai = new GoogleGenAI({vertexai: false, apiKey: GEMINI_API_KEY});
    
    console.log("GEMINI_API_KEY vorhanden:", !!GEMINI_API_KEY);
    console.log("API-Objekt erstellt");
    
    // Prompt für die Buchinformationen
    const prompt = `Bitte verwende unbedingt die Google-Suche, um genaue Informationen zu diesem Buch zu finden: Suche nach dem Buch mit der ISBN ${isbn}. Gib die Informationen ausschließlich als valides JSON-Objekt zurück, ohne zusätzlichen Text. Das JSON sollte folgende Felder enthalten: 'Titel', 'Autor', 'ISBN', 'Stufe' (Kindergarten, 1. Klasse, 2. Klasse, 3. Klasse, 4. Klasse, 5. Klasse, 6. Klasse) es könenn auch mehrere Stufen sein (1., 2., 3. Klasse gehören zur Unterstufe, 4., 5., 6. Klasse gehören Mittelstufe und 7., 8., 9. Klasse gehören zur Oberstufe, 1.-6. Klasse ist Grundschule), 'Fach' (Mathematik, Deutsch, Französisch, NMG, Sport, Musik, Englisch, Bildnerisches Gestalten, TTG, Medien und Informatik, Deutsch als Zweitsprache (DaZ), Förderung (IF) Divers), 'Erscheinungsjahr', 'Typ' (Verwende ausschliesslich: Lehrmittel, Lesebuch, Fachbuch, Sachbuch, Comic, Bilderbuch, Lernmaterial(Spiele, Karten etc.)), 'Verlag', 'Beschreibung'. Es sollte eine allgemeine Beschriebung sein, in der steht welche Themen im Lehrmittel/Buch behandelt werden und für welches Schuljahre es ist. Wenn eine Information nicht verfügbar ist, verwende null als Wert.`;

    console.log("Sende Anfrage an Gemini API...");
    
    let content;
    try {
      // Exakt den gleichen Anfragestruktur wie im Beispiel verwenden
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
          temperature: 0.1,
          tools: [{googleSearch: {}}],
          systemInstruction: [
            {
              text: 'Du bist ein präziser Buchinformations-Assistent. Deine Aufgabe ist es, genaue Daten zu Büchern oder Lernmaterialien basierend auf ihrer ISBN zu liefern. Antworte ausschließlich mit einem validen JSON-Objekt. Verwende immer die Google-Suche, um die Informationen zu finden. Wenn ich dir eine Auswahl von Antworten in einer Klammer gebe, dann verwende ausschliesslich diese für das JSON-Objekt.',
            }
        ],
        },
      });
      
      console.log("Antwort von Gemini API erhalten");
      
      // Logging der Grounding-Metadaten für Debugging
      if (response?.candidates?.[0]?.groundingMetadata) {
        console.log("Grounding-Metadaten:", JSON.stringify(response.candidates[0].groundingMetadata));
      }
      
      // Text aus der Antwort extrahieren
      content = response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      
      console.log("Content from API:", content);
    } catch (error) {
      console.error("Fehler beim Aufruf der Gemini API:", error);
      throw error;
    }

    // JSON aus dem AI-Content extrahieren
    let bookData;
    try {
      // Markdown-Block entfernen, falls vorhanden
      const cleanContent = content.replace(/```json\n?|```/g, "").trim();
      console.log("Bereinigter JSON-Content:", cleanContent);
      bookData = JSON.parse(cleanContent);
    } catch (e) {
      console.error("Fehler beim JSON-Parsen der AI-Antwort:", content);
      return new Response(
        JSON.stringify({
          error: "Invalid JSON response from AI",
          content: content,
        }),
        {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    // Falls "Stufe" als Array zurückkommt, in String umwandeln
    if (bookData?.Stufe && Array.isArray(bookData.Stufe)) {
      bookData.Stufe = bookData.Stufe.join(", ");
    }

    // Standardwerte für fehlende Felder
    const defaultValues = {
      Titel: null,
      Autor: null,
      ISBN: isbn,
      Stufe: null,
      Fach: null,
      Erscheinungsjahr: null,
      Beschreibung: null,
      Typ: null,
      Verlag: null,
    };
    bookData = { ...defaultValues, ...bookData };

    // ISBN prüfen
    if (bookData.ISBN !== isbn) {
      console.warn(
        `API hat eine andere ISBN zurückgegeben als angefragt. Erwartet: ${isbn}, erhalten: ${bookData.ISBN}`
      );
      bookData.ISBN = isbn; // Wir erzwingen die ursprüngliche ISBN
    }

    // Prüfe, ob genug Buch-Infos vorliegen
    if (!bookData.Titel) {
      console.error("Keine ausreichenden Buchinformationen gefunden für ISBN:", isbn);
      return new Response(
        JSON.stringify({ 
          error: "Keine ausreichenden Buchinformationen gefunden", 
          details: "Es konnten keine Titelinformationen für diese ISBN gefunden werden",
          isbn 
        }),
        {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          status: 404,
        }
      );
    }

    // Buchdaten für Antwort/DB formatieren
    const formattedBookData = {
      title: bookData.Titel || "Unbekannter Titel",
      author: bookData.Autor || "Unbekannt",
      isbn: isbn, // erzwungene ursprüngliche ISBN
      level: typeof bookData.Stufe === "string"
        ? bookData.Stufe
        : Array.isArray(bookData.Stufe)
          ? bookData.Stufe.join(", ")
          : bookData.Stufe?.toString() || "Unbekannt",
      subject: bookData.Fach || "Unbekannt",
      year: bookData.Erscheinungsjahr ? parseInt(bookData.Erscheinungsjahr, 10) : new Date().getFullYear(),
      description: bookData.Beschreibung || "Keine Beschreibung verfügbar",
      type: bookData.Typ || "Lehrmittel",
      publisher: bookData.Verlag || "Unbekannt",
    };

    // Im Vorschaumodus nur Daten zurückgeben, nicht in DB speichern
    if (isPreviewMode) {
      console.log("Vorschaumodus aktiv – kein DB-Eintrag");
      return new Response(JSON.stringify(formattedBookData), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    } else {
      console.log("Import-Modus aktiv – Eintrag in Datenbank wird erstellt");
    }

    // Service-Role-Client für DB-Zugriff
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const bookEntry = {
      ...formattedBookData,
      user_id: userId,
      created_at: new Date().toISOString(),
      available: true,
      location: "Schule",
    };

    console.log("Füge Buch in Datenbank ein:", bookEntry);

    const { data: insertedBook, error: insertError } = await adminClient
      .from("books")
      .insert([bookEntry])
      .select()
      .single();

    if (insertError) {
      console.error("Fehler beim Einfügen des Buchs:", insertError);
      return new Response(
        JSON.stringify({ 
          error: "Fehler beim Speichern des Buchs in der Datenbank", 
          details: insertError.message,
          bookData 
        }),
        {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    console.log("Buch erfolgreich eingefügt:", insertedBook);

    // Optional: Embeddings generieren
    try {
      if (insertedBook && insertedBook.id) {
        console.log(`Starte Embedding-Generierung für Buch ${insertedBook.id}`);
        
        fetch(`${SUPABASE_URL}/functions/v1/createEmbeddings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({
            bookIds: [insertedBook.id]
          })
        }).catch(embedError => {
          console.error("Fehler beim Aufruf der Embedding-Funktion:", embedError);
        });
      }
    } catch (error) {
      console.error("Fehler nach dem Einfügen des Buchs:", error);
    }

    return new Response(JSON.stringify(insertedBook || bookData), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Fehler beim Abrufen der Buchinformationen:", error);
    return new Response(
      JSON.stringify({
        error: "Fehler beim Abrufen der Buchinformationen",
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  }
});
