import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.8.0"
import axios from "https://esm.sh/axios@1.8.1"
import { getCorsHeaders, handleCorsPreflightRequest } from "../cors.ts"

// Supabase Setup
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// OpenAI API Key
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!

// Konfiguration für Batch-Verarbeitung
const BATCH_SIZE = 25 // Anzahl der Bücher, die pro Batch verarbeitet werden (reduziert, da axios verwendet wird)

// Funktion zur Vorbereitung des vector_source aus Buchdaten
function prepareVectorSource(book: any): string {
    try {
        const parts = [
            book.title || "Unbekannter Titel",
            book.author ? `Autor: ${book.author}` : "",
            book.subject ? `Fach: ${book.subject}` : "",
            book.level ? `Stufe: ${book.level}` : "",
            book.year ? `Jahr: ${book.year}` : "",
            book.type ? `Typ: ${book.type}` : "",
            book.publisher ? `Verlag: ${book.publisher}` : "",
            book.description || ""
        ];
        
        // Leere Einträge entfernen und zu einem String zusammenfügen
        return parts.filter(part => part).join(". ");
    } catch (error) {
        console.error("Fehler bei der Vorbereitung des vector_source:", error);
        return book.title || "Buch ohne Informationen";
    }
}

// Funktion zur JWT-Authentifizierung
function isAuthorized(req: Request): boolean {
    // Prüfe Authorization Header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log("Authorization Header fehlt oder hat falsches Format");
        return false;
    }
    
    const token = authHeader.split(' ')[1];
    
    // Für Service-Role-Key (für Admin-Operationen)
    if (token === SUPABASE_SERVICE_ROLE_KEY) {
        console.log("Autorisierung erfolgt via Service-Role-Key");
        return true;
    }
    
    // Für JWT-Token von Clerk
    try {
        if (token.split('.').length === 3) {
            console.log("Autorisierung erfolgt via JWT-Token");
            return true;
        }
    } catch (error) {
        console.error("JWT-Token konnte nicht validiert werden:", error);
    }
    
    console.log("Authorization Header ist vorhanden, aber enthält kein gültiges Token");
    return false;
}

serve(async (req) => {
    // CORS Preflight-Anfrage behandeln
    const corsResponse = handleCorsPreflightRequest(req);
    if (corsResponse) return corsResponse;

    // Überprüfe JWT-Authentifizierung
    const isValid = isAuthorized(req);
    if (!isValid) {
        console.error("Unerlaubter Zugriff: Kein gültiges JWT-Token gefunden");
        return new Response(
            JSON.stringify({ 
                error: 'Unerlaubter Zugriff', 
                message: 'Diese Operation erfordert ein gültiges JWT-Token.'
            }),
            {
                headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
                status: 401
            }
        );
    }
    
    console.log("Authentifizierung erfolgreich");

    // Parameter aus der Anfrage extrahieren
    let bookIds: string[] = [];
    let processSpecificBooks = false;
    
    // Überprüfen, ob spezifische Buch-IDs übergeben wurden
    if (req.method === "POST") {
        try {
            const requestData = await req.json();
            if (requestData.bookIds && Array.isArray(requestData.bookIds) && requestData.bookIds.length > 0) {
                bookIds = requestData.bookIds;
                processSpecificBooks = true;
                console.log(`Verarbeite spezifische Bücher mit IDs: ${bookIds.join(", ")}`);
            } else if (requestData.book_id) {
                // Einzelne book_id unterstützen
                bookIds = [requestData.book_id];
                processSpecificBooks = true;
                console.log(`Verarbeite einzelnes Buch mit ID: ${requestData.book_id}`);
            }
        } catch (error) {
            console.error("Fehler beim Parsen der Anfrage:", error);
        }
    }

    try {
        // 1. Bücher abrufen, die Embeddings benötigen
        let query = supabase
            .from("books")
            .select("id, title, author, subject, level, year, description, type, publisher, vector_source");
            
        // Entweder spezifische Bücher oder solche ohne Embedding verarbeiten
        if (processSpecificBooks) {
            query = query.in("id", bookIds);
        } else {
            query = query.is("embedding", null);
        }
            
        const { data: allBooks, error: selectError } = await query;

        if (selectError) {
            console.error("Fehler beim Abrufen der Bücher:", selectError);
            return new Response(JSON.stringify({ error: `Fehler beim Abrufen der Bücher: ${selectError.message}` }), {
                headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
                status: 500,
            });
        }

        if (!allBooks || allBooks.length === 0) {
            return new Response(
                JSON.stringify({ message: "Keine Bücher gefunden oder alle Bücher haben bereits Embeddings." }),
                {
                    headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
                    status: 200,
                }
            );
        }

        console.log(`${allBooks.length} Bücher gefunden, die Embeddings benötigen`);

        // 2. Bücher verarbeiten, die kein vector_source haben
        for (const book of allBooks) {
            if (!book.vector_source) {
                const vectorSource = prepareVectorSource(book);
                
                // vector_source aktualisieren
                const { error: updateError } = await supabase
                    .from("books")
                    .update({ vector_source: vectorSource })
                    .eq("id", book.id);
                
                if (updateError) {
                    console.error(`Fehler beim Aktualisieren des vector_source für Buch ${book.id}:`, updateError);
                } else {
                    book.vector_source = vectorSource; // Für die weitere Verarbeitung aktualisieren
                }
            }
        }

        // 3. Bücher in Batches verarbeiten
        const totalBooks = allBooks.length;
        let processedCount = 0;
        let successCount = 0;
        let batchErrors: string[] = [];

        for (let i = 0; i < totalBooks; i += BATCH_SIZE) {
            const batch = allBooks.slice(i, i + BATCH_SIZE);
            console.log(`Verarbeite Batch ${Math.floor(i/BATCH_SIZE) + 1} von ${Math.ceil(totalBooks/BATCH_SIZE)}`);

            // Embeddings generieren (für den aktuellen Batch)
            const embeddings = await Promise.all(batch.map(async (book) => {
                try {
                    processedCount++;
                    
                    if (!book.vector_source) {
                        throw new Error("Kein vector_source für das Embedding verfügbar");
                    }
                    
                    const response = await axios.post(
                        "https://api.openai.com/v1/embeddings",
                        { input: book.vector_source, model: "text-embedding-3-small" },
                        {
                            headers: {
                                "Authorization": `Bearer ${OPENAI_API_KEY}`,
                                "Content-Type": "application/json",
                            },
                        }
                    );

                    const embedding = response.data.data[0].embedding;
                    successCount++;
                    return { id: book.id, embedding };
                } catch (embeddingError) {
                    console.error(`Fehler bei der Embedding-Erstellung für Buch ${book.id}:`, embeddingError);
                    
                    // Fehlerprotokollierung
                    const errorMessage = embeddingError.response?.data 
                        ? JSON.stringify(embeddingError.response.data) 
                        : embeddingError.message || "Unbekannter Fehler";
                        
                    batchErrors.push(errorMessage);
                    await supabase
                        .from("embedding_errors")
                        .insert({
                            book_id: book.id,
                            error: errorMessage,
                            created_at: new Date().toISOString()
                        })
                        .catch(err => console.error("Fehler beim Speichern des Embedding-Fehlers:", err));
                    
                    return null; // Fehlerhafte Embeddings überspringen
                }
            }));

            // Ungültige Embeddings filtern
            const validEmbeddings = embeddings.filter((e) => e !== null);

            // Embeddings in Supabase speichern (für den aktuellen Batch)
            if (validEmbeddings.length > 0) {
                for (const { id, embedding } of validEmbeddings) {
                    const { error: updateError } = await supabase
                        .from("books")
                        .update({ embedding })
                        .eq("id", id);

                    if (updateError) {
                        console.error(`Fehler beim Speichern des Embeddings für Buch ${id}:`, updateError);
                    }
                }
            }
        }

        // Erfolgsantwort senden, möglicherweise mit Statistiken über verarbeitete Bücher
        return new Response(
            JSON.stringify({
                message: `Batch-Embedding-Prozess abgeschlossen. ${processedCount} Bücher verarbeitet.`,
                success: true,
                totalProcessed: processedCount,
                error: batchErrors.length > 0 ? batchErrors : null
            }),
            {
                headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
                status: 200
            }
        );
    } catch (error) {
        console.error("Unbehandelter Fehler:", error);
        return new Response(
            JSON.stringify({
                error: "Ein unerwarteter Fehler ist aufgetreten",
                details: error.message
            }),
            {
                headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
                status: 500
            }
        );
    }
}); 