/**
 * Gemeinsame CORS-Konfiguration für alle Edge-Funktionen
 * 
 * Diese Datei enthält eine flexible CORS-Einrichtung, die sowohl
 * lokale Entwicklung als auch Produktion unterstützt.
 */

// Array der erlaubten Origins (Domains)
const ALLOWED_ORIGINS = [
  // Lokale Entwicklungsumgebungen
  "http://localhost:5173",  // Vite Standard
  "http://localhost:3000",  // Alternative lokale Ports
  "http://localhost:8000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  
  // Produktionsdomains
  // Füge deine Vercel-Domain hier hinzu, sobald bereitgestellt:
  // "https://deine-app.vercel.app"
];

// Hilfsfunktion zur Überprüfung, ob ein Origin erlaubt ist
const isAllowedOrigin = (origin: string | null): boolean => {
  // Wenn kein Origin-Header vorhanden ist
  if (!origin) return false;
  
  // Prüfe, ob der Origin in der erlaubten Liste ist
  return ALLOWED_ORIGINS.includes(origin);
};

// Dynamischer CORS-Header-Generator
export const getCorsHeaders = (req: Request): HeadersInit => {
  const origin = req.headers.get("Origin");
  
  // Standard-CORS-Header
  const headers: HeadersInit = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin"
  };
  
  // Setze den Origin-Header nur, wenn der angeforderte Origin erlaubt ist
  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else {
    // Wenn kein Origin angegeben oder nicht erlaubt, verwende den ersten erlaubten Origin
    // als Fallback, was die Anfrage für nicht-erlaubte Origins blockiert
    headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGINS[0];
  }
  
  return headers;
};

// CORS-Präflug-Anfrage-Handler
export const handleCorsPreflightRequest = (req: Request): Response | null => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(req)
    });
  }
  return null;
}; 