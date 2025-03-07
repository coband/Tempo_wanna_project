import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // JWT Token aus dem Authorization Header extrahieren
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization Header fehlt" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    // JWT Token extrahieren und Benutzer überprüfen
    const token = authHeader.replace("Bearer ", "");
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError) {
      console.error("JWT-Validierungsfehler:", userError);
      return new Response(
        JSON.stringify({ error: "Ungültiger JWT Token", details: userError.message }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    console.log("Benutzer erfolgreich authentifiziert:", userData.user.id);
    
    const requestBody = await req.json();
    const { isbn, preview } = requestBody;
    
    // Überprüfen, ob der Preview-Modus aktiv ist - strikter Vergleich mit true
    const isPreviewMode = preview === true;
    
    console.log(`Modus: ${isPreviewMode ? 'Vorschau' : 'Import'} für ISBN: ${isbn}`);
    
    if (!isbn) {
      return new Response(JSON.stringify({ error: "ISBN is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Überprüfen, ob das Buch bereits in der Datenbank existiert
    const { data: existingBook } = await supabaseClient
      .from("books")
      .select("*")
      .eq("isbn", isbn)
      .maybeSingle();

    if (existingBook) {
      console.log(`Buch mit ISBN ${isbn} existiert bereits in der Datenbank:`, existingBook);
      return new Response(JSON.stringify(existingBook), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          {
            role: "system",
            content:
              "Du bist ein präziser Buchinformations-Assistent. Deine Aufgabe ist es, genaue Daten zu Büchern basierend auf ihrer ISBN zu liefern. Antworte ausschließlich mit einem validen JSON-Objekt.",
          },
          {
            role: "user",
            content: `Suche nach dem Buch mit der ISBN ${isbn}. Gib die Informationen ausschließlich als valides JSON-Objekt zurück, ohne zusätzlichen Text. Das JSON sollte folgende Felder enthalten: 'Titel', 'Autor', 'ISBN', 'Stufe' (KiGa, 1. Klasse, 2. Klasse, 3. Klasse, 4. Klasse, 5. Klasse, 6. Klasse) es könenn auch mehrere Stufen sein (1., 2., 3. Klasse gehören unterstufe, 4., 5., 6. Klasse gehören mittelstufe und 7., 8., 9. Klasse gehören oberstufe, 1.-6. Klasse ist Grundschule), 'Fach' (Mathematik, Deutsch, Französisch, NMG, Sport, Musik, Englisch, Bildnerisches Gestalten, TTG, Divers), 'Erscheinungsjahr', 'Typ' (Lehrmittel, Lesebuch, Fachbuch, Sachbuch, Lernmaterial), 'Beschreibung'. Es sollte eine allgemeine Beschriebung sein, in der steht wekche Themen im Lehrmittel/Buch behandelt werden und für welches Schuljahre es ist. Wenn eine Information nicht verfügbar ist, verwende null als Wert.`,
          },
        ],
        max_tokens: 1000,
        temperature: 0.1,
        top_p: 0.95,
      }),
    });

    if (!response.ok) {
      throw new Error(`Perplexity API error: ${response.statusText}`);
    }

    const result = await response.json();
    console.log("Raw API response:", result);

    if (!result.choices?.[0]?.message?.content) {
      console.error("Invalid API response structure:", result);
      throw new Error("Invalid API response structure");
    }

    const content = result.choices[0].message.content;
    console.log("Content from API:", content);

    // Nach dem Abrufen der Buchdaten vom API
    let bookData;
    try {
      // Remove any potential markdown formatting
      const cleanContent = content.replace(/```json\n?|```/g, "").trim();
      console.log("Cleaned content:", cleanContent);
      bookData = JSON.parse(cleanContent);
    } catch (e) {
      console.error("Failed to parse JSON:", content);
      return new Response(
        JSON.stringify({
          error: "Invalid JSON response from AI",
          content: content,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }

    // Spezieller Fix für das Level-Feld, wenn es als Array übergeben wird
    if (bookData?.Stufe && Array.isArray(bookData.Stufe)) {
      bookData.Stufe = bookData.Stufe.join(', ');
    }

    // Set default values for missing fields
    const defaultValues = {
      Titel: null,
      Autor: null,
      ISBN: isbn,
      Stufe: null,
      Fach: null,
      Erscheinungsjahr: null,
      Beschreibung: null,
      Typ: null,
    };

    bookData = { ...defaultValues, ...bookData };

    // Überprüfen und Korrektur der ISBN
    if (bookData.ISBN !== isbn) {
      console.warn(`API hat eine andere ISBN zurückgegeben als angefragt. Verwende die ursprüngliche ISBN. Angefragt: ${isbn}, Zurückgegeben: ${bookData.ISBN}`);
      bookData.ISBN = isbn; // Verwende immer die ursprüngliche ISBN
    }

    // Prüfe, ob wesentliche Informationen fehlen
    if (!bookData.Titel) {
      console.error("Keine ausreichenden Buchinformationen gefunden für ISBN:", isbn);
      return new Response(
        JSON.stringify({ 
          error: "Keine ausreichenden Buchinformationen gefunden", 
          details: "Es konnten keine Titelinformationen für diese ISBN gefunden werden",
          isbn 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404, // Verwende 404 für "nicht gefunden" statt 500 für Serverfehler
        }
      );
    }

    // Formatiere die Buchdaten für die Rückgabe
    const formattedBookData = {
      title: bookData.Titel || "Unbekannter Titel",
      author: bookData.Autor || "Unbekannt",
      isbn: isbn, // Verwende immer die ursprüngliche ISBN
      // Sicherstellen, dass level immer als Text gespeichert wird
      level: typeof bookData.Stufe === 'string' 
        ? bookData.Stufe 
        : Array.isArray(bookData.Stufe) 
          ? bookData.Stufe.join(', ') 
          : bookData.Stufe?.toString() || "Unbekannt",
      subject: bookData.Fach || "Unbekannt",
      year: bookData.Erscheinungsjahr ? parseInt(bookData.Erscheinungsjahr, 10) : new Date().getFullYear(),
      description: bookData.Beschreibung || "Keine Beschreibung verfügbar",
      type: bookData.Typ || "Lehrmittel"   
    };
    
    // Im Vorschaumodus geben wir nur die Buchdaten zurück, ohne in die Datenbank zu schreiben
    if (isPreviewMode) {
      console.log("Vorschaumodus aktiviert - Kein Datenbankeintrag wird erstellt");
      return new Response(JSON.stringify(formattedBookData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      console.log("Import-Modus aktiviert - Datenbankeintrag wird erstellt");
    }

    // Erstelle einen Service-Role-Client für Datenbankoperationen
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Das Buch in die Datenbank einfügen
    const bookEntry = {
      ...formattedBookData,
      user_id: userData.user.id,
      created_at: new Date().toISOString(),
      available: true, // Standard: verfügbar
      location: 'Schule', // Standardstandort
      // vector_source wird später gesetzt
    };

    console.log("Füge Buch in die Datenbank ein:", bookEntry);

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
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    console.log("Buch erfolgreich in die Datenbank eingefügt:", insertedBook);

    // Nach dem Einfügen den vector_source als separaten Schritt setzen
    try {
      if (insertedBook && insertedBook.id) {
        // Vector-Source für Embedding erstellen
        const vectorSource = [
          formattedBookData.title || "Unbekannter Titel",
          formattedBookData.author ? `Autor: ${formattedBookData.author}` : "",
          formattedBookData.subject ? `Fach: ${formattedBookData.subject}` : "",
          formattedBookData.level ? `Stufe: ${formattedBookData.level}` : "",
          formattedBookData.year ? `Jahr: ${formattedBookData.year}` : "",
          formattedBookData.type ? `Typ: ${formattedBookData.type}` : "",
          formattedBookData.description || ""
        ].filter(Boolean).join(". ");
        
        console.log(`Aktualisiere vector_source für Buch ${insertedBook.id}`);
        
        const { error: updateError } = await adminClient
          .from("books")
          .update({ vector_source: vectorSource })
          .eq("id", insertedBook.id);
          
        if (updateError) {
          console.error(`Fehler beim Aktualisieren des vector_source:`, updateError);
        } else {
          console.log(`vector_source erfolgreich aktualisiert für Buch ${insertedBook.id}`);
          
          // Optional: Embedding-Generierung für dieses Buch anstoßen
          console.log(`Starte Embedding-Generierung für Buch ${insertedBook.id}`);
          
          // Asynchron die createEmbeddings-Funktion aufrufen
          fetch(`${SUPABASE_URL}/functions/v1/createEmbeddings`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
            },
            body: JSON.stringify({
              bookIds: [insertedBook.id]
            })
          }).catch(embedError => {
            console.error("Fehler beim Aufruf der Embedding-Funktion:", embedError);
          });
        }
      }
    } catch (error) {
      // Fehler beim Update von vector_source oder beim Starten der Embedding-Generierung behandeln
      console.error("Fehler nach dem Einfügen des Buchs:", error);
    }

    return new Response(JSON.stringify(insertedBook || bookData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
