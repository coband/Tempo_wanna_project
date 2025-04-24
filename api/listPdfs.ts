import type { VercelRequest, VercelResponse } from "@vercel/node";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import { LRUCache } from "lru-cache";

dotenv.config();

/* -------------------------------------------------------------------------- */
/*  ENV‐CHECKS                                                                */
/* -------------------------------------------------------------------------- */
function assertEnv(name: string) {
  if (!process.env[name]) throw new Error(`Environment variable ${name} missing`);
  return process.env[name]!;
}

assertEnv("CF_ACCOUNT_ID");
assertEnv("CF_R2_ACCESS_KEY_ID");
assertEnv("CF_R2_SECRET_ACCESS_KEY");

const R2_BUCKET_NAME        = process.env.R2_BUCKET_NAME || "books";
const R2_ACCOUNT_ID         = process.env.CF_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID      = process.env.CF_R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY  = process.env.CF_R2_SECRET_ACCESS_KEY!;

/* -------------------------------------------------------------------------- */
/*  R2 CLIENT                                                                 */
/* -------------------------------------------------------------------------- */
const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/* -------------------------------------------------------------------------- */
/*  LRU-CACHE SETUP (15 min)                                                  */
/* -------------------------------------------------------------------------- */
type CacheKey = string; // Prefix-basierter Cacheschlüssel
type CacheValue = { files: any[], fetchedAt: number };

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 Minuten TTL (vorher 5 Minuten)

const cache = new LRUCache<CacheKey, CacheValue>({
  max: 50, // Maximal 50 verschiedene Prefix-Kombinationen
  ttl: CACHE_TTL_MS,
});

/* -------------------------------------------------------------------------- */
/*  CORS HELPER                                                               */
/* -------------------------------------------------------------------------- */
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://your-frontend.com",
];

function respondCors(req: VercelRequest, res: VercelResponse, status = 200) {
  const origin = req.headers.origin as string | undefined;
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Vary", "Origin");
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.status(status);
}

/* -------------------------------------------------------------------------- */
/*  HANDLER                                                                   */
/* -------------------------------------------------------------------------- */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Generiere eine eindeutige Request-ID
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  
  // Anfrage detailliert loggen mit auffälligem Präfix für die Anfragemethode
  console.log(`\n[PDF-API][${req.method}][${requestId}] ========== NEUE ANFRAGE (${req.method}) ==========`);
  console.log(`[PDF-API][${req.method}][${requestId}] Zeitstempel: ${new Date().toISOString()}`);
  console.log(`[PDF-API][${req.method}][${requestId}] URL: ${req.url}`);
  console.log(`[PDF-API][${req.method}][${requestId}] Herkunft: ${req.headers.origin || 'Unbekannt'}`);
  console.log(`[PDF-API][${req.method}][${requestId}] User-Agent: ${req.headers['user-agent'] || 'Unbekannt'}`);
  console.log(`[PDF-API][${req.method}][${requestId}] Referer: ${req.headers.referer || 'Unbekannt'}`);
  console.log(`[PDF-API][${req.method}][${requestId}] IP: ${req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unbekannt'}`);
  
  if (req.method === "OPTIONS") {
    console.log(`[PDF-API][OPTIONS][${requestId}] OPTIONS-Anfrage bearbeitet`);
    respondCors(req, res, 204);
    console.log(`[PDF-API][OPTIONS][${requestId}] ========== ANFRAGE BEENDET (OPTIONS) ==========\n`);
    return res.end();
  }
  if (req.method !== "GET") {
    console.log(`[PDF-API][${req.method}][${requestId}] Ungültige Methode: ${req.method}`);
    respondCors(req, res, 405);
    console.log(`[PDF-API][${req.method}][${requestId}] ========== ANFRAGE BEENDET (UNGÜLTIGE METHODE) ==========\n`);
    return res.json({ error: "Method not allowed" });
  }

  // Ab hier wissen wir, dass es eine GET-Anfrage ist
  console.log(`[PDF-API][GET][${requestId}] GET-Anfrage wird verarbeitet...`);

  // Extrahiere die optionalen Query-Parameter
  const prefix = typeof req.query.prefix === 'string' ? req.query.prefix : 
                (typeof req.query.path === 'string' ? req.query.path : '');
  
  console.log(`[PDF-API][GET][${requestId}] Angeforderte Prefix/Path: "${prefix || 'root'}"`);
  
  // Erzeuge einen Cache-Schlüssel basierend auf dem Prefix
  const cacheKey = `pdfs:${prefix}`;
  
  // Versuche, aus dem Cache zu lesen
  const cachedData = cache.get(cacheKey);
  
  if (cachedData) {
    console.log(`[PDF-API][GET][${requestId}] CACHE-HIT! Daten aus Cache (${cachedData.files.length} Dateien)`);
    console.log(`[PDF-API][GET][${requestId}] Cache-Alter: ${(Date.now() - cachedData.fetchedAt) / 1000} Sekunden`);
    respondCors(req, res);
    // Setze explizite Cache-Control-Header
    res.setHeader("Cache-Control", "public, max-age=300");
    console.log(`[PDF-API][GET][${requestId}] ========== ANFRAGE BEENDET (CACHE) ==========\n`);
    return res.json({ files: cachedData.files });
  }

  /* ---------- Frischer Abruf ---------- */
  try {
    console.log(`[PDF-API][GET][${requestId}] CACHE-MISS! Führe Cloudflare API-Anfrage aus...`);
    
    const startTime = Date.now();
    const { Contents = [] } = await r2Client.send(
      new ListObjectsV2Command({ 
        Bucket: R2_BUCKET_NAME,
        Prefix: prefix || undefined,
        MaxKeys: 1000  // Limit auf 1000 Objekte
      })
    );
    const endTime = Date.now();

    console.log(`[PDF-API][GET][${requestId}] *** CLOUDFLARE R2 API WURDE AUFGERUFEN! ***`);
    console.log(`[PDF-API][GET][${requestId}] Cloudflare API-Antwortzeit: ${endTime - startTime}ms`);
    
    const files = Contents.map((o) => ({
      name: o.Key,
      size: o.Size,
      lastModified: o.LastModified,
    }));

    console.log(`[PDF-API][GET][${requestId}] ${files.length} Dateien gefunden`);
    
    // In Cache speichern
    cache.set(cacheKey, { files, fetchedAt: Date.now() });
    console.log(`[PDF-API][GET][${requestId}] Daten im Cache gespeichert (TTL: ${CACHE_TTL_MS/1000/60} Minuten)`);
    
    respondCors(req, res);
    // Setze explizite Cache-Control-Header
    res.setHeader("Cache-Control", "public, max-age=300");
    console.log(`[PDF-API][GET][${requestId}] ========== ANFRAGE BEENDET (API) ==========\n`);
    return res.json({ files });
  } catch (error: any) {
    console.error(`[PDF-API][GET][${requestId}] FEHLER: ${error.message || 'Unbekannter Fehler'}`);
    console.error(`[PDF-API][GET][${requestId}] Stack: ${error.stack || 'Kein Stack-Trace verfügbar'}`);
    respondCors(req, res, 500);
    console.log(`[PDF-API][GET][${requestId}] ========== ANFRAGE BEENDET (ERROR) ==========\n`);
    return res.json({ error: error.message || "Unexpected error" });
  }
}
