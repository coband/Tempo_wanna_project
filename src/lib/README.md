# Supabase-Integration mit Clerk

## Übersicht

Wir haben den Supabase-Client zentral in einem Provider eingerichtet und die Authentifizierung mit Clerk über die offizielle `accessToken()`-Option integriert. Dies bietet folgende Vorteile:

- Eine zentrale GoTrue-Instanz im gesamten Projekt
- Verhindert Warnungen und Probleme mit multiplen Instanzen
- Entspricht der offiziellen Integrationsempfehlung von Clerk & Supabase

## Implementierungsdetails

```tsx
// SupabaseProvider.tsx
import { createContext, useContext, useMemo, ReactNode } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { useSession } from '@clerk/clerk-react';
import type { Database } from '@/types/supabase';

// ...

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();

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
        realtime: { params: { eventsPerSecond: 10 } },
      }
    ), 
    [session?.id]
  );

  // ...
}
```

## Verwendung

Es gibt zwei Hauptwege, um Supabase in deinen Komponenten zu verwenden:

### 1. Empfohlener Weg: `useSupabase` Hook

```tsx
import { useSupabase } from '@/contexts/SupabaseContext';

function MeineKomponente() {
  const supabase = useSupabase();

  // Verwende supabase für authentifizierte Anfragen
  async function ladePrivateDaten() {
    const { data, error } = await supabase.from('tabelle').select('*');
    // ...
  }

  // Verwende publicClient für öffentliche Anfragen
  async function ladeÖffentlicheDaten() {
    const { data, error } = await supabase.from('öffentliche_tabelle').select('*');
    // ...
  }

  return (/* ... */);
}
```

### 2. Rückwärtskompatibilität: `useSupabaseAuth` Hook

Für bestehenden Code, der `useSupabaseAuth` verwendet, bleibt alles gleich:

```tsx
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';

function MeineKomponente() {
  const { supabase, publicClient, handleRequest } = useSupabaseAuth();
  
  // Verwendung bleibt identisch wie zuvor
  // ...
}
```

### 3. Für nicht-authentifizierte Anfragen

Wenn du nur den öffentlichen Client ohne Benutzerkontext benötigst:

```tsx
import { supabase } from '@/lib/supabase';

function ÖffentlicheKomponente() {
  // Verwendung für nicht-authentifizierte Anfragen
  async function ladeÖffentlicheDaten() {
    const { data, error } = await supabase.from('öffentliche_tabelle').select('*');
    // ...
  }
}
```

## Vorteile

- **Offizielle Integration**: Verwendet die von Supabase und Clerk empfohlene `accessToken()`-Methode
- **Reduzierte Komplexität**: Eine zentrale GoTrue-Instanz
- **Bessere Performance**: Weniger Client-Instanzen und Token-Management
- **Standardisierung**: Einheitlicher Zugriff im gesamten Projekt
- **Einfacheres Testing**: Leichter zu mocken und zu testen

## Migration

Vorhandener Code, der `useSupabaseAuth` verwendet, muss nicht geändert werden, da wir die Rückwärtskompatibilität gewährleisten. 