import { serve } from 'http/server';
import { createClient } from '@supabase/supabase-js';
import { getCorsHeaders, handleCorsPreflightRequest } from "../cors.ts";

serve(async (req) => {
  // CORS-Präflug-Anfrage behandeln
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  try {
    // Umgebungsvariablen für Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('VITE_SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('VITE_SUPABASE_SERVICE_ROLE_KEY') || '';

    console.log('Supabase URL verfügbar:', !!supabaseUrl);
    console.log('Supabase Anon Key verfügbar:', !!supabaseAnonKey);
    console.log('Supabase Service Key verfügbar:', !!supabaseServiceKey);

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase URL oder Service Key nicht konfiguriert');
    }

    // JWT Token aus dem Authorization Header extrahieren (optional)
    let userId = null; // Kein Standardwert mehr für anonyme Benutzer
    let isAuthenticated = false;
    const authHeader = req.headers.get('Authorization');
    
    if (authHeader) {
      try {
        // Native Clerk-Supabase Integration: Token direkt verwenden
        const token = authHeader.replace("Bearer ", "");
        
        // Client mit dem Token als Authorization Header erstellen
        const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
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
          console.log("Hinweis: Nur öffentliche Suchergebnisse werden zurückgegeben");
        } else {
          console.log("Benutzer erfolgreich authentifiziert");
          isAuthenticated = true;
          
          // Extrahiere die User-ID aus dem JWT für Logging-Zwecke (optional)
          try {
            const tokenParts = token.split('.');
            if (tokenParts.length === 3) {
              const payload = JSON.parse(atob(tokenParts[1]));
              userId = payload.sub || payload.user_id || 'authorized-user';
              console.log("Benutzer-ID aus JWT:", userId);
              
              // Debug-Ausgabe zur Diagnose
              console.log('JWT Payload:', JSON.stringify(payload, null, 2));
            }
          } catch (e) {
            console.log("Konnte User-ID nicht aus Token extrahieren");
          }
        }
      } catch (authError) {
        console.error("Fehler bei der Authentifizierung:", authError);
        // Kein Fallback mehr auf anonymen Benutzer
      }
    } else {
      console.log("Kein Authorization Header vorhanden");
      // Kein Fallback mehr auf anonymen Benutzer
    }
    
    // Für die Buchsuche erlauben wir auch nicht authentifizierten Zugang
    // Aber geben einen Hinweis im Response
    const isSearchingAsGuest = !isAuthenticated;

    // Für sensible Operationen könnten wir hier eine Authentifizierung erzwingen
    // Für die Buchsuche erlauben wir jedoch den Zugang auch ohne Authentifizierung
    // Sensible Buchinformationen könnten später gefiltert werden

    // Suchparameter aus dem Request-Body holen
    if (!req.body) {
      return new Response(
        JSON.stringify({ error: 'Request-Body ist erforderlich' }),
        {
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    const { query } = await req.json();
    console.log('Suchanfrage erhalten:', query);

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Suchbegriff ist erforderlich' }),
        {
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Supabase-Client initialisieren
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
      // VERBESSERUNG 3: Abfrageerweiterung für kurze Anfragen
      const enhancedQuery = await enhanceQuery(query);
      console.log('Erweiterte Suchanfrage:', enhancedQuery);

      // OpenAI API für Embedding
      const embedding = await getEmbedding(enhancedQuery);
      console.log('Embedding erstellt, Länge:', embedding.length);

      // VERBESSERUNG 2: Anpassung des Schwellenwerts für kurze Anfragen
      const queryWords = query.split(/\s+/).length;
      const similarityThreshold = queryWords <= 2 ? 0.4 : 0.5; // Niedrigerer Schwellenwert für kurze Anfragen
      console.log(`Verwende Ähnlichkeitsschwelle: ${similarityThreshold} (Wortanzahl: ${queryWords})`);

      // Die SQL-Funktion match_books verwenden, um ähnliche Bücher zu finden
      console.log('Suche nach ähnlichen Büchern via Embeddings...');
      const { data: embeddingBooks, error: embeddingError } = await supabase.rpc(
        'match_books',
        {
          query_embedding: embedding,
          match_threshold: similarityThreshold,
          match_count: 10
        }
      );

      if (embeddingError) {
        console.error('Supabase RPC Fehler:', embeddingError);
        throw new Error(`Supabase Fehler: ${embeddingError.message}`);
      }

      console.log(`${embeddingBooks ? embeddingBooks.length : 0} Bücher via Embedding gefunden`);
      
      // VERBESSERUNG: Hole vollständige Buchdaten für alle mit dem Embedding gefundenen Bücher
      let enhancedEmbeddingBooks = embeddingBooks || [];
      
      if (embeddingBooks && embeddingBooks.length > 0) {
        console.log('Hole vollständige Buchdaten für Embedding-Ergebnisse...');
        
        // Extrahiere alle IDs der gefundenen Bücher
        const bookIds = embeddingBooks.map(book => book.id);
        
        // Hole vollständige Daten für diese Bücher
        const { data: fullBooks, error: fullBooksError } = await supabase
          .from('books')
          .select('*')
          .in('id', bookIds);
          
        if (fullBooksError) {
          console.error('Fehler beim Abrufen vollständiger Buchdaten:', fullBooksError);
        } else if (fullBooks && fullBooks.length > 0) {
          console.log(`${fullBooks.length} vollständige Buchdatensätze abgerufen`);
          
          // Debug-Ausgabe für has_pdf in den vollständigen Daten
          console.log('DEBUG: Vollständige Buchdaten has_pdf Überprüfung:');
          fullBooks.slice(0, 3).forEach((book, idx) => {
            console.log(`Buch ${idx} (${book.title}) - has_pdf: ${book.has_pdf} (Typ: ${typeof book.has_pdf})`);
          });
          
          // Erstelle eine Map für schnellen Zugriff auf vollständige Buchdaten
          const fullBooksMap = new Map(fullBooks.map(book => [book.id, book]));
          
          // Ersetze die vorhandenen Daten mit vollständigen Daten, aber behalte similarity
          enhancedEmbeddingBooks = embeddingBooks.map(book => {
            const fullBook = fullBooksMap.get(book.id);
            if (fullBook) {
              return {
                ...fullBook,
                similarity: book.similarity  // Behalte den Ähnlichkeitswert
              };
            }
            return book;  // Fallback zum Original, wenn keine vollständigen Daten
          });
          
          console.log('Embedding-Ergebnisse mit vollständigen Daten ersetzt');
        }
      }

      // VERBESSERUNG 1: Hybrid-Suche mit Keyword-Suche
      console.log('Führe zusätzlich Keyword-Suche durch...');
      const { data: keywordBooks, error: keywordError } = await performKeywordSearch(supabase, query);
      
      if (keywordError) {
        console.error('Keyword-Suche Fehler:', keywordError);
      } else {
        console.log(`${keywordBooks ? keywordBooks.length : 0} Bücher via Keyword-Suche gefunden`);
      }

      // Ergebnisse zusammenführen und Duplikate entfernen
      const mergedBooks = mergeResults(enhancedEmbeddingBooks, keywordBooks || [], query);
      console.log(`Insgesamt ${mergedBooks.length} einzigartige Bücher gefunden`);

      // Erfolgreiche Antwort senden
      return new Response(
        JSON.stringify({ 
          books: mergedBooks,
          isAuthenticated: isAuthenticated, // Neue Eigenschaft für Frontend
          userMessage: isSearchingAsGuest ? 
            "Melden Sie sich an, um alle Bücher zu sehen und weitere Funktionen nutzen zu können." : 
            null,
          debug: { 
            originalQuery: query,
            enhancedQuery: enhancedQuery,
            embeddingResults: embeddingBooks ? embeddingBooks.length : 0,
            keywordResults: keywordBooks ? keywordBooks.length : 0,
            totalResults: mergedBooks.length,
            similarityThreshold: similarityThreshold,
            timestamp: new Date().toISOString(),
          }
        }),
        {
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    } catch (fetchError) {
      console.error('Fehler bei der API-Anfrage:', fetchError);
      
      // Fallback: Dummy-Daten zurückgeben, wenn die API-Anfrage fehlschlägt
      console.log('Verwende Fallback-Daten...');
      const dummyBooks = [
        {
          id: '1',
          title: 'Mathematik für die Grundschule',
          author: 'Max Mustermann',
          subject: 'Mathematik',
          level: 'Grundschule',
          description: 'Ein umfassendes Buch über Mathematik für Grundschüler.',
          similarity: 0.95
        },
        {
          id: '2',
          title: 'Die Welt der Zahlen',
          author: 'Lisa Schmidt',
          subject: 'Mathematik',
          level: 'Grundschule',
          description: 'Ein illustriertes Buch für Kinder.',
          similarity: 0.87
        }
      ];
      
      return new Response(
        JSON.stringify({ 
          books: dummyBooks,
          debug: { 
            query,
            timestamp: new Date().toISOString(),
            error: fetchError.message,
            fallback: true
          }
        }),
        {
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

  } catch (error) {
    console.error('Fehler bei der Buchsuche:', error);
    
    // Detaillierten Fehler zurückgeben
    return new Response(
      JSON.stringify({ 
        error: 'Interner Serverfehler', 
        details: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

// VERBESSERUNG 3: Abfrageerweiterung für kurze Anfragen
async function enhanceQuery(query) {
  const queryWords = query.split(/\s+/).length;
  const lowerQuery = query.toLowerCase();
  
  // Erkennung von Verlagsanfragen
  const publisherKeywords = ['verlag', 'publisher', 'edition', 'press'];
  const isPublisherQuery = publisherKeywords.some(keyword => lowerQuery.includes(keyword));
  
  // Wenn es eine direkte Verlagssuche zu sein scheint
  if (isPublisherQuery) {
    console.log('Verlagssuche erkannt:', query);
    return `Bücher vom Verlag ${query}`;
  }
  
  // Wenn es ein potenzieller Verlagsname ist (ohne das Wort "Verlag")
  const commonPublishers = ['cornelsen', 'westermann', 'carlsen', 'klett', 'diesterweg', 'duden'];
  if (commonPublishers.some(publisher => lowerQuery.includes(publisher)) && !lowerQuery.includes('verlag')) {
    console.log('Verlagsname erkannt:', query);
    return `Bücher vom Verlag ${query} Verlag`;
  }
  
  if (queryWords <= 2) {
    // Vordefinierte Erweiterungen für kurze Anfragen
    const bookRelatedTerms = [
      "Buch über", 
      "Literatur zu", 
      "Informationen zu",
      "Unterrichtsmaterial zu",
      "Lehrmaterial für",
      "Didaktik für"
    ];
    
    // Zufällige Erweiterung auswählen
    const prefix = bookRelatedTerms[Math.floor(Math.random() * bookRelatedTerms.length)];
    return `${prefix} ${query}`;
  }
  
  return query;
}

// OpenAI Embedding abrufen
async function getEmbedding(query) {
  const openAiKey = Deno.env.get('OPENAI_KEY') || Deno.env.get('OPENAI_API_KEY') || '';
  if (!openAiKey) {
    console.error('OpenAI API Key nicht gefunden.');
    throw new Error('OpenAI API Key nicht konfiguriert');
  }
  
  console.log('OpenAI Key gefunden, Länge:', openAiKey.length);
  console.log('Erstelle Embedding für:', query);
  
  // OpenAI API aufrufen, um ein Embedding für die Suchanfrage zu erstellen
  const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: query,
    }),
  });

  if (!embeddingResponse.ok) {
    const errorText = await embeddingResponse.text();
    console.error('OpenAI API Fehler:', errorText);
    console.error('Status Code:', embeddingResponse.status);
    throw new Error(`OpenAI API Fehler: ${embeddingResponse.status} ${errorText}`);
  }

  const embeddingData = await embeddingResponse.json();
  
  if (!embeddingData.data || !embeddingData.data[0] || !embeddingData.data[0].embedding) {
    console.error('Ungültiges Embedding Format:', JSON.stringify(embeddingData));
    throw new Error('Ungültiges Embedding Format von OpenAI');
  }
  
  return embeddingData.data[0].embedding;
}

// VERBESSERUNG 1: Keyword-Suche implementieren
async function performKeywordSearch(supabase, query) {
  // Aufteilen der Anfrage in einzelne Wörter
  const keywords = query.toLowerCase().split(/\s+/);
  
  // Filter für sehr kurze Wörter und Stoppwörter
  const filteredKeywords = keywords.filter(word => 
    word.length > 2 && 
    !['der', 'die', 'das', 'ein', 'eine', 'mit', 'für', 'und', 'oder', 'in', 'im', 'an', 'auf'].includes(word)
  );
  
  if (filteredKeywords.length === 0) {
    // Wenn keine sinnvollen Keywords übrig bleiben, verwende original
    return { data: [], error: null };
  }
  
  // Erstelle OR-Bedingungen für jedes Keyword
  const searchConditions = filteredKeywords.map(keyword => {
    return `
      title.ilike.%${keyword}% OR
      author.ilike.%${keyword}% OR
      subject.ilike.%${keyword}% OR
      level.ilike.%${keyword}% OR
      type.ilike.%${keyword}% OR
      publisher.ilike.%${keyword}% OR
      description.ilike.%${keyword}%
    `;
  });
  
  // Zusammenführen der Bedingungen mit OR
  const searchQuery = searchConditions.join(' OR ');
  
  // Supabase-Abfrage mit OR-Filter
  return await supabase
    .from('books')
    .select('*')
    .or(searchQuery)
    .limit(20);
}

// Ergebnisse zusammenführen und Duplikate entfernen mit verbessertem Ranking
function mergeResults(embeddingResults, keywordResults, originalQuery) {
  // Extrahiere wichtige Schlüsselwörter für die Bewertung
  const importantKeywords = extractImportantKeywords(originalQuery);
  console.log('Wichtige Schlüsselwörter für Ranking:', importantKeywords);
  
  // Map erstellen für schnellen Zugriff auf Embedding-Ergebnisse
  const resultsMap = new Map();
  
  // Debug-Log für has_pdf Verfügbarkeit
  const hasEmbeddingPdf = embeddingResults.length > 0 ? 'has_pdf' in embeddingResults[0] : false;
  const hasKeywordPdf = keywordResults.length > 0 ? 'has_pdf' in keywordResults[0] : false;
  console.log(`DEBUG: has_pdf verfügbar in Embedding-Ergebnissen: ${hasEmbeddingPdf}`);
  console.log(`DEBUG: has_pdf verfügbar in Keyword-Ergebnissen: ${hasKeywordPdf}`);
  
  if (embeddingResults.length > 0) {
    console.log(`DEBUG: Embedding Buch 0 Felder: ${Object.keys(embeddingResults[0]).join(', ')}`);
    console.log(`DEBUG: Embedding Buch 0 has_pdf: ${embeddingResults[0].has_pdf}`);
  }
  
  if (keywordResults.length > 0) {
    console.log(`DEBUG: Keyword Buch 0 Felder: ${Object.keys(keywordResults[0]).join(', ')}`);
    console.log(`DEBUG: Keyword Buch 0 has_pdf: ${keywordResults[0].has_pdf}`);
  }
  
  // Embedding-Ergebnisse zuerst einfügen
  embeddingResults.forEach(book => {
    // Bewerte, wie gut das Buch zu den wichtigen Schlüsselwörtern passt
    const keywordMatchScore = calculateKeywordMatchScore(book, importantKeywords);
    
    // Kombinierter Score: Embedding-Ähnlichkeit + Keyword-Match-Score
    const combinedScore = (book.similarity || 0) + keywordMatchScore;
    
    // Stellen Sie sicher, dass has_pdf ein boolescher Wert ist
    // Wenn es nicht existiert oder null ist, behandeln wir es als false
    const hasPdf = typeof book.has_pdf === 'boolean' ? book.has_pdf : 
                  (book.has_pdf === 'true' || book.has_pdf === true);
    
    resultsMap.set(book.id, {
      ...book,
      original_similarity: book.similarity,
      keyword_score: keywordMatchScore,
      similarity: combinedScore, // Überschreibe den Similarity-Wert mit dem kombinierten Score
      has_pdf: hasPdf // Stelle sicher, dass has_pdf ein boolescher Wert ist
    });
  });
  
  // Keyword-Ergebnisse hinzufügen
  keywordResults.forEach(book => {
    if (resultsMap.has(book.id)) {
      // Buch bereits in den Ergebnissen, nichts zu tun
      return;
    }
    
    // Bewerte, wie gut das Buch zu den wichtigen Schlüsselwörtern passt
    const keywordMatchScore = calculateKeywordMatchScore(book, importantKeywords);
    
    // Bei reinen Keyword-Matches ohne Embedding nutzen wir einen Standard-Embedding-Score
    const baseScore = 0.5; // Mittlerer Basis-Score für Keyword-Matches
    const combinedScore = baseScore + keywordMatchScore;
    
    // Stellen Sie sicher, dass has_pdf ein boolescher Wert ist
    // Wenn es nicht existiert oder null ist, behandeln wir es als false
    const hasPdf = typeof book.has_pdf === 'boolean' ? book.has_pdf : 
                  (book.has_pdf === 'true' || book.has_pdf === true);
    
    resultsMap.set(book.id, {
      ...book,
      original_similarity: null,
      keyword_score: keywordMatchScore,
      similarity: combinedScore,
      has_pdf: hasPdf // Stelle sicher, dass has_pdf ein boolescher Wert ist
    });
  });
  
  // In Array umwandeln und nach kombiniertem Score sortieren
  const mergedResults = Array.from(resultsMap.values());
  
  // Erzeuge Debug-Logs für die ersten Bücher
  if (mergedResults.length > 0) {
    console.log(`DEBUG: Endgültiges Buch 0 has_pdf: ${mergedResults[0].has_pdf} (Typ: ${typeof mergedResults[0].has_pdf})`);
  }
  
  return mergedResults.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
}

// Wichtige Schlüsselwörter mit Gewichtung extrahieren
function extractImportantKeywords(query) {
  // Anfrage in Kleinbuchstaben umwandeln und in einzelne Wörter aufteilen
  const words = query.toLowerCase().split(/\s+/);
  
  // Stoppwörter und sehr kurze Wörter filtern
  const stoppwords = ['der', 'die', 'das', 'ein', 'eine', 'mit', 'für', 'und', 'oder', 'in', 'im', 'an', 'auf', 'zu', 'vom', 'bei', 'aus'];
  
  // Spezielle Schlüsselwörter, die wichtiger sind (mit höherer Gewichtung)
  const specialKeywords = {
    'verlag': 2.0,        // Sehr hohe Gewichtung für Verlagssuchen
    'publisher': 2.0,
    'cornelsen': 2.0,     // Bekannte Verlagsnamen vorab erkennen
    'westermann': 2.0,
    'carlsen': 2.0,
    'klett': 2.0,
    'diesterweg': 2.0,
    'duden': 2.0,
    'schroedel': 2.0,
    'raabe': 2.0,
    'sachbuch': 1.5,      // Wichtige Buchkategorien
    'lehrbuch': 1.5,
    'lehrwerk': 1.5,
    'schulbuch': 1.5,
    'arbeitsheft': 1.5
  };
  
  // Ergebnis-Array für Schlüsselwörter mit Gewichtung
  const result = [];
  
  // Wörter verarbeiten
  for (const word of words) {
    // Ignoriere zu kurze Wörter und Stoppwörter
    if (word.length <= 2 || stoppwords.includes(word)) {
      continue;
    }
    
    // Bestimme die Gewichtung des Wortes
    let weight = 1.0; // Standardgewichtung
    
    // Prüfe auf spezielle Schlüsselwörter
    for (const [keyword, keywordWeight] of Object.entries(specialKeywords)) {
      if (word.includes(keyword) || keyword.includes(word)) {
        weight = keywordWeight;
        break;
      }
    }
    
    // Füge das Wort mit seiner Gewichtung zum Ergebnis hinzu
    result.push({ word, weight });
  }
  
  // Nach Gewichtung absteigend sortieren
  return result.sort((a, b) => b.weight - a.weight);
}

// Funktion zur Berechnung eines Keyword-Match-Scores
function calculateKeywordMatchScore(book, keywords) {
  if (!book || !keywords || keywords.length === 0) {
    return 0;
  }
  
  // Sammle alle relevanten Textfelder des Buches
  const bookText = [
    book.title || '',
    book.author || '',
    book.subject || '',
    book.level || '',
    book.type || '',
    book.publisher || '',
    book.description || ''
  ].join(' ').toLowerCase();
  
  // Berechne Score basierend auf dem Vorkommen der Schlüsselwörter
  let totalScore = 0;
  let totalWeight = 0;
  
  keywords.forEach(({ word, weight }) => {
    totalWeight += weight;
    
    // Exakte Wortübereinstimmung prüfen (mit Wortgrenzen)
    const exactRegex = new RegExp(`\\b${word}\\b`, 'i');
    if (exactRegex.test(bookText)) {
      // Exakte Übereinstimmung ist am wertvollsten
      totalScore += weight * 0.4;
    }
    // Teilwortübereinstimmung prüfen
    else if (bookText.includes(word)) {
      totalScore += weight * 0.2;
    }
    
    // Zusätzliche Gewichtung für Vorkommen im Titel (besonders wichtig)
    if (book.title && book.title.toLowerCase().includes(word)) {
      totalScore += weight * 0.3;
    }
    
    // Noch mehr Gewichtung, wenn das Schlüsselwort im Fach vorkommt
    if (book.subject && book.subject.toLowerCase().includes(word)) {
      totalScore += weight * 0.2;
    }
    
    // ERHÖHTE Gewichtung für Verlag - 1.0 für exakte Übereinstimmung
    if (book.publisher) {
      const publisherLower = book.publisher.toLowerCase();
      // Prüfe auf exakte Übereinstimmung mit Verlagsnamen
      if (exactRegex.test(publisherLower)) {
        totalScore += weight * 1.0; // Sehr hohe Gewichtung für exakte Verlagsübereinstimmung
        console.log(`Exakte Verlagsübereinstimmung gefunden für: ${word} in ${book.publisher}`);
      }
      // Prüfe auf Teilübereinstimmung
      else if (publisherLower.includes(word)) {
        totalScore += weight * 0.6; // Hohe Gewichtung für Teilübereinstimmung
        console.log(`Teilübereinstimmung im Verlag gefunden für: ${word} in ${book.publisher}`);
      }
    }
    
    // Gewichtung für Typ
    if (book.type && book.type.toLowerCase().includes(word)) {
      totalScore += weight * 0.2;
    }
  });
  
  // Normalisiere den Score
  const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0;
  
  // Skaliere auf einen Wert zwischen 0 und 0.8 (als Ergänzung zum Embedding-Score)
  // Erhöhung des maximalen Keyword-Scores von 0.5 auf 0.8
  return normalizedScore * 0.8;
} 