import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Anfrage-Details protokollieren
  console.log('---------------------------------------------');
  console.log(`Neue Anfrage: ${req.method} ${new URL(req.url).pathname}`);
  console.log('Content-Type:', req.headers.get('Content-Type'));
  console.log('Authorization-Header vorhanden:', !!req.headers.get('Authorization'));
  
  // CORS-Präflug-Anfrage behandeln
  if (req.method === 'OPTIONS') {
    console.log('CORS Preflight-Anfrage empfangen');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Umgebungsvariablen für Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    console.log('Supabase URL verfügbar:', !!supabaseUrl);
    console.log('Supabase Anon Key verfügbar:', !!supabaseAnonKey);
    console.log('Supabase Service Key verfügbar:', !!supabaseServiceKey);

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase Konfiguration fehlt' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    // JWT Token aus dem Authorization Header extrahieren
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader) {
      console.log('Fehler: Authorization Header fehlt');
      return new Response(
        JSON.stringify({ error: 'Authorization Header fehlt' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      console.log('Fehler: Token fehlt');
      return new Response(
        JSON.stringify({ error: 'Token fehlt' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    // Supabase-Client mit dem JWT-Token für reguläre Aktionen
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    // Benutzer-Authentifizierungsinformationen abrufen
    const { data: userData, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError) {
      console.error('Fehler bei der Authentifizierung:', authError);
      return new Response(
        JSON.stringify({ error: 'Ungültiger Token', details: authError.message }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    if (!userData || !userData.user) {
      console.log('Fehler: Benutzer nicht gefunden');
      return new Response(
        JSON.stringify({ error: 'Benutzer nicht gefunden' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    console.log('Benutzer erfolgreich authentifiziert:', userData.user.id);
    
    // Request-Body und Aktion extrahieren
    let body = {};
    let action = '';
    let rawBody = '';
    
    if (req.method === 'POST' || req.method === 'PUT') {
      // Wenn Content-Type application/json ist, versuchen wir den Body als JSON zu parsen
      if (req.headers.get('Content-Type')?.includes('application/json')) {
        try {
          const clonedReq = req.clone();
          rawBody = await clonedReq.text();
          console.log('Request body (RAW):', rawBody);
          
          if (rawBody && rawBody.trim() !== '') {
            try {
              body = JSON.parse(rawBody);
              console.log('Parsed JSON body:', JSON.stringify(body, null, 2));
              action = body?.action || '';
              console.log('Erkannte Aktion aus JSON:', action);
            } catch (parseError) {
              console.error('JSON Parse Fehler:', parseError);
              return new Response(
                JSON.stringify({ 
                  error: 'Ungültiger JSON-Body', 
                  details: parseError.message,
                  rawBody: rawBody
                }),
                {
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                  status: 400,
                }
              );
            }
          } else {
            console.log('Leerer Body, setze Standard-Aktion');
            body = {};
            action = 'list-users'; // Standard-Aktion
          }
        } catch (error) {
          console.error('Fehler beim Lesen/Parsen des Body:', error);
          // Bei einem ungültigen JSON-Body geben wir einen Fehler zurück
          return new Response(
            JSON.stringify({ 
              error: 'Fehler beim Lesen des Body', 
              details: error.message,
              hint: 'Stellen Sie sicher, dass der Content-Type application/json ist und der Body gültiges JSON enthält'
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 400,
            }
          );
        }
      } else {
        // Bei einem anderen Content-Type versuchen wir, den Formular-Body zu extrahieren
        console.log('Nicht-JSON Content-Type, versuche als Formular zu parsen');
        try {
          const formData = await req.formData();
          body = {};
          for (const [key, value] of formData.entries()) {
            body[key] = value;
          }
          action = body?.action || '';
          console.log('Form data body:', JSON.stringify(body, null, 2));
        } catch (error) {
          console.error('Fehler beim Parsen des Formular-Body:', error);
          // Bei einer GET-Anfrage oder wenn der Body nicht gelesen werden kann, gehen wir von list-users aus
          body = {};
          action = 'list-users';
          console.log('Konnte keinen Body lesen, setze Standard-Aktion:', action);
        }
      }
    } else {
      // Bei einer GET-Anfrage
      console.log('GET-Anfrage ohne Body, setze Standard-Aktion');
      body = {};
      action = 'list-users';
    }
    
    console.log('Endgültige Aktion:', action);
    
    // Supabase Admin-Client mit Service-Rolle für erweiterte Berechtigungen
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    
    // Benutzerrollen aus der Datenbank abrufen
    console.log('Rufe Benutzerrollen aus der Datenbank ab');
    const { data: userRolesFromDB, error: rolesError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id);
    
    if (rolesError) {
      console.error('Fehler beim Abrufen der Benutzerrolle:', rolesError);
      return new Response(
        JSON.stringify({ 
          error: 'Fehler beim Abrufen der Benutzerrolle', 
          details: rolesError.message 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }
    
    // Rollen in ein Array umwandeln
    const userRoles = (userRolesFromDB || []).map(r => r.role);
    console.log('Benutzerrollen aus DB:', userRoles);
    
    // Überprüfen, ob der Benutzer Admin oder Superadmin ist
    const isAdmin = userRoles.includes('admin');
    const isSuperAdmin = userRoles.includes('superadmin');
    
    if (!isAdmin && !isSuperAdmin) {
      console.log('Fehler: Benutzer hat keine Admin-Berechtigungen');
      return new Response(
        JSON.stringify({ error: 'Nicht autorisiert - Keine Administratorberechtigungen' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      );
    }
    
    // Für die weitere Verarbeitung speichern wir die höchste Rolle
    const userRole = isSuperAdmin ? 'superadmin' : 'admin';
    console.log('Höchste Benutzerrolle:', userRole);

    // Aktionen verarbeiten
    console.log('Verarbeite Aktion:', action);
    
    // Beide wichtigen Aktionen unterstützen
    if (action === 'list-users') {
      try {
        console.log('DEBUG: Führe list-users Aktion aus');
        
        // Alle Benutzer abrufen
        const { data: users, error: usersError } = await adminClient.auth.admin.listUsers();
        
        if (usersError) {
          console.error('Fehler beim Abrufen der Benutzer:', usersError);
          return new Response(
            JSON.stringify({ 
              error: 'Fehler beim Abrufen der Benutzer', 
              details: usersError.message 
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 500 
            }
          );
        }
        
        // Benutzerrollen abrufen
        const { data: userRoles, error: rolesError } = await adminClient
          .from('user_roles')
          .select('user_id, role');
        
        if (rolesError) {
          console.error('Fehler beim Abrufen der Benutzerrollen:', rolesError);
          return new Response(
            JSON.stringify({ 
              error: 'Fehler beim Abrufen der Benutzerrollen', 
              details: rolesError.message 
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 500 
            }
          );
        }
        
        // Gesperrte Benutzer abrufen
        const { data: blockedUsers, error: blockedError } = await adminClient
          .from('blocked_users')
          .select('user_id, reason');
        
        if (blockedError) {
          console.error('Fehler beim Abrufen der gesperrten Benutzer:', blockedError);
          return new Response(
            JSON.stringify({ 
              error: 'Fehler beim Abrufen der gesperrten Benutzer', 
              details: blockedError.message 
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 500 
            }
          );
        }
        
        // Maps für schnellen Zugriff erstellen
        const rolesMap = {};
        userRoles?.forEach(r => {
          if (!rolesMap[r.user_id]) {
            rolesMap[r.user_id] = [];
          }
          rolesMap[r.user_id].push(r.role);
        });
        
        const blockedMap = {};
        blockedUsers?.forEach(b => {
          blockedMap[b.user_id] = b.reason || true;
        });
        
        const usersWithRoles = users.users.map(user => ({
          id: user.id,
          email: user.email,
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at,
          roles: rolesMap[user.id] || [],
          is_blocked: !!blockedMap[user.id],
          block_reason: blockedMap[user.id] !== true ? blockedMap[user.id] : null
        }));
        
        console.log(`DEBUG: ${usersWithRoles.length} Benutzer gefunden`);
        return new Response(
          JSON.stringify({ users: usersWithRoles }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (listError) {
        console.error('Fehler bei list-users:', listError);
        return new Response(
          JSON.stringify({ 
            error: 'Fehler beim Auflisten der Benutzer', 
            details: listError.message,
            stack: listError.stack
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        );
      }
    } else if (action === 'toggle-admin' || action === 'toggle-role') {
      try {
        // Debug-Modus für das Problem mit toggle-admin/toggle-role
        console.log(`DEBUG: ${action.toUpperCase()} DEBUG MODUS AKTIV`);
        
        // Berechtigungen testen mit Service-Rolle
        try {
          console.log('⚠️ BERECHTIGUNGSTEST: Direkter Versuch mit Service-Role-Key ⚠️');
          console.log('adminClient konfiguriert mit URL:', supabaseUrl.substring(0, 20) + '...');
          console.log('adminClient nutzt Service-Key?', !!supabaseServiceKey);
          
          // Testdaten einfügen und wieder entfernen
          const testUserId = userData.user.id;
          const testRole = 'test_permission';
          
          console.log(`Füge Testdaten ein für Benutzer ${testUserId}`);
          const { data: insertTest, error: insertTestError } = await adminClient
            .from('user_roles')
            .insert([{ user_id: testUserId, role: testRole }]);
            
          console.log('Test-Insert Ergebnis:', { data: insertTest, error: insertTestError });
          
          if (insertTestError) {
            console.error('⚠️ BERECHTIGUNGSFEHLER: Service-Role kann nicht in user_roles schreiben:', insertTestError);
          } else {
            console.log('✅ Service-Role kann in user_roles schreiben');
            
            // Testdaten wieder entfernen
            const { data: deleteTest, error: deleteTestError } = await adminClient
              .from('user_roles')
              .delete()
              .eq('user_id', testUserId)
              .eq('role', testRole);
              
            console.log('Test-Delete Ergebnis:', { data: deleteTest, error: deleteTestError });
            
            if (deleteTestError) {
              console.error('⚠️ BERECHTIGUNGSFEHLER: Service-Role kann nicht aus user_roles löschen:', deleteTestError);
            } else {
              console.log('✅ Service-Role kann aus user_roles löschen');
            }
          }
        } catch (permError) {
          console.error('Fehler beim Berechtigungstest:', permError);
        }
        
        // Gemeinsame Logik für beide Aktionen
        const targetUserId = body?.targetUserId;
        const role = action === 'toggle-role' ? body?.role || 'admin' : 'admin';
        
        console.log('Target User ID:', targetUserId);
        console.log('Zu ändernde Rolle:', role);
        
        if (!targetUserId) {
          console.log('Fehler: targetUserId fehlt in der Anfrage');
          return new Response(
            JSON.stringify({ error: 'Benutzer-ID fehlt' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
        
        // Ausgabe aller Benutzerrollen für Debugging
        try {
          const { data: allRoles, error: allRolesError } = await adminClient
            .from('user_roles')
            .select('*');
            
          console.log('Alle Rollen in der Datenbank:', JSON.stringify(allRoles || [], null, 2));
          if (allRolesError) {
            console.error('Fehler beim Abrufen aller Rollen:', allRolesError);
          }
        } catch (debugError) {
          console.error('Debug-Fehler beim Abrufen aller Rollen:', debugError);
        }
        
        // Prüfen, ob Benutzer bereits diese Rolle hat
        console.log(`Prüfe, ob Benutzer bereits ${role} ist:`, targetUserId);
        const { data: existingRole, error: roleCheckError } = await adminClient
          .from('user_roles')
          .select('id')
          .eq('user_id', targetUserId)
          .eq('role', role)
          .single();
        
        console.log(`Ergebnis der ${role}-Prüfung:`, { existingRole, error: roleCheckError });
        
        if (roleCheckError && roleCheckError.code !== 'PGRST116') {
          console.error(`Fehler beim Prüfen der ${role}-Rolle:`, roleCheckError);
          return new Response(
            JSON.stringify({ 
              error: `Fehler beim Prüfen der ${role}-Rolle`, 
              details: roleCheckError.message 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }
        
        if (existingRole) {
          // Rolle entfernen
          console.log(`Benutzer ist bereits ${role}, entferne die Rolle`);
          const { data: removeData, error: removeError } = await adminClient
            .from('user_roles')
            .delete()
            .eq('user_id', targetUserId)
            .eq('role', role);
          
          console.log('Ergebnis des Entfernens:', { removeData, error: removeError });
          
          if (removeError) {
            console.error(`Fehler beim Entfernen der ${role}-Rolle:`, removeError);
            return new Response(
              JSON.stringify({ 
                error: `Fehler beim Entfernen der ${role}-Rolle`, 
                details: removeError.message 
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
            );
          }
          
          return new Response(
            JSON.stringify({ success: true, hasRole: false }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          // Rolle hinzufügen
          console.log(`Benutzer ist noch kein ${role}, füge die Rolle hinzu`);
          const { data: insertData, error: addError } = await adminClient
            .from('user_roles')
            .insert([{ user_id: targetUserId, role: role }]);
          
          console.log('Ergebnis des Hinzufügens:', { insertData, error: addError });
          
          if (addError) {
            console.error(`Fehler beim Hinzufügen der ${role}-Rolle:`, addError);
            return new Response(
              JSON.stringify({ 
                error: `Fehler beim Hinzufügen der ${role}-Rolle`, 
                details: addError.message 
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
            );
          }
          
          return new Response(
            JSON.stringify({ success: true, hasRole: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (toggleRoleError) {
        console.error('Fehler bei toggle-role:', toggleRoleError);
        return new Response(
          JSON.stringify({ 
            error: 'Fehler beim Verwalten der Benutzerrolle', 
            details: toggleRoleError.message,
            stack: toggleRoleError.stack
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }
    } else if (action === 'check-role') {
      try {
        console.log(`DEBUG: Prüfe Rolle ${body?.role} für Benutzer ${userData.user.id}`);
        
        // Wir prüfen, ob der Benutzer die angegebene Rolle hat
        const requestedRole = body?.role || 'admin';
        
        // Prüfen, ob der Benutzer die angeforderte Rolle hat
        const { data: roleData, error: roleError } = await adminClient
          .from('user_roles')
          .select('id')
          .eq('user_id', userData.user.id)
          .eq('role', requestedRole)
          .single();
          
        console.log('check-role Ergebnis:', { data: roleData, error: roleError });
        
        // PGRST116 bedeutet "Kein Ergebnis gefunden" bei single()
        const hasRole = roleError === null || roleError.code !== 'PGRST116';
        
        return new Response(
          JSON.stringify({ hasRole }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (checkRoleError) {
        console.error('Fehler beim Prüfen der Rolle:', checkRoleError);
        return new Response(
          JSON.stringify({ 
            error: 'Fehler beim Prüfen der Rolle', 
            details: checkRoleError.message,
            stack: checkRoleError.stack
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }
    } else {
      // Für jede andere Aktion: Standardantwort zurückgeben
      console.log('Unbekannte Aktion:', action);
      return new Response(
        JSON.stringify({ 
          message: 'Dies ist eine Debug-Version. Unterstützt nur list-users, toggle-admin, toggle-role und check-role.',
          action: action,
          userRole: userRole,
          userId: userData.user.id,
          receivedBody: body
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Unbehandelter Fehler:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Serverfehler',
        details: error.message,
        stack: error.stack 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
}); 