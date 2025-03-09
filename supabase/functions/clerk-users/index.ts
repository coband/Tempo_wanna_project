import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// CORS-Header für API-Anfragen
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Clerk API URL
const CLERK_API_URL = 'https://api.clerk.com/v1';

// Hilfsfunktion für Anfragen an die Clerk API
async function clerkApiRequest(path: string, method = 'GET', body?: any) {
  console.log(`Clerk API Anfrage: ${method} ${path}`);
  
  const clerkSecretKey = Deno.env.get('CLERK_SECRET_KEY');
  if (!clerkSecretKey) {
    throw new Error('CLERK_SECRET_KEY ist nicht konfiguriert');
  }
  
  const url = `${CLERK_API_URL}${path}`;
  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${clerkSecretKey}`,
      'Content-Type': 'application/json',
    },
  };

  if (body && (method === 'POST' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }

  console.log(`Sende Anfrage an: ${url}`);
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const text = await response.text();
    console.error(`Clerk API Fehler: ${response.status} ${text}`);
    throw new Error(`Clerk API Fehler: ${response.status} ${text}`);
  }
  
  return response.json();
}

// Benutzer aus Clerk in das Format unserer Anwendung transformieren
function transformClerkUser(user: any) {
  return {
    id: user.id,
    email: user.email_addresses?.[0]?.email_address || '',
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
    roles: [user.public_metadata?.role || 'user'].filter(Boolean),
    is_blocked: user.locked,
    block_reason: user.public_metadata?.block_reason || null
  };
}

serve(async (req) => {
  console.log('---------------------------------------------');
  console.log(`Neue Clerk-Benutzer-Anfrage: ${req.method} ${new URL(req.url).pathname}`);
  
  // CORS-Präflug-Anfrage behandeln
  if (req.method === 'OPTIONS') {
    console.log('CORS Preflight-Anfrage empfangen');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Prüfen, ob der Clerk Secret Key konfiguriert ist
    const clerkSecretKey = Deno.env.get('CLERK_SECRET_KEY');
    if (!clerkSecretKey) {
      console.error('CLERK_SECRET_KEY fehlt in der Umgebungskonfiguration');
      return new Response(
        JSON.stringify({ error: 'Clerk Secret Key ist nicht konfiguriert' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    // Request-Body und Aktion extrahieren
    let body = {};
    let action = '';
    
    if (req.method === 'POST') {
      try {
        const rawBody = await req.text();
        console.log('Request body (RAW):', rawBody);
        
        if (rawBody && rawBody.trim() !== '') {
          body = JSON.parse(rawBody);
          console.log('Parsed JSON body:', JSON.stringify(body, null, 2));
          action = body?.action || '';
        } else {
          console.log('Leerer Body, setze Standard-Aktion');
          body = {};
          action = 'list-users'; // Standard-Aktion
        }
      } catch (error) {
        console.error('Fehler beim Lesen/Parsen des Body:', error);
        return new Response(
          JSON.stringify({ 
            error: 'Fehler beim Lesen des Body', 
            details: error.message
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          }
        );
      }
    } else {
      console.log('Keine POST-Anfrage, setze Standard-Aktion');
      body = {};
      action = 'list-users';
    }
    
    console.log('Aktion:', action);

    // Aktionen verarbeiten
    switch (action) {
      case 'list-users':
        console.log('Rufe Benutzer von Clerk ab...');
        
        try {
          const users = await clerkApiRequest('/users');
          
          // Transformiere Clerk-Benutzer in das Format unserer Anwendung
          const transformedUsers = users.map(transformClerkUser);
          
          console.log(`${transformedUsers.length} Benutzer abgerufen`);
          
          return new Response(
            JSON.stringify({ users: transformedUsers }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200,
            }
          );
        } catch (error) {
          console.error('Fehler beim Abrufen der Benutzer:', error);
          return new Response(
            JSON.stringify({ error: 'Fehler beim Abrufen der Benutzer', details: error.message }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 500,
            }
          );
        }
        
      case 'toggle-role':
        console.log('Benutzerrolle umschalten...');
        const userId = body.userId;
        const role = body.role;
        
        if (!userId || !role) {
          return new Response(
            JSON.stringify({ error: 'userId und role sind erforderlich' }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 400,
            }
          );
        }
        
        try {
          // Benutzerdetails abrufen
          const userData = await clerkApiRequest(`/users/${userId}`);
          
          // Aktuelle Rolle ermitteln
          const currentRole = userData.public_metadata?.role || '';
          
          // Neue Rolle bestimmen (entfernen, wenn bereits vorhanden, sonst hinzufügen)
          const newRole = currentRole === role ? '' : role;
          
          console.log(`Ändere Rolle für Benutzer ${userId} von "${currentRole}" zu "${newRole}"`);
          
          // Metadaten aktualisieren
          const updatedUser = await clerkApiRequest(`/users/${userId}/metadata`, 'PATCH', {
            public_metadata: {
              ...userData.public_metadata,
              role: newRole
            }
          });
          
          return new Response(
            JSON.stringify({ hasRole: updatedUser.public_metadata?.role === role }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200,
            }
          );
        } catch (error) {
          console.error('Fehler beim Ändern der Rolle:', error);
          return new Response(
            JSON.stringify({ error: 'Fehler beim Ändern der Rolle', details: error.message }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 500,
            }
          );
        }
        
      case 'toggle-block':
        console.log('Benutzer sperren/entsperren...');
        const blockUserId = body.userId;
        const reason = body.reason;
        
        if (!blockUserId) {
          return new Response(
            JSON.stringify({ error: 'userId ist erforderlich' }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 400,
            }
          );
        }
        
        try {
          // Benutzerdetails abrufen
          const blockUserData = await clerkApiRequest(`/users/${blockUserId}`);
          
          // Aktuellen Status ermitteln
          const isCurrentlyBlocked = blockUserData.locked || false;
          
          console.log(`Ändere Sperrstatus für Benutzer ${blockUserId} von ${isCurrentlyBlocked} zu ${!isCurrentlyBlocked}`);
          
          // Sperrgrund in Metadaten speichern
          await clerkApiRequest(`/users/${blockUserId}/metadata`, 'PATCH', {
            public_metadata: {
              ...blockUserData.public_metadata,
              block_reason: isCurrentlyBlocked ? null : reason || null
            }
          });
          
          // Benutzer sperren oder entsperren
          const blockAction = isCurrentlyBlocked ? 'unblock' : 'block';
          const blockedUser = await clerkApiRequest(`/users/${blockUserId}/${blockAction}`, 'POST');
          
          return new Response(
            JSON.stringify({ isBlocked: blockedUser.locked || false }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200,
            }
          );
        } catch (error) {
          console.error('Fehler beim Sperren/Entsperren des Benutzers:', error);
          return new Response(
            JSON.stringify({ error: 'Fehler beim Sperren/Entsperren des Benutzers', details: error.message }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 500,
            }
          );
        }
        
      case 'reset-password':
        console.log('Anmelde-Link senden...');
        const email = body.email;
        
        if (!email) {
          return new Response(
            JSON.stringify({ error: 'E-Mail-Adresse ist erforderlich' }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 400,
            }
          );
        }
        
        try {
          // Magic Link für die Anmeldung senden
          await clerkApiRequest('/sign_in_tokens', 'POST', {
            email_address: email
          });
          
          console.log(`Anmelde-Link an ${email} gesendet`);
          
          return new Response(
            JSON.stringify({ message: `Ein Anmelde-Link wurde an ${email} gesendet.` }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200,
            }
          );
        } catch (error) {
          console.error('Fehler beim Senden des Anmelde-Links:', error);
          return new Response(
            JSON.stringify({ error: 'Fehler beim Senden des Anmelde-Links', details: error.message }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 500,
            }
          );
        }
        
      default:
        console.log(`Unbekannte Aktion: ${action}`);
        return new Response(
          JSON.stringify({ error: 'Unbekannte Aktion' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          }
        );
    }
  } catch (error) {
    console.error('Unerwarteter Fehler:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Interner Serverfehler', 
        details: error.message,
        stack: error.stack
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
}); 