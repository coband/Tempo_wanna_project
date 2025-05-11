// -----------------------------------------------------------------------------
// functions/processPdf.ts – Cloudflare Pages Function (REST w/ Gemini File API)
// -----------------------------------------------------------------------------
// Ablauf
// ======
// 1. Prüfe Clerk‑Auth + CORS.
// 2. Lade ein PDF‐Objekt aus R2 (`?key=` Query‑Param).
// 3. Lade es *streamend* via **Gemini Files API** (`media.upload` – Resumable)
//    hoch und erhalte `file_uri` zurück. (→ kein Base64 im Speicher)
// 4. Schicke `file_uri` an `models:streamGenerateContent` + Prompt.
// 5. Persistiere Metadaten & Summary in Supabase.
// 6. Cache das Ergebnis 1 h In‑Memory und antworte als JSON.
//
// Kompatibilität
// --------------
// * Läuft nativ in Cloudflare Workers (Web‑APIs, keine Node‑Polyfills).
// * Verwendet *fetch + Streaming* für großen PDF‑Upload (> 5 MB).
// * Clerk‑JWT‑Verifizierung ohne Middleware.
//
// Quellen
// -------
// • Gemini Files API – `media.upload` endpoint ([ai.google.dev](https://ai.google.dev/api/files))
// • Beispiel für Resumable‑Header ([googlecloudcommunity.com](https://www.googlecloudcommunity.com/gc/AI-ML/Gemini-API-method-models-generateContent-returns-error-code-400/m-p/831749?utm_source=chatgpt.com))
// -----------------------------------------------------------------------------

import type { PagesFunction } from '@cloudflare/workers-types';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClerkClient } from '@clerk/backend';

// -----------------------------------------------------------------------------
// Env‑Binding‑Interface ---------------------------------------------------------
// -----------------------------------------------------------------------------
export interface Env {
  R2_BUCKET_BINDING: R2Bucket;
  GEMINI_API_KEY: string;
  VITE_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  CLERK_SECRET_KEY: string;
  VITE_CLERK_PUBLISHABLE_KEY: string;
}

// -----------------------------------------------------------------------------
// Konstante Einstellungen ------------------------------------------------------
// -----------------------------------------------------------------------------
const MODEL_ID = 'gemini-2.5-flash-preview-04-17';
const MAX_CACHE_AGE = 1000 * 60 * 60; // 1 h
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://tempo-wanna-project.pages.dev',
  'https://wanna-books.ch',
];

// In‑Memory‑Cache (pro Worker‑Instance)
interface CacheEntry {
  last: number;
  data: unknown;
}
const cache = new Map<string, CacheEntry>();

// -----------------------------------------------------------------------------
// Utils ------------------------------------------------------------------------
// -----------------------------------------------------------------------------
function cors(request: Request): Headers {
  const h = new Headers({
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  });
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) h.set('Access-Control-Allow-Origin', origin);
  return h;
}

// -----------------------------------------------------------------------------
// SSE‑Parser: "data: {json}\n" → Text kombinieren -----------------------------
// -----------------------------------------------------------------------------
async function parseGeminiSSE(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6);
      if (payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        const part = json.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined;
        if (part) text += part;
      } catch {
        /* ignore */
      }
    }
  }
  return text.trim();
}

// -----------------------------------------------------------------------------
// Haupt‑Handler ---------------------------------------------------------------
// -----------------------------------------------------------------------------
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  // CORS Pre‑flight
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });

  // Clerk Auth ----------------------------------------------------------------
  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY, publishableKey: env.VITE_CLERK_PUBLISHABLE_KEY });
  try {
    const auth = await clerk.authenticateRequest(request.clone());
    if (!auth.isSignedIn) throw new Error('not signed in');
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors(request) });
  }

  // Nur GET zulassen
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors(request) });
  }

  // URL Parameter abrufen
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  const question = url.searchParams.get('question') || 'Bitte gib mir eine kurze Zusammenfassung auf Deutsch.';
  
  // Parameter validieren
  if (!key) return Response.json({ error: 'Missing "key"' }, { status: 400, headers: cors(request) });

  // Cache Hit? Wir müssen auch den Frage-Parameter berücksichtigen
  const cacheKey = `${key}:${question}`;
  const now = Date.now();
  const c = cache.get(cacheKey);
  if (c && now - c.last < MAX_CACHE_AGE) {
    c.last = now; // sliding
    return Response.json(c.data, { headers: cors(request) });
  }

  // PDF aus R2 holen (Streaming)
  let obj: R2ObjectBody | null = null;
  try {
    obj = await env.R2_BUCKET_BINDING.get(key);
    if (!obj) return Response.json({ error: 'File not found' }, { status: 404, headers: cors(request) });
  } catch (err) {
    console.error('R2 error', err);
    return Response.json({ error: 'R2 fetch failed' }, { status: 500, headers: cors(request) });
  }

  // -------------------------------------------------------------------------
  // 1. Resumable Upload – "start" ------------------------------------------
  // -------------------------------------------------------------------------
  const startRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Type': 'application/pdf',
      'X-Goog-Upload-Header-Content-Length': obj.size.toString(),
    },
    body: JSON.stringify({ file: { displayName: key.split('/').pop() } }),
  });

  if (!startRes.ok) {
    const msg = await startRes.text();
    console.error('Gemini upload start failed', msg);
    return Response.json({ error: 'Gemini upload start failed', detail: msg }, { status: 502, headers: cors(request) });
  }

  const uploadUrl = startRes.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) {
    return Response.json({ error: 'Upload URL missing' }, { status: 502, headers: cors(request) });
  }

  // -------------------------------------------------------------------------
  // 2. Resumable Upload – "upload, finalize" --------------------------------
  // -------------------------------------------------------------------------
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/pdf',
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'upload, finalize',
      'X-Goog-Upload-Offset': '0',
    },
    body: obj.body, // stream direkt weiterleiten
  });

  if (!uploadRes.ok) {
    const msg = await uploadRes.text();
    console.error('Gemini upload failed', msg);
    return Response.json({ error: 'Gemini upload failed', detail: msg }, { status: 502, headers: cors(request) });
  }

  let fileUri: string | undefined;
  try {
    const { uri } = (await uploadRes.json()).file ?? {};
    fileUri = uri;
  } catch {
    /* ignore */
  }
  if (!fileUri) return Response.json({ error: 'file_uri missing' }, { status: 502, headers: cors(request) });

  // -------------------------------------------------------------------------
  // 3. streamGenerateContent --------------------------------------------------
  // -------------------------------------------------------------------------
  // URL-decodierte Benutzerfrage verwenden
  const decodedQuestion = decodeURIComponent(question);
  console.log('Verarbeite Frage:', decodedQuestion);
  
  const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:streamGenerateContent?key=${env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: decodedQuestion },
            { file_data: { mime_type: 'application/pdf', file_uri: fileUri } },
          ],
        },
      ],
      generationConfig: { 
        temperature: 0.3, 
        maxOutputTokens: 1024 // Erhöhen des Token-Limits für längere Antworten
      },
    }),
  });

  if (!geminiRes.ok) {
    const msg = await geminiRes.text();
    console.error('Gemini summary failed', msg);
    return Response.json({ error: 'Gemini summary failed', detail: msg }, { status: 502, headers: cors(request) });
  }

  const answer = await parseGeminiSSE(geminiRes);

  // -------------------------------------------------------------------------
  // 4. Supabase persistieren --------------------------------------------------
  // -------------------------------------------------------------------------
  const supabase = createSupabase(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const metadata = { 
    key, 
    size: obj.size, 
    processed_at: new Date().toISOString(), 
    question: decodedQuestion, 
    answer 
  };
  
  try {
    const { error } = await supabase.from('pdf_metadata').insert(metadata);
    if (error) console.error('Supabase insert error', error);
  } catch (err) {
    console.error('Supabase error', err);
  }

  // -------------------------------------------------------------------------
  // 5. Cache + Antwort --------------------------------------------------------
  // -------------------------------------------------------------------------
  // Antwortstruktur, wie sie vom Frontend erwartet wird
  const responseData = { 
    ...metadata,
    answer: answer  // Das Feld "answer" muss auf der obersten Ebene sein
  };
  
  cache.set(cacheKey, { last: Date.now(), data: responseData });
  return Response.json(responseData, { headers: cors(request) });
};
