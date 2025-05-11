// -----------------------------------------------------------------------------
// functions/processPdf.ts – Cloudflare Pages Function
// -----------------------------------------------------------------------------
// Aufgabe
// -------
// 1. Hole eine PDF‑Datei aus einem an Pages‑Functions gebundenen R2‑Bucket
//    (Query‑Parameter: ?key=path/to/file.pdf).
// 2. Wandle die PDF in Base64 um.
// 3. Schicke den Base64‑String an die Google Gemini‑REST‑API
//    (streamGenerateContent) und erhalte eine deutsche Kurz‑Zusammenfassung
//    der Datei (Streaming‑SSE).
// 4. Speichere Metadaten + Summary in Supabase.
// 5. Gib die Metadaten als JSON zurück und cache sie für 1 h
//    (in‑memory, pro Worker‑Instance).
//
// Der Code richtet sich **strikt** nach der Cloudflare‑Workers / Pages‑Functions
// Runtime (Web‑Standard‑APIs, kein Node‑Polyfill) und TypeScript 5.
// -----------------------------------------------------------------------------
import type { PagesFunction } from '@cloudflare/workers-types';
import { createClient } from '@supabase/supabase-js';
import { createClerkClient } from '@clerk/backend';

// -----------------------------------------------------------------------------
// Environment‑Binding‑Schnittstelle
// -----------------------------------------------------------------------------
export interface Env {
  VITE_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GEMINI_API_KEY: string;
  CLERK_SECRET_KEY: string;
  VITE_CLERK_PUBLISHABLE_KEY: string;
  R2_BUCKET_BINDING: R2Bucket;
  NODE_ENV?: string;
}

// -----------------------------------------------------------------------------
// Konstanten
// -----------------------------------------------------------------------------
const MODEL_ID = 'gemini-2.5-flash-preview-04-17';
const MAX_CACHE_AGE = 1000 * 60 * 60; // 1 h (In‑Memory pro Worker‑Instance)

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://www.wanna-books.ch',
  'https://wanna-books.ch',
  'https://tempo-wanna-project.vercel.app',
  'https://tempo-wanna-project-cornelbandli.vercel.app',
  'https://tempo-wanna-project.pages.dev',
];

// -----------------------------------------------------------------------------
// Hilfsfunktionen
// -----------------------------------------------------------------------------
function getCorsHeaders(request: Request): Headers {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Vary', 'Origin');
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }
  return headers;
}

/**
 * Liest einen ReadableStream vollständig und gibt **Base64‑kodierte** Daten
 * zurück. Arbeitet ohne Buffer/Node. Für PDFs bis ~10 MB absolut ausreichend.
 */
async function streamToBase64(stream: ReadableStream<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);

  const size = chunks.reduce((n, c) => n + c.length, 0);
  const u8 = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    u8.set(chunk, offset);
    offset += chunk.length;
  }

  let binary = '';
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
  return btoa(binary);
}

/**
 * Parst das SSE‑Streaming‑Format von *streamGenerateContent* (Gemini‑REST).
 * Gibt den zusammengesetzten Fließtext zurück.
 */
async function parseGeminiStream(res: Response): Promise<string> {
  const decoder = new TextDecoder();
  const reader = res.body!.getReader();
  let buffer = '';
  let summary = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Zeilen nach "\n" separieren → typische SSE‑Form: "data: {json}\n".
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      try {
        const payload = JSON.parse(data);
        const text = payload.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined;
        if (text) summary += text;
      } catch {
        /* JSON‑Fehler einfach ignorieren */
      }
    }
  }

  return summary.trim();
}

// -----------------------------------------------------------------------------
// Simpler In‑Memory‑Cache (pro Worker‑Instance)
// -----------------------------------------------------------------------------
interface CacheEntry {
  last: number; // Timestamp → Sliding‑Expiration
  data: unknown;
}
const cache = new Map<string, CacheEntry>();

// -----------------------------------------------------------------------------
// Haupt‑Handler
// -----------------------------------------------------------------------------
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  // ----- CORS Pre‑flight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }

  // ----- Nur GET oder POST zulassen
  if (!['GET', 'POST'].includes(request.method)) {
    return Response.json(
      { error: 'Method not allowed' },
      { status: 405, headers: getCorsHeaders(request) },
    );
  }

  // ----- Clerk‑Authentifizierung
  const clerk = createClerkClient({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.VITE_CLERK_PUBLISHABLE_KEY,
  });

  try {
    const auth = await clerk.authenticateRequest(request.clone(), {
      authorizedParties: ALLOWED_ORIGINS,
    });
    if (!auth.isSignedIn) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: getCorsHeaders(request) });
    }
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: getCorsHeaders(request) });
  }

  // ----- Query‑Parameter »key« prüfen
  const key = new URL(request.url).searchParams.get('key');
  if (!key) {
    return Response.json({ error: 'Missing "key" query param' }, { status: 400, headers: getCorsHeaders(request) });
  }

  // ----- Cache‑Hit? (Sliding‑Expiration)
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.last < MAX_CACHE_AGE) {
    cached.last = now;
    return Response.json(cached.data, { headers: getCorsHeaders(request) });
  }

  // ----- PDF aus R2 holen (als Stream)
  let obj: R2ObjectBody | null = null;
  try {
    obj = await env.R2_BUCKET_BINDING.get(key);
    if (!obj) {
      return Response.json({ error: 'File not found' }, { status: 404, headers: getCorsHeaders(request) });
    }
  } catch (err) {
    console.error('R2 get error', err);
    return Response.json({ error: 'R2 fetch failed' }, { status: 500, headers: getCorsHeaders(request) });
  }

  // ----- PDF → Base64
  const base64Pdf = await streamToBase64(obj.body!);

  // ----- Gemini‑Aufruf (Streaming)
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:streamGenerateContent?key=${env.GEMINI_API_KEY}`;
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          { file_data: { mime_type: 'application/pdf', data: base64Pdf } },
          { text: 'Bitte gib mir eine kurze Zusammenfassung auf Deutsch.' },
        ],
      },
    ],
    generationConfig: { temperature: 0.3, maxOutputTokens: 256 },
  };

  let summary = '';
  try {
    const gRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!gRes.ok) throw new Error(`Gemini HTTP ${gRes.status}`);

    summary = await parseGeminiStream(gRes);
  } catch (err) {
    console.error('Gemini error', err);
    return Response.json({ error: 'Gemini processing failed' }, { status: 502, headers: getCorsHeaders(request) });
  }

  // ----- Metadaten in Supabase persistieren
  const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const metadata = {
    key,
    size: obj.size,
    processed_at: new Date().toISOString(),
    summary,
  };

  try {
    const { error } = await supabase.from('pdf_metadata').insert(metadata);
    if (error) console.error('Supabase insert error', error);
  } catch (err) {
    console.error('Supabase error', err);
  }

  // ----- Cache aktualisieren & Antwort
  cache.set(key, { last: Date.now(), data: metadata });
  return Response.json(metadata, { headers: getCorsHeaders(request) });
};
