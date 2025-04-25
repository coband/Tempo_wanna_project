import type { VercelRequest, VercelResponse } from "@vercel/node";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import { createClerkClient } from "@clerk/backend";

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
assertEnv("CLERK_SECRET_KEY");
assertEnv("CLERK_PUBLISHABLE_KEY");

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
/*  CLERK CLIENT                                                               */
/* -------------------------------------------------------------------------- */
const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY!,
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

  // Anfrage detailliert loggen
  console.log(`\n[PDF-API][${req.method}][${requestId}] ========== NEUE ANFRAGE (${req.method}) ==========`);
  console.log(`[PDF-API][${req.method}][${requestId}] Zeitstempel: ${new Date().toISOString()}`);
  console.log(`[PDF-API][${req.method}][${requestId}] URL: ${req.url}`);
  console.log(`[PDF-API][${req.method}][${requestId}] Herkunft: ${req.headers.origin || "Unbekannt"}`);
  console.log(`[PDF-API][${req.method}][${requestId}] User-Agent: ${req.headers["user-agent"] || "Unbekannt"}`);
  console.log(`[PDF-API][${req.method}][${requestId}] Referer: ${req.headers.referer || "Unbekannt"}`);
  console.log(`[PDF-API][${req.method}][${requestId}] IP: ${req.headers["x-forwarded-for"] || req.socket.remoteAddress || "Unbekannt"}`);

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

  /* ---------- Clerk Auth ---------- */
  try {
    // Prüfen ob ein Bearer-Token vorhanden ist
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Bearer-Token aus dem Header extrahieren
      const token = authHeader.substring(7); // "Bearer " entfernen
      console.log(`[PDF-API][GET][${requestId}] Bearer-Token gefunden, versuche Validierung...`);
      
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
            "http://127.0.0.1:3000"
          ]
        };
        
        const authResult = await clerk.authenticateRequest(dummyRequest, authOptions);
        
        if (authResult.isSignedIn) {
          console.log(`[PDF-API][GET][${requestId}] Token-Validierung erfolgreich, Benutzer: ${authResult.toAuth().userId}`);
          // Token ist gültig, Anfrage fortsetzen
        } else {
          console.log(`[PDF-API][GET][${requestId}] Token ist ungültig oder kein Benutzer gefunden`);
          respondCors(req, res, 401);
          return res.json({ error: "Unauthorized" });
        }
      } catch (tokenError) {
        // Token-Validierung fehlgeschlagen - Zugriff verweigern
        console.error(`[PDF-API][GET][${requestId}] Token-Validierungsfehler:`, tokenError);
        respondCors(req, res, 401);
        return res.json({ error: "Invalid token" });
      }
    } else {
      // Cookie-basierte Authentifizierung als Fallback
      console.log(`[PDF-API][GET][${requestId}] Kein Bearer-Token, versuche Cookie-basierte Authentifizierung`);
      
      const absoluteUrl = `${req.headers["x-forwarded-proto"] ?? "http"}://${req.headers.host}${req.url}`;
      const fetchRequest = new Request(absoluteUrl, {
        method: req.method,
        headers: req.headers as any,
      });

      const { isSignedIn } = await clerk.authenticateRequest(fetchRequest, {
        authorizedParties: ALLOWED_ORIGINS,
      });

      if (!isSignedIn) {
        console.log(`[PDF-API][GET][${requestId}] Nicht eingeloggt – Zugriff verweigert`);
        respondCors(req, res, 401);
        return res.json({ error: "Unauthorized" });
      }
    }
  } catch (authError) {
    console.error(`[PDF-API][GET][${requestId}] Auth-Fehler:`, authError);
    respondCors(req, res, 401);
    return res.json({ error: "Unauthorized" });
  }

  // Extrahiere die optionalen Query-Parameter
  const prefix =
    typeof req.query.prefix === "string"
      ? req.query.prefix
      : typeof req.query.path === "string"
      ? req.query.path
      : "";

  console.log(`[PDF-API][GET][${requestId}] Angeforderte Prefix/Path: "${prefix || "root"}"`);

  /* ---------- Direkter Abruf von R2 ---------- */
  try {
    console.log(`[PDF-API][GET][${requestId}] Führe Cloudflare API-Anfrage aus...`);

    const startTime = Date.now();
    const { Contents = [] } = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: prefix || undefined,
        MaxKeys: 1000, // Limit auf 1000 Objekte
      })
    );
    const endTime = Date.now();

    console.log(`[PDF-API][GET][${requestId}] *** CLOUDFLARE R2 API WURDE AUFGERUFEN! ***`);
    console.log(`[PDF-API][GET][${requestId}] Cloudflare-Antwortzeit: ${endTime - startTime}ms`);

    const files = Contents.map((o) => ({
      name: o.Key,
      size: o.Size,
      lastModified: o.LastModified,
    }));

    console.log(`[PDF-API][GET][${requestId}] ${files.length} Dateien gefunden`);

    respondCors(req, res);
    res.setHeader("Cache-Control", "no-store");
    console.log(`[PDF-API][GET][${requestId}] ========== ANFRAGE BEENDET (OK) ==========\n`);
    return res.json({ files });
  } catch (error: any) {
    console.error(`[PDF-API][GET][${requestId}] FEHLER: ${error.message || "Unbekannter Fehler"}`);
    console.error(`[PDF-API][GET][${requestId}] Stack: ${error.stack || "Kein Stack-Trace verfügbar"}`);
    respondCors(req, res, 500);
    console.log(`[PDF-API][GET][${requestId}] ========== ANFRAGE BEENDET (ERROR) ==========\n`);
    return res.json({ error: error.message || "Unexpected error" });
  }
}
