import { useCallback, useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { useSupabase, publicClient } from '@/contexts/SupabaseContext';
import { useAuth, useUser } from '@clerk/clerk-react';

// Für rückwärtskompatibilität exportieren wir den öffentlichen Client
export const supabase = publicClient;

/**
 * Rückwärtskompatibles Interface für den SupabaseAuth Hook
 * Verwendet intern den neuen zentralen SupabaseContext
 */
export function useSupabaseAuth() {
  const authClient = useSupabase();
  const { userId, isSignedIn } = useAuth();
  const { user } = useUser(); // Zugriff auf Clerk Benutzer für Metadaten
  
  // Admin-Status und Benutzerrolle aus Clerk Metadaten abrufen
  const role = useMemo(() => {
    if (!isSignedIn || !user) return null;
    
    // Benutzerrolle aus Clerk Public Metadata extrahieren
    return user.publicMetadata?.role as string || null;
  }, [isSignedIn, user]);

  // Adminstatus berechnen
  const isAdmin = role === 'admin' || role === 'superadmin';
  const isSuperAdmin = role === 'superadmin';

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

  // Für Rückwärtskompatibilität alle früheren Werte bereitstellen
  return { 
    supabase: authClient,             // Authentifizierter Client
    publicClient,                     // Nicht-authentifizierter Client für öffentliche Daten
    loading: !user,                   // Laden abgeschlossen, wenn Benutzer verfügbar ist
    error: null,                      // Vereinfacht, da Token-Handling nun in Supabase selbst
    handleRequest,
    isAuthenticated: isSignedIn,
    userId,
    userRole: role,
    isAdmin,
    isSuperAdmin
  };
} 