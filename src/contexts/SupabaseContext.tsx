import { createContext, useContext, useMemo, ReactNode } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { useSession } from '@clerk/clerk-react';
import type { Database } from '@/types/supabase';

type SupabaseContextType = {
  supabase: SupabaseClient<Database>;
};

const SupabaseContext = createContext<SupabaseContextType | undefined>(undefined);

// Supabase Konfiguration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

// Export für nicht-authentifizierte Zugriffe
export const publicClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

export function SupabaseProvider({ children }: { children: ReactNode }) {
  // Clerk-Session samt getToken()
  const { session } = useSession();

  // Erstellen des Supabase Clients mit der offiziellen accessToken-Methode
  // 1× Client pro Browser-Context
  const supabase = useMemo(() => 
    createClient<Database>(
      supabaseUrl,
      supabaseAnonKey,
      {
        // offizielle Methode zum Injizieren von Dritt-Tokens
        async accessToken() {
          // Clerk liefert das Supabase-kompatible JWT
          return session?.getToken({ template: 'supabase' }) ?? null;
        },
        realtime: { 
          params: { eventsPerSecond: 10 }
        },
      }
    ), 
    // Nur neu erstellen, wenn sich die Session ändert
    [session?.id]
  );

  return (
    <SupabaseContext.Provider value={{ supabase }}>
      {children}
    </SupabaseContext.Provider>
  );
}

export function useSupabase() {
  const context = useContext(SupabaseContext);
  
  if (context === undefined) {
    throw new Error('useSupabase muss innerhalb eines SupabaseProvider verwendet werden');
  }
  
  // Direkt den Supabase-Client zurückgeben für einfachere Nutzung
  return context.supabase;
} 