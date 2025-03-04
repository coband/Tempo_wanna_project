import { serve } from 'http/server';
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // CORS-Präflug-Anfrage behandeln
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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

    // JWT Token aus dem Authorization Header extrahieren
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization Header fehlt' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    // JWT Token extrahieren und Benutzer überprüfen
    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError) {
      console.error('JWT-Validierungsfehler:', userError);
      return new Response(
        JSON.stringify({ error: 'Ungültiger JWT Token', details: userError.message }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    console.log('Benutzer erfolgreich authentifiziert:', userData.user.id);
    
    // Suchparameter aus dem Request-Body holen
    if (!req.body) {
      return new Response(
        JSON.stringify({ error: 'Request-Body ist erforderlich' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // OpenAI API für Embedding
    const openAiKey = Deno.env.get('OPENAI_KEY') || Deno.env.get('OPENAI_API_KEY') || '';
    if (!openAiKey) {
      console.error('OpenAI API Key nicht gefunden.');
      throw new Error('OpenAI API Key nicht konfiguriert');
    }
    
    console.log('OpenAI Key gefunden, Länge:', openAiKey.length);
    console.log('Erstelle Embedding für:', query);
    
    try {
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
      console.log('OpenAI Antwort erhalten');
      
      if (!embeddingData.data || !embeddingData.data[0] || !embeddingData.data[0].embedding) {
        console.error('Ungültiges Embedding Format:', JSON.stringify(embeddingData));
        throw new Error('Ungültiges Embedding Format von OpenAI');
      }
      
      const embedding = embeddingData.data[0].embedding;
      console.log('Embedding erstellt, Länge:', embedding.length);

      // Supabase-Client initialisieren
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Die SQL-Funktion match_books verwenden, um ähnliche Bücher zu finden
      console.log('Suche nach ähnlichen Büchern...');
      const { data: books, error } = await supabase.rpc(
        'match_books',
        {
          query_embedding: embedding,
          match_threshold: 0.5, // Ähnlichkeitsschwelle (anpassbar)
          match_count: 10       // Anzahl der Ergebnisse (anpassbar)
        }
      );

      if (error) {
        console.error('Supabase RPC Fehler:', error);
        throw new Error(`Supabase Fehler: ${error.message}`);
      }

      console.log(`${books ? books.length : 0} Bücher gefunden`);

      // Erfolgreiche Antwort senden
      return new Response(
        JSON.stringify({ 
          books: books || [],
          debug: { 
            query,
            timestamp: new Date().toISOString(),
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
}); 