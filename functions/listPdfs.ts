// Entferne: import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createClerkClient } from "@clerk/backend";
import { R2Bucket, R2ListOptions } from "@cloudflare/workers-types";

// Definieren Sie ein Interface für Ihre Umgebungsvariablen
interface Env {
  CLERK_SECRET_KEY?: string; // Optional gemacht für den Test
  VITE_CLERK_PUBLISHABLE_KEY?: string; // Optional gemacht für den Test
  R2_BUCKET_NAME_ENV?: string;
  R2_BUCKET_BINDING: R2Bucket;
  NODE_ENV?: string;
}

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://www.wanna-books.ch",
  "https://wanna-books.ch",
  "https://tempo-wanna-project.vercel.app",
  "https://tempo-wanna-project-cornelbandli.vercel.app",
  "https://tempo-wanna-project.pages.dev"
];

function getCorsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");

  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
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
    const clerk = createClerkClient({
      secretKey: env.CLERK_SECRET_KEY,
      publishableKey: env.VITE_CLERK_PUBLISHABLE_KEY,
    });

    // Der Bucket-Name aus wrangler.toml wird über das Binding verwendet.
    // env.R2_BUCKET_NAME_ENV kann als Fallback oder für andere Zwecke dienen.
    const bucketNameForLogging = env.R2_BUCKET_NAME_ENV || "aus Binding konfiguriert";


    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: getCorsHeaders(request) });
    }

    if (request.method !== "GET") {
      return Response.json({ error: "Method not allowed" }, { status: 405, headers: getCorsHeaders(request) });
    }

    /* ---------- Clerk Auth ---------- */
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
            console.error("Token validation error:", tokenError.message);
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
      console.error("Authentication error:", authError.message);
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: getCorsHeaders(request) });
    }

    const url = new URL(request.url);
    const prefix = url.searchParams.get("prefix") || url.searchParams.get("path") || "";

    /* ---------- Direkter Abruf von R2 via Binding ---------- */
    try {
      console.log(`Verwende R2-Bucket (via Binding): ${bucketNameForLogging}`);

      const listOptions: R2ListOptions = {
        prefix: prefix || undefined,
        limit: 1000, // Ähnlich zu MaxKeys
        // include: ['customMetadata', 'httpMetadata'], // Bei Bedarf zusätzliche Metadaten anfordern
      };

      const listed = await env.R2_BUCKET_BINDING.list(listOptions);
      const files = listed.objects.map((o) => ({
        name: o.key,
        size: o.size,
        lastModified: o.uploaded, // `uploaded` ist das Äquivalent zu `LastModified`
        etag: o.httpEtag || o.etag, // httpEtag für S3-Kompatibilität, ansonsten den R2 ETag
      }));

      // Wenn es mehr Ergebnisse gibt und Paginierung benötigt wird:
      // while (listed.truncated) {
      //   listed = await env.R2_BUCKET_BINDING.list({
      //     ...listOptions,
      //     cursor: listed.cursor,
      //   });
      //   files.push(...listed.objects.map(o => ({...})));
      // }

      const responseHeaders = getCorsHeaders(request);
      responseHeaders.set("Cache-Control", "no-store");
      return Response.json({ files }, { headers: responseHeaders });

    } catch (error: any) {
      console.error(`Fehler beim Abrufen der Dateien aus R2: ${error.message || "Unbekannter Fehler"}`);
      console.error(`Fehlerdetails: ${JSON.stringify(error)}`);

      let errorMessage = error.message || "Unexpected error";
      // Fehlerbehandlung kann generischer sein, da Credential-Fehler seltener sind mit Bindings
      if (error.message.includes("bucket") || error.message.includes("Bucket")) {
        errorMessage = `Bucket '${bucketNameForLogging}' nicht gefunden oder nicht zugänglich (Binding-Problem?).`;
      } else if (error.message.includes("NetworkError") || error.message.includes("network")) {
        errorMessage = "Netzwerkfehler bei der Verbindung zu Cloudflare R2.";
      }

      return Response.json(
        {
          error: errorMessage,
          details: env.NODE_ENV === "development" ? error.toString() : undefined
        },
        { status: 500, headers: getCorsHeaders(request) }
      );
    }
  },
};