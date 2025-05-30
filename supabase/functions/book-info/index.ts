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
    let isAdmin = false; // Neue Variable für Admin-Prüfung
    
    // JWT Token aus dem Authorization Header extrahieren (optional)
    const authHeader = req.headers.get("Authorization");
    
    if (authHeader) {
      try {
        // Native Clerk-Supabase Integration: Token direkt verwenden
        const token = authHeader.replace("Bearer ", "");
        
        // Client mit dem Token als Authorization Header erstellen
        const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        });
        
        // Teste, ob der Client Zugriff hat, indem wir eine einfache Abfrage machen
        const { data: authTest, error: authError } = await supabaseClient
          .from('books')
          .select('count')
          .limit(1);
        
        if (authError) {
          console.log("Authentifizierungsfehler:", authError.message);
        } else {
          // Extrahiere die User-ID aus dem JWT für Logging-Zwecke
          try {
            const tokenParts = token.split(".");
            if (tokenParts.length === 3) {
              const payload = JSON.parse(atob(tokenParts[1]));
              userId = payload.sub || payload.user_id || 'authorized-user';
              isAuthenticated = true;
              
              // Debug Ausgabe
              console.log('JWT Payload:', JSON.stringify(payload, null, 2));
              
              // Benutzerrolle gemäß Clerk-Konfiguration prüfen
              // "user_role": "{{user.public_metadata.role}}"
              const userRole = payload.user_role || 
                             (payload.public_metadata && payload.public_metadata.role) || 
                             '';
              
              // Admin-Rechte prüfen
              isAdmin = userRole === 'admin' || userRole === 'superadmin';
              
              // Entwickler-Account-Prüfung für Backup
              if (userId === 'user_2u6GF7qf06US4ov8fSpVFojMrkq') {
                console.log('Entwickler-Account erkannt, Admin-Zugriff gewährt');
                isAdmin = true;
              }
              
              console.log(`Benutzer erfolgreich authentifiziert: ${userId} mit Rolle "${userRole}", Admin: ${isAdmin}`);
            }
          } catch (e) {
            console.log("Konnte User-ID nicht aus Token extrahieren");
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
    
    // Für Import-Modus benötigen wir Admin-Rechte
    if (!isPreviewMode && !isAdmin) {
      return new Response(
        JSON.stringify({ 
          error: 'Nur Administratoren können Bücher importieren',
          message: 'Sie benötigen Admin-Rechte für diese Funktion.'
        }),
        {
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
          status: 403,
        }
      );
    } else if (!isPreviewMode && !isAuthenticated) {
      // Für nicht authentifizierte Benutzer
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
    const prompt = `Bitte verwende unbedingt die Google-Suche, um genaue Informationen zu diesem Buch zu finden: Suche nach dem Buch mit der ISBN ${isbn}. Gib die Informationen ausschließlich als valides JSON-Objekt zurück, ohne zusätzlichen Text. Das JSON sollte folgende Felder enthalten: 'Titel', 'Autor', 'ISBN', 'Stufe' (Kindergarten, 1. Klasse, 2. Klasse, 3. Klasse, 4. Klasse, 5. Klasse, 6. Klasse) es könenn auch mehrere Stufen sein, 'Fach' (Mathematik, Deutsch, Französisch, NMG, Sport, Musik, Englisch, Bildnerisches Gestalten, TTG, Medien und Informatik, Deutsch als Zweitsprache, Förderung, Divers), 'Erscheinungsjahr', 'Typ' (Lehrmittel, Lesebuch, Fachbuch, Sachbuch, Comic, Bilderbuch, Lernmaterial), 'Verlag', 'Beschreibung'. Es sollte eine allgemeine Beschriebung sein, in der steht welche Themen im Lehrmittel/Buch behandelt werden und für welches Schuljahre es ist. Wenn es sich beim Fach um Deutsch als Zweitsprache handelt, dann füge auch immer noch das Fach "Deutsch" hinzu. Beim Typ "Lernmateial" sind Spiele, Karten, Poster etc. gemeint. Wenn eine Information nicht verfügbar ist, verwende null als Wert.`;

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
              text: 'Du bist ein präziser Buchinformations-Assistent. Deine Aufgabe ist es, genaue Daten zu Lehrmitteln, Büchern oder Lernmaterialien basierend auf ihrer ISBN zu liefern. Antworte ausschließlich mit einem validen JSON-Objekt. Verwende immer die Google-Suche, um die Informationen zu finden. Falls ich dir in Klammer Begriffe gebe, verwende ausschließlich diese Begriffe für das JSON-Objekt.',
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

    // ISBN-Bereinigungsfunktion - entfernt alle Bindestriche
    const cleanIsbn = (isbn: string): string => {
      return isbn ? isbn.replace(/-/g, '') : isbn;
    };

    // Im Vorschaumodus nur Daten zurückgeben, nicht in DB speichern
    if (isPreviewMode) {
      console.log("Vorschaumodus aktiv – kein DB-Eintrag");
      return new Response(JSON.stringify({
        ...formattedBookData,
        isbn: cleanIsbn(formattedBookData.isbn)
      }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    } else {
      console.log("Import-Modus aktiv – Eintrag in Datenbank wird erstellt");
    }

    // Service-Role-Client für DB-Zugriff
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const bookEntry = {
      ...formattedBookData,
      // Bereinigte ISBN ohne Bindestriche verwenden
      isbn: cleanIsbn(formattedBookData.isbn),
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
