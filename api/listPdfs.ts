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
assertEnv("VITE_CLERK_PUBLISHABLE_KEY");

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
  publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY!,
});

/* -------------------------------------------------------------------------- */
/*  CORS HELPER                                                               */
/* -------------------------------------------------------------------------- */
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://your-frontend.com",
  "https://www.wanna-books.ch",
  "https://wanna-books.ch",
  "https://tempo-wanna-project.vercel.app",
  "https://tempo-wanna-project-cornelbandli.vercel.app",
  "https://tempo-wanna-project.pages.dev"
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
  // OPTIONS-Anfrage für CORS
  if (req.method === "OPTIONS") {
    respondCors(req, res, 204);
    return res.end();
  }
  
  if (req.method !== "GET") {
    respondCors(req, res, 405);
    return res.json({ error: "Method not allowed" });
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
            "https://tempo-wanna-project-cornelbandli.vercel.app",
            "https://tempo-wanna-project.pages.dev"
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

  // Extrahiere die optionalen Query-Parameter
  const prefix =
    typeof req.query.prefix === "string"
      ? req.query.prefix
      : typeof req.query.path === "string"
      ? req.query.path
      : "";

  /* ---------- Direkter Abruf von R2 ---------- */
  try {
    // Debugging: Bucket-Name protokollieren
    console.log(`Verwende R2-Bucket: ${R2_BUCKET_NAME}`);
    
    const { Contents = [] } = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: prefix || undefined,
        MaxKeys: 1000, // Limit auf 1000 Objekte
      })
    );

    const files = Contents.map((o) => ({
      name: o.Key,
      size: o.Size,
      lastModified: o.LastModified,
    }));

    respondCors(req, res);
    res.setHeader("Cache-Control", "no-store");
    return res.json({ files });
  } catch (error: any) {
    // Detailliertere Fehlermeldung
    console.error(`Fehler beim Abrufen der Dateien: ${error.message || "Unbekannter Fehler"}`);
    console.error(`Fehlerdetails: ${JSON.stringify(error)}`);
    
    // Spezifische Fehler identifizieren
    let errorMessage = error.message || "Unexpected error";
    if (errorMessage.includes("credential") || errorMessage.includes("Credential")) {
      errorMessage = "R2 Anmeldedaten ungültig oder nicht verfügbar";
    } else if (errorMessage.includes("bucket") || errorMessage.includes("Bucket")) {
      errorMessage = `Bucket '${R2_BUCKET_NAME}' nicht gefunden oder nicht zugänglich`;
    } else if (errorMessage.includes("NetworkError") || errorMessage.includes("network")) {
      errorMessage = "Netzwerkfehler bei der Verbindung zu Cloudflare R2";
    }
    
    respondCors(req, res, 500);
    return res.json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? error.toString() : undefined
    });
  }
}
