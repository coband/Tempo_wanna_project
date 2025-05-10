import { createClient } from '@supabase/supabase-js'; // SupabaseClient entfernt, da nicht direkt typisiert
import { GoogleGenAI, GenAIError, File } from '@google/generative-ai'; // Part entfernt
// Entferne: import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createClerkClient } from '@clerk/backend';
import { R2Bucket } from '@cloudflare/workers-types';

interface Env {
  VITE_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GEMINI_API_KEY: string;
  CLERK_SECRET_KEY: string;
  VITE_CLERK_PUBLISHABLE_KEY: string;
  // Entferne: CF_ACCOUNT_ID, CF_R2_ACCESS_KEY_ID, CF_R2_SECRET_ACCESS_KEY (wenn nur für S3-Client)
  R2_BUCKET_NAME_ENV?: string; // Optional

  R2_BUCKET_BINDING: R2Bucket; // R2 Binding
  NODE_ENV?: string;
}

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://www.wanna-books.ch',
  'https://wanna-books.ch',
  'https://tempo-wanna-project.vercel.app',
  'https://tempo-wanna-project-cornelbandli.vercel.app',
  'https://tempo-wanna-project.pages.dev'
];
const MODEL_NAME = 'gemini-2.5-flash-preview-04-17';
const MAX_PROCESSABLE_PDF_SIZE = 200 * 1024 * 1024;
const ENABLE_METADATA_CACHING = true;

interface PdfMetadata {
  etag: string | null; // Wird httpEtag von R2 sein
  size: number | null;
  lastAccessed: number;
}
const metadataCache = new Map<string, PdfMetadata>();

function cleanupMetadataCache() {
  const now = Date.now();
  const MAX_AGE = 30 * 60 * 1000;
  for (const [key, metadata] of metadataCache.entries()) {
    if (now - metadata.lastAccessed > MAX_AGE) {
      metadataCache.delete(key);
    }
  }
}

function getCorsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Vary", "Origin");
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const genAI = new GoogleGenAI(env.GEMINI_API_KEY);
    const clerk = createClerkClient({
      secretKey: env.CLERK_SECRET_KEY,
      publishableKey: env.VITE_CLERK_PUBLISHABLE_KEY,
    });
    const R2_BINDING = env.R2_BUCKET_BINDING; // Zugriff auf das Binding

    if (Math.random() < 0.1) {
        cleanupMetadataCache();
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: getCorsHeaders(request) });
    }
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405, headers: getCorsHeaders(request) });
    }

    /* ---------- Clerk Auth (bleibt gleich) ---------- */
    try {
        const authHeader = request.headers.get("Authorization");
        let isSignedIn = false;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const clerkRequest = new Request(request.url, { headers: request.headers, method: request.method });
            const authOptions = { authorizedParties: ALLOWED_ORIGINS };
            try {
                const authResult = await clerk.authenticateRequest(clerkRequest.clone(), authOptions);
                isSignedIn = authResult.isSignedIn;
            } catch (tokenError: any) {
                return Response.json({ error: "Invalid token" }, { status: 401, headers: getCorsHeaders(request) });
            }
        } else {
            const authResult = await clerk.authenticateRequest(request.clone(), { authorizedParties: ALLOWED_ORIGINS });
            isSignedIn = authResult.isSignedIn;
        }
        if (!isSignedIn) {
            return Response.json({ error: "Unauthorized" }, { status: 401, headers: getCorsHeaders(request) });
        }
    } catch (authError: any) {
        return Response.json({ error: "Unauthorized" }, { status: 401, headers: getCorsHeaders(request) });
    }

    try {
      const body = await request.json<{ pdfPath?: string; question?: string }>();
      const pdfPath = body.pdfPath;
      const question = body.question;

      if (!pdfPath || !question) {
        return Response.json({ error: 'pdfPath und question erforderlich' }, { status: 400, headers: getCorsHeaders(request) });
      }

      async function getObjectMetadataFromR2(key: string): Promise<PdfMetadata> {
        if (ENABLE_METADATA_CACHING && metadataCache.has(key)) {
          const cachedData = metadataCache.get(key)!;
          cachedData.lastAccessed = Date.now();
          return cachedData;
        }
        const object = await R2_BINDING.head(key);
        if (!object) {
          throw new Error(`Metadaten für ${key} nicht abrufbar (Objekt nicht in R2 gefunden).`);
        }
        const metadata: PdfMetadata = {
          etag: object.httpEtag, // S3-kompatibler ETag
          size: object.size,
          lastAccessed: Date.now(),
        };
        if (ENABLE_METADATA_CACHING) {
          metadataCache.set(key, metadata);
        }
        return metadata;
      }

      async function fetchPdfFromR2AsUint8Array(key: string): Promise<Uint8Array> {
        const metadata = await getObjectMetadataFromR2(key); // Nutzt die obige Funktion, um Cache zu verwenden
        if (metadata.size && metadata.size > MAX_PROCESSABLE_PDF_SIZE) {
          throw new Error(`PDF ist zu groß (${(metadata.size / (1024*1024)).toFixed(2)} MB). Limit: ${MAX_PROCESSABLE_PDF_SIZE / (1024*1024)} MB.`);
        }

        const objectBody = await R2_BINDING.get(key);
        if (!objectBody) {
            throw new Error(`PDF-Datei ${key} nicht in R2 gefunden.`);
        }
        // Überprüfe die Größe erneut direkt vom R2ObjectBody, falls Metadaten veraltet waren oder nicht existierten
        if (objectBody.size > MAX_PROCESSABLE_PDF_SIZE) {
             throw new Error(`PDF ist zu groß (${(objectBody.size / (1024*1024)).toFixed(2)} MB). Limit: ${MAX_PROCESSABLE_PDF_SIZE / (1024*1024)} MB.`);
        }

        const arrayBuffer = await objectBody.arrayBuffer();
        return new Uint8Array(arrayBuffer);
      }

      const pdfUint8Array = await fetchPdfFromR2AsUint8Array(pdfPath);
      const pdfBlob = new Blob([pdfUint8Array], { type: 'application/pdf' });
      const displayName = pdfPath.split('/').pop() || `uploaded-pdf-${Date.now()}.pdf`;

      let uploadedFile: File | undefined = undefined;
      try {
        console.log(`Lade PDF zu Gemini hoch: ${displayName}, Größe: ${(pdfBlob.size / (1024*1024)).toFixed(2)} MB`);
        uploadedFile = await genAI.uploadFile({ // genAI Client direkt verwenden
          file: pdfBlob,
          displayName: displayName,
        });
        console.log(`PDF erfolgreich zu Gemini hochgeladen: ${uploadedFile.name}`);

        let getFileResponse = await genAI.getFile(uploadedFile.name);
        let attempts = 0;
        const maxAttempts = 20;
        const delayBetweenAttempts = 5000;

        console.log(`Warte auf Verarbeitung der Datei durch Gemini: ${getFileResponse.name}, Status: ${getFileResponse.state}`);
        while (getFileResponse.state === 'PROCESSING' && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
          getFileResponse = await genAI.getFile(uploadedFile.name);
          attempts++;
          console.log(`Gemini Verarbeitungsstatus (${attempts}): ${getFileResponse.state}`);
        }

        if (getFileResponse.state === 'FAILED') {
          throw new Error(`Dateiverarbeitung durch Google GenAI API fehlgeschlagen. Status: ${getFileResponse.state}, Grund: ${getFileResponse.error?.message || 'Unbekannt'}`);
        }
        if (attempts >= maxAttempts && getFileResponse.state === 'PROCESSING') {
          throw new Error('Zeitüberschreitung bei der Dateiverarbeitung durch Google GenAI API.');
        }
        if (getFileResponse.state !== 'ACTIVE') {
          throw new Error(`Datei ist nach der Verarbeitung nicht im Status ACTIVE: ${getFileResponse.state}`);
        }

        console.log(`Datei erfolgreich von Gemini verarbeitet: ${getFileResponse.name}. Generiere Inhalt.`);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent([
          { text: `Ich habe eine Frage zu diesem PDF-Dokument: ${question}` },
          { fileData: { mimeType: uploadedFile.mimeType, fileUri: uploadedFile.uri } }
        ]);
        const responseText = result.response.text();
        console.log("Antwort von Gemini erhalten.");
        return Response.json({ answer: responseText }, { headers: getCorsHeaders(request) });

      } catch (err: any) {
        console.error(`Fehler bei der PDF-Verarbeitung mit Gemini: ${err.message}`, err);
        let userErrorMessage = `Fehler bei der PDF-Verarbeitung: ${err.message}`;
         if (err instanceof GenAIError) {
            userErrorMessage = `Fehler von Google GenAI: ${err.message}`;
        } else if (String(err.message).includes('File size too large') || String(err.message).includes('exceeds maximum size')) {
            userErrorMessage = `Die PDF-Datei ist zu groß für Gemini.`;
        }
        return Response.json({ error: userErrorMessage, details: env.NODE_ENV === 'development' ? err.stack : undefined }, { status: 500, headers: getCorsHeaders(request) });
      } finally {
        if (uploadedFile) {
          try {
            console.log(`Lösche Datei aus Gemini: ${uploadedFile.name}`);
            await genAI.deleteFile(uploadedFile.name); // genAI Client direkt verwenden
            console.log(`Datei erfolgreich aus Gemini gelöscht: ${uploadedFile.name}`);
          } catch (deleteError: any) {
            console.warn(`Konnte Datei ${uploadedFile.name} nicht aus Google File API löschen: ${deleteError.message}`);
          }
        }
      }
    } catch (err: any) {
      console.error(`Handler Error: ${err.message}`, err);
      return Response.json({ error: err.message || 'Unerwarteter Fehler im Handler', details: env.NODE_ENV === 'development' ? err.stack : undefined }, { status: 500, headers: getCorsHeaders(request) });
    }
  },
};