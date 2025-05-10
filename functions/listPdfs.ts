// listPdfs.ts
import { R2Bucket, R2ListOptions, PagesFunction, ExecutionContext } from "@cloudflare/workers-types"; // Behalte relevante Typen erstmal

interface Env {
  CLERK_SECRET_KEY?: string;
  VITE_CLERK_PUBLISHABLE_KEY?: string;
  R2_BUCKET_NAME_ENV?: string;
  R2_BUCKET_BINDING: R2Bucket; // Lass das R2-Binding erstmal deklariert, da es im UI ja korrekt ist
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

function getCorsHeaders(request: Request): Headers { /* ...deine Funktion... */ return new Headers(); } // Kann bleiben, Inhalt ist erstmal egal

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const corsHeaders = getCorsHeaders(request); // Hole CORS Header

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "GET") {
      return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
    }

    // ALLES ANDERE (Clerk Auth, R2 Logic) IST AUSKOMMENTIERT ODER ENTFERNT
    // Gib einfach eine Test-Antwort zurück:
    console.log("listPdfs.ts - stark vereinfachte Version wurde aufgerufen");
    const responseHeaders = getCorsHeaders(request);
    responseHeaders.set("Content-Type", "application/json");
    return new Response(JSON.stringify({ message: "listPdfs stark vereinfacht aktiv!" }), { headers: responseHeaders });
  },
};