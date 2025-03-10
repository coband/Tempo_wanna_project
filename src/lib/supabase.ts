import { createClient } from "@supabase/supabase-js";
import { useAuth } from '@clerk/clerk-react';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

// Standard Supabase-Client ohne Authentifizierung
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Funktion zum Erstellen eines authentifizierten Supabase-Clients mit Clerk-Token
export async function createAuthClient() {
  try {
    const { getToken } = useAuth();
    const token = await getToken({ template: 'supabase' });
    
    if (token) {
      // Supabase-Client mit Clerk-JWT zurückgeben
      return createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      });
    }
  } catch (error) {
    console.error("Fehler beim Erstellen des authentifizierten Supabase-Clients:", error);
  }
  
  // Standardmäßig nicht-authentifizierten Client zurückgeben
  return supabase;
}
