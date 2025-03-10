import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { createClient } from '@supabase/supabase-js';

// Supabase Konfiguration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

/**
 * Custom Hook für authentifizierten Supabase-Client
 * Erstellt einen Supabase-Client mit dem Clerk-JWT-Token
 */
export function useSupabaseAuth() {
  const { getToken } = useAuth();
  const [authClient, setAuthClient] = useState(createClient(supabaseUrl, supabaseAnonKey));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function setupClient() {
      try {
        setLoading(true);
        // Hole das Supabase-JWT-Template von Clerk
        const token = await getToken({ template: 'supabase' });
        
        if (token) {
          // Erstelle einen neuen Supabase-Client mit dem Token
          const client = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          });
          setAuthClient(client);
        }
      } catch (error) {
        console.error("Fehler beim Erstellen des authentifizierten Supabase-Clients:", error);
      } finally {
        setLoading(false);
      }
    }

    setupClient();
  }, [getToken]);

  return { authClient, loading };
} 