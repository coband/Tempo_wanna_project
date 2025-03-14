# Supabase Edge Functions

Dieses Verzeichnis enthält die Edge-Funktionen für das Projekt. Diese Funktionen werden direkt von Supabase gehostet und sind über HTTPS-Endpunkte erreichbar.

## CORS-Konfiguration

Alle Edge-Funktionen verwenden die gemeinsame CORS-Konfiguration aus `cors.ts`. Diese Datei verwaltet:

- Welche Domains/Origins auf die API zugreifen dürfen
- Wie HTTP-Methoden und -Header behandelt werden
- Wie CORS-Präflug-Anfragen (OPTIONS) verarbeitet werden

### Lokale Entwicklung

Standardmäßig sind für die lokale Entwicklung folgende Origins erlaubt:
- http://localhost:5173 (Vite Standard)
- http://localhost:3000
- http://localhost:8000 
- http://127.0.0.1:5173
- http://127.0.0.1:3000

### Konfiguration für Produktion auf Vercel

Wenn du die Anwendung auf Vercel bereitstellst, musst du folgende Änderungen in `cors.ts` vornehmen:

1. Füge deine Vercel-Domain zur Liste der erlaubten Origins hinzu:

```typescript
const ALLOWED_ORIGINS = [
  // Lokale Entwicklungsumgebungen
  "http://localhost:5173", 
  // ...
  
  // Produktionsdomains
  "https://deine-app.vercel.app",
  "https://deine-custom-domain.de"
];
```

2. Optional: Setze die Umgebungsvariable `ENVIRONMENT` auf `production` in deiner Supabase-Projektkonsole unter "Edge Functions" → "Settings", um sicherzustellen, dass CORS-Anfragen strikt geprüft werden.

### Umgebungsvariablen in Supabase

Du musst folgende Umgebungsvariablen in der Supabase-Konsole einrichten:

- `ENVIRONMENT`: `development` für Entwicklung oder `production` für Produktion
- `ALLOWED_ORIGINS`: (Optional) Eine durch Kommas getrennte Liste erlaubter Origins

Setze diese in der Supabase-Konsole unter "Settings" → "API" → "Edge Functions".

## Verwendung in deinen Edge-Funktionen

Alle Edge-Funktionen wurden bereits aktualisiert, um die zentrale CORS-Konfiguration zu verwenden. Wenn du eine neue Funktion erstellst, importiere und verwende die CORS-Hilfsfunktionen wie folgt:

```typescript
import { getCorsHeaders, handleCorsPreflightRequest } from "../cors.ts";

serve(async (req) => {
  // CORS-Präflug-Anfrage behandeln
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  // Deine Funktionslogik hier...

  // Bei Antworten
  return new Response(JSON.stringify(data), {
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" }
  });
});
```

## Testen

Um zu überprüfen, ob deine CORS-Konfiguration korrekt funktioniert:

1. Starte deine lokale Entwicklungsumgebung
2. Führe eine Anfrage an eine Edge-Funktion durch
3. Prüfe, ob der `Access-Control-Allow-Origin`-Header korrekt gesetzt ist 