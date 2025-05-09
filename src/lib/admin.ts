// Importiere useSupabase für den authentifizierten Client
import { useSupabase } from '@/contexts/SupabaseContext';

/**
 * Fügt einem Benutzer die Administratorrolle hinzu oder entfernt sie
 * @param userId ID des Benutzers
 * @param supabaseClient optionaler Supabase-Client, sonst muss innerhalb von useSupabase verwendet werden
 */
export const toggleAdminRole = async (userId: string, supabaseClient?: any) => {
  try {
    // Client entweder aus dem Parameter nehmen oder ein Fehler werfen
    const supabase = supabaseClient;
    if (!supabase) {
      throw new Error("Diese Funktion muss in einer Komponente mit useSupabase() aufgerufen werden oder einen Client erhalten");
    }

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
 * @param supabaseClient optionaler Supabase-Client, sonst muss innerhalb von useSupabase verwendet werden
 */
export const checkIsCurrentUserAdmin = async (supabaseClient?: any) => {
  try {
    // Client entweder aus dem Parameter nehmen oder ein Fehler werfen
    const supabase = supabaseClient;
    if (!supabase) {
      throw new Error("Diese Funktion muss in einer Komponente mit useSupabase() aufgerufen werden oder einen Client erhalten");
    }
    
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
 * @param supabaseClient optionaler Supabase-Client, sonst muss innerhalb von useSupabase verwendet werden
 */
export const getAllUsersWithAdminStatus = async (supabaseClient?: any) => {
  try {
    // Client entweder aus dem Parameter nehmen oder ein Fehler werfen
    const supabase = supabaseClient;
    if (!supabase) {
      throw new Error("Diese Funktion muss in einer Komponente mit useSupabase() aufgerufen werden oder einen Client erhalten");
    }
    
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