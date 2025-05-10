import { createClerkClient } from "@clerk/backend";

/* -------------------------------------------------------------------------- */
/*  Workers‐Runtime Typen                                                     */
/* -------------------------------------------------------------------------- */
export interface Env {
  /**  R2-Binding  – in den Pages-Settings unter „R2_BUCKET_BINDING“ konfiguriert   */
  R2_BUCKET_BINDING: R2Bucket;

  /**  Secrets  – in den Pages-Settings als Variablen bzw. Geheimnisse hinterlegt   */
  CLERK_SECRET_KEY: string;
  VITE_CLERK_PUBLISHABLE_KEY: string;
}

/* -------------------------------------------------------------------------- */
/*  CORS‐Konfiguration                                                        */
/* -------------------------------------------------------------------------- */
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://www.wanna-books.ch",
  "https://wanna-books.ch",
  "https://tempo-wanna-project.vercel.app",
  "https://tempo-wanna-project-cornelbandli.vercel.app",
  "https://tempo-wanna-project.pages.dev",   // ← deine Pages-Domain
];

function corsHeaders(origin?: string): HeadersInit {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

/* -------------------------------------------------------------------------- */
/*  Handler                                                                   */
/* -------------------------------------------------------------------------- */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const origin = request.headers.get("Origin") ?? undefined;

  /* ---------- Pre-flight ---------- */
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  /* ---------- Clerk Auth ---------- */
  const clerk = createClerkClient({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.VITE_CLERK_PUBLISHABLE_KEY,
  });

  try {
    const authHeader = request.headers.get("Authorization");

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const dummyReq = new Request("https://api.example.com", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { isSignedIn } = await clerk.authenticateRequest(dummyReq, {
        authorizedParties: ALLOWED_ORIGINS.concat([
          "https://api.example.com",
          "http://localhost:3000",
          "http://127.0.0.1:3000",
        ]),
      });
      if (!isSignedIn) throw new Error("Unauthorized");
    } else {
      const { isSignedIn } = await clerk.authenticateRequest(request, {
        authorizedParties: ALLOWED_ORIGINS,
      });
      if (!isSignedIn) throw new Error("Unauthorized");
    }
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  /* ---------- R2-Listing ---------- */
  const url = new URL(request.url);
  const prefix = url.searchParams.get("prefix") ?? url.searchParams.get("path") ?? "";

  try {
    const { objects } = await env.R2_BUCKET_BINDING.list({ prefix, limit: 1000 });
    const files = objects.map((o) => ({
      name: o.key,
      size: o.size,
      lastModified: o.uploaded,
    }));

    return new Response(JSON.stringify({ files }), {
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    let msg = err?.message || "Unexpected error";
    if (/credential/i.test(msg)) {
      msg = "R2 Anmeldedaten ungültig oder nicht verfügbar";
    } else if (/bucket/i.test(msg)) {
      msg = "Bucket nicht gefunden oder nicht zugänglich";
    } else if (/network/i.test(msg)) {
      msg = "Netzwerkfehler bei der Verbindung zu Cloudflare R2";
    }

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
};
