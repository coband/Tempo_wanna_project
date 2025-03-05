import { supabase } from "./supabase";

// Typdeklarationen
export type UserRole = 'admin' | 'superadmin';

export interface User {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  roles: string[];
  is_blocked: boolean;
  block_reason: string | null;
}

/**
 * Benutzer mit Rollen auflisten
 */
export const listUsers = async (): Promise<User[]> => {
  try {
    console.log('listUsers: Starte Abruf der Benutzerliste');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Nicht eingeloggt");
    
    console.log('listUsers: Session gefunden');
    
    // URL der Edge-Funktion bestimmen
    const supabaseUrlEnv = import.meta.env.VITE_SUPABASE_URL;
    const functionUrl = `${supabaseUrlEnv}/functions/v1/manage-users`;
    
    console.log('listUsers: Verwende URL:', functionUrl);
    
    // Direkte fetch-Anfrage statt Supabase SDK
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'list-users' })
    });
    
    console.log('listUsers: HTTP-Status erhalten:', response.status);
    const responseData = await response.json();
    console.log('listUsers: Antwort erhalten:', responseData);
    
    if (!response.ok) {
      console.error('listUsers: Fehler in der Antwort:', responseData);
      throw new Error(responseData.error || 'Unbekannter Fehler beim Abrufen der Benutzerliste');
    }
    
    return responseData.users;
  } catch (error) {
    console.error("Fehler beim Abrufen der Benutzer:", error);
    throw error;
  }
};

/**
 * Benutzerrolle umschalten
 */
export const toggleUserRole = async (userId: string, role: UserRole): Promise<{ hasRole: boolean }> => {
  try {
    console.log(`toggleUserRole: Starte Umschaltung für Benutzer ${userId} mit Rolle ${role}`);
    
    // Session für Auth-Token abrufen
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Nicht eingeloggt");
    
    console.log(`toggleUserRole: Session gefunden, Token: ${session.access_token.substring(0, 10)}...`);
    
    // Request-Body vorbereiten
    const requestBody = { 
      action: 'toggle-role',
      targetUserId: userId,
      role
    };
    
    console.log('toggleUserRole: Sende Anfrage mit Body:', requestBody);
    
    // URL der Edge-Funktion bestimmen
    // Wir nutzen die VITE_SUPABASE_URL aus der Umgebung
    const supabaseUrlEnv = import.meta.env.VITE_SUPABASE_URL;
    const functionUrl = `${supabaseUrlEnv}/functions/v1/manage-users`;
    
    console.log('toggleUserRole: Verwende URL:', functionUrl);
    
    // Direkte fetch-Anfrage statt Supabase SDK
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    // Antwort auswerten
    console.log('toggleUserRole: HTTP-Status erhalten:', response.status);
    const responseData = await response.json();
    console.log('toggleUserRole: Antwort erhalten:', responseData);
    
    if (!response.ok) {
      console.error('toggleUserRole: Fehler in der Antwort:', responseData);
      throw new Error(responseData.error || 'Unbekannter Fehler beim Umschalten der Rolle');
    }
    
    console.log('toggleUserRole: Erfolgreiche Antwort mit Daten:', responseData);
    return responseData;
  } catch (error) {
    console.error(`Fehler beim Umschalten der ${role}-Rolle:`, error);
    throw error;
  }
};

/**
 * Benutzer sperren/entsperren
 */
export const toggleUserBlock = async (userId: string, reason?: string): Promise<{ isBlocked: boolean }> => {
  try {
    console.log(`toggleUserBlock: Starte Toggle für Benutzer ${userId}`);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Nicht eingeloggt");
    
    console.log('toggleUserBlock: Session gefunden');
    
    // Request-Body vorbereiten
    const requestBody = { 
      action: 'toggle-block',
      targetUserId: userId,
      reason
    };
    
    console.log('toggleUserBlock: Sende Anfrage mit Body:', requestBody);
    
    // URL der Edge-Funktion bestimmen
    const supabaseUrlEnv = import.meta.env.VITE_SUPABASE_URL;
    const functionUrl = `${supabaseUrlEnv}/functions/v1/manage-users`;
    
    console.log('toggleUserBlock: Verwende URL:', functionUrl);
    
    // Direkte fetch-Anfrage statt Supabase SDK
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    // Antwort auswerten
    console.log('toggleUserBlock: HTTP-Status erhalten:', response.status);
    const responseData = await response.json();
    console.log('toggleUserBlock: Antwort erhalten:', responseData);
    
    if (!response.ok) {
      console.error('toggleUserBlock: Fehler in der Antwort:', responseData);
      throw new Error(responseData.error || 'Unbekannter Fehler beim Sperren/Entsperren des Benutzers');
    }
    
    console.log('toggleUserBlock: Erfolgreiche Antwort mit Daten:', responseData);
    return responseData;
  } catch (error) {
    console.error("Fehler beim Sperren/Entsperren des Benutzers:", error);
    throw error;
  }
};

/**
 * Passwort zurücksetzen
 */
export const resetUserPassword = async (email: string): Promise<{ message: string }> => {
  try {
    console.log(`resetUserPassword: Starte Zurücksetzung für E-Mail ${email}`);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Nicht eingeloggt");
    
    console.log('resetUserPassword: Session gefunden');
    
    // Request-Body vorbereiten
    const requestBody = { 
      action: 'reset-password',
      email
    };
    
    console.log('resetUserPassword: Sende Anfrage mit Body:', requestBody);
    
    // URL der Edge-Funktion bestimmen
    const supabaseUrlEnv = import.meta.env.VITE_SUPABASE_URL;
    const functionUrl = `${supabaseUrlEnv}/functions/v1/manage-users`;
    
    console.log('resetUserPassword: Verwende URL:', functionUrl);
    
    // Direkte fetch-Anfrage statt Supabase SDK
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    // Antwort auswerten
    console.log('resetUserPassword: HTTP-Status erhalten:', response.status);
    const responseData = await response.json();
    console.log('resetUserPassword: Antwort erhalten:', responseData);
    
    if (!response.ok) {
      console.error('resetUserPassword: Fehler in der Antwort:', responseData);
      throw new Error(responseData.error || 'Unbekannter Fehler beim Zurücksetzen des Passworts');
    }
    
    console.log('resetUserPassword: Erfolgreiche Antwort mit Daten:', responseData);
    return responseData;
  } catch (error) {
    console.error("Fehler beim Zurücksetzen des Passworts:", error);
    throw error;
  }
};

/**
 * Prüfen, ob der aktuelle Benutzer ein Superadmin ist
 */
export const checkIsSuperAdmin = async (): Promise<boolean> => {
  try {
    console.log('checkIsSuperAdmin: Prüfe Superadmin-Status');
    
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.access_token) {
      console.log('checkIsSuperAdmin: Keine gültige Session gefunden');
      return false;
    }
    
    // Zunächst versuchen wir, den JWT-Token zu dekodieren
    try {
      console.log('checkIsSuperAdmin: Versuche JWT-Dekodierung');
      
      // JWT dekodieren
      const token = sessionData.session.access_token;
      const tokenParts = token.split('.');
      if (tokenParts.length !== 3) {
        console.log('checkIsSuperAdmin: Ungültiges JWT-Format');
        return false;
      }
      
      const payload = JSON.parse(atob(tokenParts[1]));
      const hasRoleInJWT = payload.user_role === 'superadmin';
      
      console.log('checkIsSuperAdmin: JWT-Prüfung ergab:', hasRoleInJWT);
      
      if (hasRoleInJWT) return true;
    } catch (jwtError) {
      console.error('checkIsSuperAdmin: Fehler bei JWT-Dekodierung:', jwtError);
      // Falls JWT-Dekodierung fehlschlägt, versuchen wir die API-Methode
    }
    
    // Fallback: Check über die Edge-Funktion
    console.log('checkIsSuperAdmin: Versuche API-Prüfung');
    
    // URL der Edge-Funktion bestimmen
    const supabaseUrlEnv = import.meta.env.VITE_SUPABASE_URL;
    const functionUrl = `${supabaseUrlEnv}/functions/v1/manage-users`;
    
    // Direkte fetch-Anfrage statt Supabase SDK
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionData.session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'check-role', role: 'superadmin' })
    });
    
    if (!response.ok) {
      console.error('checkIsSuperAdmin: API-Anfrage fehlgeschlagen:', response.status);
      return false;
    }
    
    const responseData = await response.json();
    const hasRole = responseData.hasRole === true;
    
    console.log('checkIsSuperAdmin: API-Prüfung ergab:', hasRole);
    return hasRole;
  } catch (error) {
    console.error("Fehler bei der Superadmin-Prüfung:", error);
    return false;
  }
}; 