import { useState, useEffect } from 'react';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';

/**
 * Hook für die Integration von Clerk mit Supabase
 * Stellt das JWT-Token für die Supabase-Authentifizierung zur Verfügung
 */
export function useAuth() {
  const { getToken, isLoaded, isSignedIn } = useClerkAuth();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchToken() {
      try {
        setLoading(true);
        if (isLoaded && isSignedIn) {
          // Template für Supabase-JWT anfordern
          const jwt = await getToken({ template: 'supabase' });
          setToken(jwt);
        } else {
          setToken(null);
        }
      } catch (error) {
        console.error('Fehler beim Abrufen des JWT-Tokens:', error);
        setToken(null);
      } finally {
        setLoading(false);
      }
    }

    fetchToken();
  }, [getToken, isLoaded, isSignedIn]);

  return { token, loading, isAuthenticated: !!token };
} 