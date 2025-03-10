import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.23.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  console.log('Bulk Import Books function called');
  
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Umgebungsvariablen abrufen
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Umgebungsvariablen fehlen: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY');
      throw new Error('Serverkonfiguration unvollständig');
    }

    // Authentifizierung des Benutzers - wir prüfen sowohl Supabase als auch Clerk-Token
    const authHeader = req.headers.get('Authorization') || '';
    let userId = null;
    let isAdmin = false; // Standard: Benutzer ist kein Admin
    
    // Wenn ein Authentifizierungs-Header vorhanden ist, versuchen wir zu authentifizieren
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        
        // 1. Versuche es als Supabase-Token (falls es ein Legacy-Token ist)
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: supabaseAuth, error: supabaseError } = await supabase.auth.getUser(token);
        
        if (!supabaseError && supabaseAuth?.user) {
          userId = supabaseAuth.user.id;
          console.log('Benutzer über Supabase authentifiziert:', userId);
          isAdmin = true; // Alle alten Supabase-Benutzer als Admins betrachten
        } else {
          // 2. Es könnte ein Clerk-Token sein - versuche es zu dekodieren
          try {
            // JWT-Token dekodieren (header.payload.signature)
            const tokenParts = token.split('.');
            if (tokenParts.length === 3) {
              // Base64-decodieren und JSON parsen
              const payload = JSON.parse(
                new TextDecoder().decode(
                  Uint8Array.from(atob(tokenParts[1]), c => c.charCodeAt(0))
                )
              );
              
              // Clerk-spezifische Felder prüfen
              if (payload.sub) {
                userId = payload.sub;
                
                // Rolle aus den Metadaten ermitteln
                const userRole = payload.user_role || 
                                (payload.user_metadata && payload.user_metadata.user_role);
                
                isAdmin = userRole === 'admin' || userRole === 'superadmin';
                
                console.log(`Clerk-Benutzer ${userId} identifiziert mit Rolle: ${userRole}`);
              }
            }
          } catch (jwtError) {
            console.error('Fehler beim Dekodieren des JWT:', jwtError);
          }
        }
      } catch (error) {
        console.error('Fehler bei der Authentifizierung:', error);
      }
    }
    
    if (!userId) {
      console.error('Benutzer konnte nicht authentifiziert werden');
      return new Response(
        JSON.stringify({ error: 'Nicht autorisiert' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!isAdmin) {
      console.error(`Benutzer ${userId} ist kein Admin`);
      return new Response(
        JSON.stringify({ error: 'Verboten - Admin-Rechte erforderlich' }), 
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Admin-Berechtigung bestätigt für Benutzer: ${userId}`);
    
    // Request-Body parsen
    const requestData = await req.json();
    const isbns = requestData.isbns;
    
    // Neuer Parameter für den Preview-Modus
    const isPreviewMode = requestData.preview === true;
    console.log(`Modus: ${isPreviewMode ? 'Vorschau' : 'Import'}, preview-Parameter:`, requestData.preview);
    
    if (!isbns || !Array.isArray(isbns) || isbns.length === 0) {
      console.error('Ungültige Anfrage: Keine ISBN-Liste vorhanden');
      return new Response(
        JSON.stringify({ error: 'Ungültige Anfrage - ISBN-Liste erforderlich' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`${isPreviewMode ? 'Vorschau' : 'Massenimport'} gestartet für ${isbns.length} Bücher`);
    
    // Ergebnisse und Fehler sammeln
    const results = {
      successful: [],
      failed: [],
      total: isbns.length,
      completed: 0
    };
    
    // Batch-Verarbeitung der ISBN-Nummern
    // Pro Batch maximal 10 parallele Anfragen, um API-Limits zu respektieren
    const batchSize = 10;
    for (let i = 0; i < isbns.length; i += batchSize) {
      const batch = isbns.slice(i, i + batchSize);
      console.log(`Verarbeite Batch ${Math.floor(i/batchSize) + 1} von ${Math.ceil(isbns.length/batchSize)}`);
      
      // Parallele Verarbeitung innerhalb eines Batches
      const batchPromises = batch.map(async (isbn) => {
        try {
          console.log(`Verarbeite ISBN: ${isbn}, im ${isPreviewMode ? 'Vorschau' : 'Import'}-Modus`);
          
          // Einheitliche Struktur für alle Requests
          const bookInfoResponse = await fetch(`${supabaseUrl}/functions/v1/book-info`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': authHeader
            },
            body: JSON.stringify({ isbn, preview: isPreviewMode })
          });
          
          if (bookInfoResponse.ok) {
            const bookData = await bookInfoResponse.json();
            console.log(`Erfolgreicher ${isPreviewMode ? 'Vorschau' : 'Import'} für ISBN: ${isbn}`);
            return { status: 'success', isbn, data: bookData };
          } else {
            const errorText = await bookInfoResponse.text();
            console.error(`Fehler beim ${isPreviewMode ? 'Vorschau' : 'Import'} für ISBN ${isbn}: ${errorText}`);
            return { status: 'error', isbn, error: `HTTP ${bookInfoResponse.status}: ${errorText}` };
          }
        } catch (error) {
          console.error(`Ausnahme beim ${isPreviewMode ? 'Vorschau' : 'Import'} für ISBN ${isbn}:`, error);
          return { status: 'error', isbn, error: error.message };
        }
      });
      
      // Warten auf alle Anfragen im aktuellen Batch
      const batchResults = await Promise.all(batchPromises);
      
      // Ergebnisse verarbeiten
      for (const result of batchResults) {
        if (result.status === 'success') {
          results.successful.push({ isbn: result.isbn, data: result.data });
        } else {
          results.failed.push({ isbn: result.isbn, error: result.error });
        }
        results.completed++;
      }
    }
    
    console.log(`Massenimport abgeschlossen. Erfolg: ${results.successful.length}, Fehlgeschlagen: ${results.failed.length}`);
    
    // Nach erfolgreichem Import, die Embedding-Generierung starten
    if (results.successful.length > 0 && !isPreviewMode) {
      try {
        console.log("Starte Embedding-Generierung für erfolgreich importierte Bücher");
        
        // Sammle die Buch-IDs der erfolgreich importierten Bücher
        const bookIds = results.successful
          .filter(item => item.data && item.data.id)
          .map(item => item.data.id);
        
        if (bookIds.length > 0) {
          // Rufe die createEmbeddings-Funktion auf
          console.log(`Sende ${bookIds.length} Buch-IDs an createEmbeddings`);
          
          fetch(`${supabaseUrl}/functions/v1/createEmbeddings`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({ bookIds })
          }).catch(embedError => {
            console.error("Fehler beim Aufruf der Embedding-Funktion:", embedError);
          });
        }
      } catch (error) {
        console.error("Fehler beim Starten der Embedding-Generierung:", error);
        // Wir behandeln diesen Fehler nicht als kritisch, da die Bücher bereits importiert wurden
      }
    }
    
    return new Response(
      JSON.stringify(results), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Unbehandelte Ausnahme:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Interner Serverfehler' }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}); 