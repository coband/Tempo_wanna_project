import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

// Supabase Konfiguration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

// Erstelle einen anonymen Client für nicht-authentifizierte Anfragen
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

/**
 * Custom Hook für authentifizierten Supabase-Client basierend auf Clerk-Token
 * Implementiert nach der offiziellen Clerk-Supabase-Dokumentation
 */
export function useSupabaseAuth() {
  const { getToken, userId, isSignedIn } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Erstelle einen Supabase-Client mit angepasstem fetch für Auth-Token
  const authClient = useMemo(() => {
    const client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      global: {
        // Angepasste fetch-Funktion für Token-Injektion
        fetch: async (url, options: RequestInit = {}) => {
          try {
            // Wenn nicht angemeldet, verwende Standard-Fetch ohne Auth
            if (!isSignedIn) {
              return fetch(url, options);
            }
            
            // Hole Clerk-Token für Supabase
            const clerkToken = await getToken({ template: 'supabase' });
            
            if (!clerkToken) {
              console.warn("Kein Token von Clerk erhalten - verwende Anfrage ohne Authentifizierung");
              return fetch(url, options);
            }

            // Token in der Konsole ausgeben und global speichern
            console.log("JWT Token:", clerkToken);
      

            // Extrahiere Daten aus dem JWT-Token für Benutzerrollen-Management
            try {
              const [, payload] = clerkToken.split('.');
              const decodedPayload = JSON.parse(atob(payload));
              setUserRole(decodedPayload.user_role || null);
            } catch (err) {
              console.warn("Konnte JWT-Token nicht dekodieren:", err);
            }

            // Füge den Token zu den Headers hinzu
            const headers = new Headers(options.headers || {});
            headers.set('Authorization', `Bearer ${clerkToken}`);
            
            // Rufe den Standard-fetch mit den modifizierten Headers auf
            return fetch(url, {
              ...options,
              headers,
            });
          } catch (err) {
            console.error("Fehler beim Fetch mit Auth-Token:", err);
            // Im Fehlerfall: Verwende Anfrage ohne Authentifizierung als Fallback
            return fetch(url, options);
          }
        },
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
    
    return client;
  }, [getToken, isSignedIn]);

  // Prüfe initial, ob der Client funktioniert
  useEffect(() => {
    if (!isSignedIn) {
      setLoading(false);
      return;
    }
    
    // Bestätige, dass die Authentifizierung funktioniert
    setLoading(false);
  }, [isSignedIn]);

  // Helper-Funktion für vereinfachte Anfragen mit automatischer Fehlerbehandlung
  const handleRequest = useCallback(
    async <T,>(
      requestFn: (client: SupabaseClient<Database>) => Promise<{ data: T | null; error: any }>
    ): Promise<{ data: T | null; error: any }> => {
      try {
        return await requestFn(authClient);
      } catch (error) {
        console.error("Fehler bei der Anfrage:", error);
        return { data: null, error };
      }
    },
    [authClient]
  );

  return { 
    supabase: authClient,             // Authentifizierter Client
    publicClient: supabase,           // Nicht-authentifizierter Client für öffentliche Daten
    loading, 
    error,
    handleRequest,
    isAuthenticated: isSignedIn,
    userId,
    userRole,
    isAdmin: userRole === 'admin' || userRole === 'superadmin',
    isSuperAdmin: userRole === 'superadmin'
  };
} 