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

    // Authentifizierung des Benutzers
    const authHeader = req.headers.get('Authorization') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    
    if (userError || !user) {
      console.error('Autorisierungsfehler:', userError);
      return new Response(
        JSON.stringify({ error: 'Nicht autorisiert' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Benutzer authentifiziert: ${user.id}`);
    
    // Überprüfen ob Benutzer Admin oder Superadmin ist
    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    
    if (rolesError) {
      console.error('Fehler beim Abrufen der Benutzerrollen:', rolesError);
      throw new Error('Fehler beim Überprüfen der Benutzerberechtigungen');
    }
    
    const isAdmin = roles?.some(r => r.role === 'admin' || r.role === 'superadmin');
    
    if (!isAdmin) {
      console.error(`Benutzer ${user.id} ist kein Admin`);
      return new Response(
        JSON.stringify({ error: 'Verboten - Admin-Rechte erforderlich' }), 
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Admin-Berechtigung bestätigt für Benutzer: ${user.id}`);
    
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