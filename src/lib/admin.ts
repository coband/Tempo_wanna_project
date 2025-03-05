import { supabase } from "./supabase";

/**
 * Fügt einem Benutzer die Administratorrolle hinzu oder entfernt sie
 */
export const toggleAdminRole = async (userId: string) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Nicht eingeloggt");

    const { data, error } = await supabase.functions.invoke('manage-users', {
      method: 'POST',
      body: { 
        targetUserId: userId,
        action: 'toggle-admin'
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Fehler beim Ändern der Administratorrolle:", error);
    throw error;
  }
};

/**
 * Prüft, ob der aktuelle Benutzer ein Administrator ist
 */
export const checkIsCurrentUserAdmin = async () => {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.access_token) return false;
    
    // JWT dekodieren
    const token = sessionData.session.access_token;
    const tokenPayload = JSON.parse(atob(token.split('.')[1]));
    
    return tokenPayload.user_role === 'admin';
  } catch (error) {
    console.error("Fehler bei der Admin-Prüfung:", error);
    return false;
  }
};

/**
 * Holt alle Benutzer mit deren Administratorstatus
 */
export const getAllUsersWithAdminStatus = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Nicht eingeloggt");

    const { data, error } = await supabase.functions.invoke('manage-users', {
      method: 'POST',
      body: {
        action: 'list-users'
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (error) throw error;
    return data.users;
  } catch (error) {
    console.error("Fehler beim Abrufen der Benutzer:", error);
    throw error;
  }
}; 