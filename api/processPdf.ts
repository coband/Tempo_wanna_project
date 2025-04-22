import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI, createPartFromUri } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// Lade Umgebungsvariablen aus .env-Datei
dotenv.config();

// Debugging: Umgebungsvariablen überprüfen (ohne sensible Daten vollständig anzuzeigen)
console.log('Umgebungsvariablen geladen:');
console.log('SUPABASE_URL vorhanden:', !!process.env.SUPABASE_URL);
console.log('SUPABASE_SERVICE_ROLE_KEY vorhanden:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log('GEMINI_API_KEY vorhanden:', !!process.env.GEMINI_API_KEY);
console.log('PDF_BUCKET_NAME:', process.env.PDF_BUCKET_NAME || 'books');

// --- Konfiguration ---
const BUCKET_NAME = process.env.PDF_BUCKET_NAME || 'books';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const MODEL_NAME = 'gemini-2.5-flash-preview-04-17'; // Aktuelles Modell verwenden

// Initialisierung von Clients
let supabase: SupabaseClient | null = null;
let genAI: GoogleGenAI | null = null;

if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('Supabase-Client initialisiert');
} else {
  console.error('Supabase-Konfiguration fehlt:', {
    urlVorhanden: !!SUPABASE_URL,
    keyVorhanden: !!SUPABASE_KEY
  });
}

if (GEMINI_API_KEY) {
  genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  console.log('Gemini-API-Client initialisiert');
} else {
  console.error('Gemini API-Schlüssel fehlt');
}

// CORS-Header Einstellungen
function getCorsHeaders(req: VercelRequest): Record<string, string> {
  // Liste der erlaubten Origins
  const ALLOWED_ORIGINS = [
    // Lokale Entwicklungsumgebungen
    "http://localhost:5173",  // Vite Standard
    "http://localhost:3000",  // Alternative lokale Ports
    "http://localhost:8000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    
    // Produktionsdomains
    "https://tempo-wanna-project-6xlvwe4km-cobands-projects.vercel.app",
    "https://www.wanna-books.ch"
  ];

  const origin = req.headers.origin as string | undefined;
  
  // Standard-CORS-Header
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin'
  };
  
  // Setze den Origin-Header nur, wenn der angeforderte Origin erlaubt ist
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else {
    // Wenn kein Origin angegeben oder nicht erlaubt, verwende den ersten erlaubten Origin
    headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGINS[0];
  }

  return headers;
}

// Hilfsfunktion zur Behandlung von CORS-Preflight-Anfragen
function handleCorsPreflightRequest(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method === 'OPTIONS') {
    const corsHeaders = getCorsHeaders(req);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.status(204).end();
    return true;
  }
  return false;
}

// Logging-Funktion mit Zeitstempel
function logWithTimestamp(message: string, data?: any): void {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] ${message}`, data);
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
}

// Validieren der Authentifizierung
async function validateAuth(req: VercelRequest): Promise<{ valid: boolean; userId?: string; error?: string }> {
  // Auth-Header extrahieren
  const authHeader = req.headers.authorization || '';
  
  // Logging
  logWithTimestamp('Authorization Header vorhanden:', !!authHeader);
  
  // Sicherere Überprüfung, um undefined/null zu vermeiden
  if (!authHeader || typeof authHeader !== 'string') {
    return { valid: false, error: 'Kein Authorization Header gefunden' };
  }
  
  if (!authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Authorization Header muss mit "Bearer " beginnen' };
  }

  const token = authHeader.substring(7); // "Bearer " entfernen
  if (!token) {
    return { valid: false, error: 'Leeres Token' };
  }

  logWithTimestamp('Validiere Token...');

  try {
    // Service-Role-Key als Fallback prüfen
    if (token === SUPABASE_KEY) {
      logWithTimestamp('Autorisierung erfolgt via Service-Role-Key');
      return { valid: true, userId: 'service-role-admin' };
    }
    
    // Implementierung des nativen Ansatzes:
    // Anstatt zu versuchen, das Token direkt zu validieren, 
    // erstellen wir einen speziellen Supabase-Client, der das Token als Access-Token verwendet
    const authClient = createClient(SUPABASE_URL || '', SUPABASE_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });
    
    // Prüfen, ob der Client eine einfache Anfrage ausführen kann
    // Dies wird fehlschlagen, wenn das Token ungültig ist
    try {
      logWithTimestamp('Teste Zugriff mit dem Token...');
      // Versuche eine einfache Abfrage
      const { data, error } = await authClient.from('books').select('count').limit(1);
      
      if (error) {
        logWithTimestamp('Token-Validierung fehlgeschlagen:', error);
        return { valid: false, error: `Unerlaubter Zugriff: ${error.message}` };
      }
      
      // Token ist gültig, Zugriff gewährt
      logWithTimestamp('Token ist gültig, Zugriff gewährt');
      
      // Versuche, die User-ID aus dem JWT zu extrahieren (für Logging)
      try {
        const tokenParts = token.split('.');
        if (tokenParts.length === 3) {
          const payload = JSON.parse(atob(tokenParts[1]));
          const userId = payload.sub || payload.user_id || 'unbekannt';
          logWithTimestamp(`Benutzer-ID aus JWT: ${userId}`);
          return { valid: true, userId };
        }
      } catch (e) {
        // Fehler beim Dekodieren des Tokens ignorieren, da wir bereits wissen, dass der Zugriff gültig ist
      }
      
      return { valid: true, userId: 'authorized-user' };
    } catch (error: any) {
      logWithTimestamp('Fehler bei der Zugriffsüberprüfung:', error?.message || error);
      return { valid: false, error: `Zugriffsüberprüfung fehlgeschlagen: ${error?.message || 'Unbekannter Fehler'}` };
    }
  } catch (error: any) {
    logWithTimestamp('Fehler bei der Authentifizierung:', error?.message || error);
    return { valid: false, error: `Authentifizierungsfehler: ${error?.message || 'Unbekannter Fehler'}` };
  }
}

/**
 * Verarbeitet eine PDF-Datei und beantwortet eine Frage dazu mit der Gemini-API
 * @param pdfPath Pfad zur PDF-Datei im Supabase-Bucket
 * @param question Die Frage, die zu dieser PDF beantwortet werden soll
 * @returns Ein Promise, das die Antwort der Gemini-API enthält
 */
export async function processPdf(pdfPath: string, question: string): Promise<string> {
  if (!supabase || !genAI) {
    throw new Error('API-Clients nicht initialisiert');
  }

  if (!pdfPath || !question) {
    throw new Error('PDF-Pfad und Frage müssen angegeben werden');
  }

  logWithTimestamp(`Verarbeite PDF: ${pdfPath} mit Frage: ${question}`);

  // PDF von Supabase herunterladen
  const tempDir = path.join('/tmp', 'tempo-pdf-processing');
  await fs.mkdir(tempDir, { recursive: true });
  const tempFilePath = path.join(tempDir, `temp-${Date.now()}.pdf`);

  try {
    // PDF von Supabase herunterladen
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(pdfPath);

    if (error || !data) {
      throw new Error(`Fehler beim Herunterladen der PDF: ${error?.message || 'Keine Daten'}`);
    }

    // PDF als temporäre Datei speichern
    const buffer = await data.arrayBuffer();
    await fs.writeFile(tempFilePath, Buffer.from(buffer));
    logWithTimestamp(`PDF heruntergeladen und gespeichert in: ${tempFilePath}`);
    
    // PDF-Größe prüfen
    const stats = await fs.stat(tempFilePath);
    const fileSizeInMB = stats.size / (1024 * 1024);
    logWithTimestamp(`PDF-Größe: ${fileSizeInMB.toFixed(2)} MB`);

    // PDF verarbeiten mit neuester Gemini API
    logWithTimestamp('Verarbeite PDF mit Google Gemini API...');
    
    // In einen Blob konvertieren für die File API
    const fileContent = await fs.readFile(tempFilePath);
    const fileBlob = new Blob([fileContent], { type: 'application/pdf' });
    
    // PDF-Datei hochladen
    const file = await genAI.files.upload({
      file: fileBlob,
      config: {
        displayName: path.basename(pdfPath),
      },
    });
    
    // Sicherstellen, dass file.name definiert ist
    const fileName = file.name || `unknown-file-${Date.now()}`;
    logWithTimestamp(`PDF hochgeladen zur Gemini API mit FileID: ${fileName}`);
    
    // Auf Verarbeitung warten
    let getFile = await genAI.files.get({ name: fileName });
    let attempts = 0;
    const maxAttempts = 10;
    
    while (getFile.state === 'PROCESSING' && attempts < maxAttempts) {
      logWithTimestamp(`Aktueller Datei-Status: ${getFile.state}`);
      logWithTimestamp('Datei wird noch verarbeitet, erneuter Versuch in 2 Sekunden...');
      
      // Warten und erneut prüfen
      await new Promise((resolve) => setTimeout(resolve, 2000));
      getFile = await genAI.files.get({ name: fileName });
      attempts++;
    }
    
    if (getFile.state === 'FAILED') {
      throw new Error('Dateiverarbeitung durch die Google Gemini API fehlgeschlagen');
    }
    
    if (attempts >= maxAttempts && getFile.state === 'PROCESSING') {
      throw new Error('Zeitüberschreitung bei der Dateiverarbeitung durch die Google Gemini API');
    }
    
    // Frage stellen
    logWithTimestamp(`Stelle Frage: ${question}`);
    
    // Inhalt für die Anfrage vorbereiten
    const content: Array<{text: string} | ReturnType<typeof createPartFromUri>> = [
      { text: `Ich habe eine Frage zu diesem PDF: ${question}` }
    ];
    
    // Füge die Datei zum Inhalt hinzu
    if (file.uri && file.mimeType) {
      const fileContent = createPartFromUri(file.uri, file.mimeType);
      content.push(fileContent);
    }
    
    // Anfrage an die Gemini API senden
    const response = await genAI.models.generateContent({
      model: MODEL_NAME,
      contents: content,
    });
    
    // Antwort extrahieren
    const responseText = response.text || "Keine Antwort erhalten";
    
    // Aufräumen: Temporäre Datei löschen
    try {
      await fs.unlink(tempFilePath);
      logWithTimestamp('Temporäre PDF-Datei nach Verarbeitung gelöscht');
    } catch (cleanupError) {
      console.error('Fehler beim Löschen der temporären Datei:', cleanupError);
    }
    
    return responseText;
  } catch (error: any) {
    logWithTimestamp('Fehler bei der PDF-Verarbeitung', error);
    
    // Aufräumen, falls die Datei erstellt wurde
    try {
      await fs.access(tempFilePath);
      await fs.unlink(tempFilePath);
      logWithTimestamp('Temporäre PDF-Datei nach Fehler gelöscht');
    } catch (e) {
      // Datei existiert nicht oder kann nicht gelöscht werden, ignorieren
    }
    
    throw error;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS-Präflight-Anfrage
  if (handleCorsPreflightRequest(req, res)) return;
  
  // CORS-Headers setzen
  const corsHeaders = getCorsHeaders(req);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Nur POST-Methode erlauben
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Nur POST-Methode erlaubt' });
    return;
  }

  // API-Clients prüfen
  if (!supabase || !genAI) {
    res.status(500).json({
      error: 'Serverfehler: API-Clients nicht initialisiert',
      details: {
        supabaseInitialized: !!supabase,
        genAIInitialized: !!genAI
      }
    });
    return;
  }

  // Authentifizierung prüfen
  const isLocalDevelopment = process.env.NODE_ENV === 'development';
  let userId = 'default-user';
  const authResult = await validateAuth(req);
  
  if (!authResult.valid) {
    // Im Entwicklungsmodus trotzdem fortfahren
    if (!isLocalDevelopment) {
      return res.status(401).json({ 
        error: 'Nicht autorisiert', 
        details: authResult.error,
        message: 'Bitte stellen Sie sicher, dass ein gültiges Authentifizierungstoken verwendet wird.'
      });
    } else {
      console.log('⚠️ Entwicklungsmodus: Fortfahren trotz fehlgeschlagener Authentifizierung');
    }
  } else {
    userId = authResult.userId || userId;
  }

  try {
    // Daten aus dem Request-Body extrahieren
    const { pdfPath, question } = req.body;

    if (!pdfPath || !question) {
      return res.status(400).json({ error: 'pdfPath und question sind erforderlich' });
    }

    // Verarbeite die PDF und die Frage
    const answer = await processPdf(pdfPath, question);
    
    // Ergebnisse zurückgeben
    return res.status(200).json({ answer });
  } catch (error: any) {
    console.error('Fehler bei der PDF-Verarbeitung:', error);
    
    res.status(500).json({
      error: 'Fehler bei der PDF-Verarbeitung',
      message: error.message || 'Unbekannter Fehler',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

