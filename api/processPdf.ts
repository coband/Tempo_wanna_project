import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI, createPartFromUri } from '@google/genai';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { createClerkClient } from '@clerk/backend';

// -----------------------------------------------------------------------------
//  ENV‑SETUP
// -----------------------------------------------------------------------------
//  Lädt .env-Datei bei lokaler Entwicklung → in Vercel Production kommen die
//  Variablen aus dem Dashboard.
// -----------------------------------------------------------------------------

dotenv.config();

// -----------------------------------------------------------------------------
//  ENV‑VALIDIERUNG (minimal). Für ein großes Projekt empfiehlt sich zod.
// -----------------------------------------------------------------------------

function assertEnv(name: string) {
  if (!process.env[name]) throw new Error(`Environment variable ${name} missing`);
  return process.env[name]!;
}

assertEnv('SUPABASE_URL');
assertEnv('SUPABASE_SERVICE_ROLE_KEY');
assertEnv('GEMINI_API_KEY');
assertEnv('CF_ACCOUNT_ID');
assertEnv('CF_R2_ACCESS_KEY_ID');
assertEnv('CF_R2_SECRET_ACCESS_KEY');
assertEnv('CLERK_SECRET_KEY');
assertEnv('VITE_CLERK_PUBLISHABLE_KEY');

// -----------------------------------------------------------------------------
//  CONFIG
// -----------------------------------------------------------------------------

const SUPABASE_URL           = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET_NAME_SUPABASE   = process.env.PDF_BUCKET_NAME   || 'books';

const R2_BUCKET_NAME         = process.env.R2_BUCKET_NAME    || 'books';
const R2_ACCOUNT_ID          = process.env.CF_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID       = process.env.CF_R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY   = process.env.CF_R2_SECRET_ACCESS_KEY!;
const MODEL_NAME             = 'gemini-2.5-flash-preview-04-17'; // Aktuelles Modell verwenden

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://your‑frontend.com',
  'https://www.wanna-books.ch',
  'https://wanna-books.ch',
  'https://tempo-wanna-project.vercel.app',
  'https://tempo-wanna-project-cornelbandli.vercel.app'
];

// Maximum size for initial text extraction from PDF (5 MB)
const MAX_INITIAL_CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB

// Maximum PDF size that we'll process (200 MB)
// Dies ist eine Sicherheitsgrenze für sehr große PDFs
const MAX_PROCESSABLE_PDF_SIZE = 200 * 1024 * 1024; // 200 MB

// Metadaten-Caching aktivieren (spart HEAD-Requests)
const ENABLE_METADATA_CACHING = true; // Leichtgewichtiges Caching für Metadaten (ETag, Größe)

// -----------------------------------------------------------------------------
//  CACHING
// -----------------------------------------------------------------------------
// Modul-level Map für PDF-Metadaten-Caching
// Key: Pfad, Value: Metadaten
interface PdfMetadata {
  etag: string | null;
  size: number | null;
  lastAccessed: number;
}

// Leichtgewichtiger Cache für Metadaten (kleiner Memory-Footprint)
const metadataCache = new Map<string, PdfMetadata>();

// Cache-Maintenance: Entferne alte Einträge (älter als 30 Minuten)
const cleanupCache = () => {
  const now = Date.now();
  const MAX_AGE = 30 * 60 * 1000; // 30 Minuten (statt 10)
  
  // Metadaten-Cache aufräumen
  for (const [key, metadata] of metadataCache.entries()) {
    if (now - metadata.lastAccessed > MAX_AGE) {
      metadataCache.delete(key);
    }
  }
};

// Regelmäßige Cache-Bereinigung
setInterval(cleanupCache, 15 * 60 * 1000); // Alle 15 Minuten (statt 5)

// -----------------------------------------------------------------------------
//  CLIENTS
// -----------------------------------------------------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  }
});

// Clerk Client für die Authentifizierung
const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
  publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY!,
});

// -----------------------------------------------------------------------------
//  HELPERS
// -----------------------------------------------------------------------------

function respondCors(req: VercelRequest, res: VercelResponse, status = 200) {
  const origin = req.headers.origin as string | undefined;
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.status(status);
}

// -----------------------------------------------------------------------------
//  CORE LOGIC
// -----------------------------------------------------------------------------

async function getObjectETag(key: string): Promise<string | null> {
  // Versuche, den ETag aus dem Metadaten-Cache zu holen
  if (ENABLE_METADATA_CACHING && metadataCache.has(key)) {
    const metadata = metadataCache.get(key)!;
    metadata.lastAccessed = Date.now(); // Aktualisiere Zeitstempel
    return metadata.etag;
  }
  
  try {
    const response = await r2Client.send(
      new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key })
    );
    
    const etag = response.ETag || null;
    const size = response.ContentLength || null;
    
    // Speichere Metadaten im Cache
    if (ENABLE_METADATA_CACHING) {
      metadataCache.set(key, {
        etag,
        size,
        lastAccessed: Date.now()
      });
    }
    
    return etag;
  } catch (error) {
    console.error(`Fehler beim Abrufen des ETag: ${error}`);
    return null;
  }
}

async function getObjectSize(key: string): Promise<number | null> {
  // Versuche, die Größe aus dem Metadaten-Cache zu holen
  if (ENABLE_METADATA_CACHING && metadataCache.has(key)) {
    const metadata = metadataCache.get(key)!;
    metadata.lastAccessed = Date.now(); // Aktualisiere Zeitstempel
    return metadata.size;
  }
  
  try {
    const response = await r2Client.send(
      new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key })
    );
    
    const size = response.ContentLength || null;
    const etag = response.ETag || null;
    
    // Speichere Metadaten im Cache
    if (ENABLE_METADATA_CACHING) {
      metadataCache.set(key, {
        etag,
        size,
        lastAccessed: Date.now()
      });
    }
    
    return size;
  } catch (error) {
    console.error(`Fehler beim Abrufen der Dateigröße: ${error}`);
    return null;
  }
}

async function fetchPdfFromR2(key: string, etag: string | null): Promise<Buffer> {
  // Prüfe die Größe des PDFs (oder verwende bereits gecachte Metadaten)
  const fileSize = await getObjectSize(key);
  
  // Sicherheitscheck: Wenn das PDF zu groß ist, verweigere die Verarbeitung
  if (fileSize && fileSize > MAX_PROCESSABLE_PDF_SIZE) {
    throw new Error(`Die PDF-Datei ist zu groß für die Verarbeitung (${(fileSize / (1024 * 1024)).toFixed(2)} MB). Das Limit liegt bei ${MAX_PROCESSABLE_PDF_SIZE / (1024 * 1024)} MB.`);
  }
  
  // Immer die vollständige Datei laden, für vollständige Analyse
  try {
    const { Body } = await r2Client.send(
      new GetObjectCommand({ 
        Bucket: R2_BUCKET_NAME, 
        Key: key
      })
    );
    
    const stream = Body as unknown as Readable;
    
    // Verwenden eines Arrays zur Sammlung von Chunks, um den Speicherverbrauch zu optimieren
    const chunks: Buffer[] = [];
    let totalSize = 0;
    
    for await (const chunk of stream) {
      const bufferChunk = chunk as Buffer;
      chunks.push(bufferChunk);
      totalSize += bufferChunk.length;
    }
    
    return Buffer.concat(chunks);
  } catch (error) {
    console.error(`Fehler beim Herunterladen der PDF-Datei: ${error instanceof Error ? error.message : String(error)}`);
    throw new Error(`Fehler beim Herunterladen der PDF-Datei: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function createPresignedUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key
  });
  
  // 1 Stunde gültigkeit
  return await getSignedUrl(r2Client, command, { expiresIn: 3600 });
}

async function processPdf(pdfPath: string, question: string): Promise<string> {
  try {
    // 1. Zuerst den ETag der Datei holen (günstige Operation)
    const etag = await getObjectETag(pdfPath);
    
    // Prüfe die Größe des PDFs
    const fileSize = await getObjectSize(pdfPath);
    
    if (fileSize && fileSize > MAX_PROCESSABLE_PDF_SIZE) {
      throw new Error(`Die PDF-Datei ist zu groß für die Verarbeitung (${(fileSize / (1024 * 1024)).toFixed(2)} MB). Das Limit liegt bei ${MAX_PROCESSABLE_PDF_SIZE / (1024 * 1024)} MB.`);
    }
    
    // Traditionelle Methode: PDF herunterladen und manuell verarbeiten
    try {
      // Immer das vollständige PDF laden für die Analyse
      const pdfBuffer = await fetchPdfFromR2(pdfPath, etag);

      // Tmp write (Workers KV / pipeline optional)
      const tmpDir = path.join('/tmp', 'r2‑pdf');
      await fs.mkdir(tmpDir, { recursive: true });
      const tmpFile = path.join(tmpDir, `${Date.now()}.pdf`);
      await fs.writeFile(tmpFile, pdfBuffer);

      try {
        // In einen Blob konvertieren für die Gemini API
        const fileContent = await fs.readFile(tmpFile);
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
        
        // Sofort die temporäre Datei löschen, da sie nicht mehr benötigt wird
        try {
          await fs.unlink(tmpFile);
        } catch (cleanupError) {
          console.error(`Warnung: Konnte temporäre Datei nicht frühzeitig löschen: ${cleanupError}`);
        }
        
        // Auf Verarbeitung warten
        let getFile = await genAI.files.get({ name: fileName });
        let attempts = 0;
        const maxAttempts = 15; // Mehr Versuche für große PDFs
        
        while (getFile.state === 'PROCESSING' && attempts < maxAttempts) {
          // Warten und erneut prüfen
          await new Promise((resolve) => setTimeout(resolve, 2000));
          getFile = await genAI.files.get({ name: fileName });
          attempts++;
        }
        
        if (getFile.state === 'FAILED') {
          throw new Error(`Dateiverarbeitung durch die Google Gemini API fehlgeschlagen. Status: ${getFile.state}, Reason: ${getFile.error || 'Unknown'}`);
        }
        
        if (attempts >= maxAttempts && getFile.state === 'PROCESSING') {
          throw new Error('Zeitüberschreitung bei der Dateiverarbeitung durch die Google Gemini API');
        }
        
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
        try {
          const response = await genAI.models.generateContent({
            model: MODEL_NAME,
            contents: content,
          });
          
          // Antwort extrahieren
          const responseText = response.text || "Keine Antwort erhalten";
          
          // Datei aus der Google File API löschen, um Speicherplatz freizugeben
          try {
            await genAI.files.delete({ name: fileName });
          } catch (deleteError) {
            console.error(`Warnung: Konnte Datei ${fileName} nicht aus der Google File API löschen: ${deleteError}`);
            // Fehler beim Löschen sollte den Prozess nicht unterbrechen
          }
          
          return responseText;
        } catch (genAiError: any) {
          console.error(`Fehler bei Gemini-Generierung: ${genAiError}`);
          
          // Bei bestimmten Fehlern von Gemini (PDF zu groß oder andere Probleme)
          // können wir das PDF nicht verarbeiten
          if (String(genAiError).includes('File size too large') || 
              String(genAiError).includes('exceeds maximum size')) {
            throw new Error(`Die PDF-Datei ist zu groß für die Verarbeitung durch Gemini (${fileSize ? (fileSize / (1024 * 1024)).toFixed(2) + ' MB' : 'unbekannte Größe'}). Bitte verwenden Sie eine kleinere Datei oder teilen Sie die Datei in mehrere Teile auf.`);
          }
          
          throw genAiError;
        }
        
      } catch (error: any) {
        console.error(`Fehler bei Gemini-Verarbeitung: ${error.message}`);
        throw new Error(`Fehler bei der Gemini-Verarbeitung: ${error.message}`);
      } finally {
        // Cleanup - nur noch als Backup, falls die frühzeitige Löschung fehlgeschlagen ist
        try {
          // Prüfen, ob die Datei noch existiert, bevor wir versuchen sie zu löschen
          const fileExists = await fs.access(tmpFile).then(() => true).catch(() => false);
          if (fileExists) {
            await fs.unlink(tmpFile);
          }
        } catch (cleanupError) {
          console.error(`Warnung: Konnte temporäre Datei nicht löschen: ${cleanupError}`);
        }
      }
    } catch (fetchError: any) {
      console.error(`Fehler beim Abrufen des PDF: ${fetchError.message}`);
      throw new Error(`Fehler beim Abrufen des PDF: ${fetchError.message}`);
    }
  } catch (error: any) {
    console.error(`Fehler bei PDF-Verarbeitung: ${error.message}`);
    throw error; // Weitergabe des Fehlers an den Haupthandler
  }
}

// -----------------------------------------------------------------------------
//  HANDLER
// -----------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Early CORS
  if (req.method === 'OPTIONS') {
    respondCors(req, res, 204);
    return res.end();
  }

  if (req.method !== 'POST') {
    respondCors(req, res, 405);
    return res.json({ error: 'Method not allowed' });
  }

  /* ---------- Clerk Auth ---------- */
  try {
    // Prüfen ob ein Bearer-Token vorhanden ist
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Bearer-Token aus dem Header extrahieren
      const token = authHeader.substring(7); // "Bearer " entfernen
      
      // Versuche den Token zu validieren
      try {
        // Prüfe den JWT direkt mit Clerk
        // Da Clerk keine direkte verifyJwt-Methode hat, erstellen wir eine minimale Request zur Auth
        const dummyRequest = new Request("https://api.example.com", {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        
        // Mit mehreren authorizedParties versuchen
        // Dadurch kann der Token von verschiedenen Domains akzeptiert werden
        const authOptions = {
          authorizedParties: [
            ...ALLOWED_ORIGINS,
            "https://api.example.com",
            "http://localhost:3000", 
            "http://127.0.0.1:3000",
            "https://www.wanna-books.ch",
            "https://wanna-books.ch",
            "https://tempo-wanna-project.vercel.app",
            "https://tempo-wanna-project-cornelbandli.vercel.app"
          ]
        };
        
        const authResult = await clerk.authenticateRequest(dummyRequest, authOptions);
        
        if (!authResult.isSignedIn) {
          respondCors(req, res, 401);
          return res.json({ error: "Unauthorized" });
        }
      } catch (tokenError) {
        // Token-Validierung fehlgeschlagen - Zugriff verweigern
        respondCors(req, res, 401);
        return res.json({ error: "Invalid token" });
      }
    } else {
      // Cookie-basierte Authentifizierung als Fallback
      const absoluteUrl = `${req.headers["x-forwarded-proto"] ?? "http"}://${req.headers.host}${req.url}`;
      const fetchRequest = new Request(absoluteUrl, {
        method: req.method,
        headers: req.headers as any,
      });

      const { isSignedIn } = await clerk.authenticateRequest(fetchRequest, {
        authorizedParties: ALLOWED_ORIGINS,
      });

      if (!isSignedIn) {
        respondCors(req, res, 401);
        return res.json({ error: "Unauthorized" });
      }
    }
  } catch (authError) {
    respondCors(req, res, 401);
    return res.json({ error: "Unauthorized" });
  }

  try {
    // Body parsen und validieren
    let pdfPath, question;
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      pdfPath = body.pdfPath;
      question = body.question;
    } catch (e) {
      console.error(`Fehler beim Parsen des Request Body: ${req.body}`);
      throw new Error('Ungültiger Request Body');
    }

    if (!pdfPath || !question) throw new Error('pdfPath und question erforderlich');

    const answer = await processPdf(pdfPath, question);
    
    respondCors(req, res, 200);
    return res.json({ answer });
  } catch (err: any) {
    console.error(`Handler Error: ${err.message}`);
    
    respondCors(req, res, 500);
    return res.json({ error: err.message || 'Unerwarteter Fehler' });
  }
}
