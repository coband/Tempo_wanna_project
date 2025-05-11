// ----------------------------------------------
// functions/processPdf.ts
// Cloudflare Pages Function – process a single PDF via Gemini REST (streamGenerateContent)
// ----------------------------------------------
import type { PagesFunction } from '@cloudflare/workers-types';
import { createClient } from '@supabase/supabase-js';
import { createClerkClient } from '@clerk/backend';

interface Env {
  VITE_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GEMINI_API_KEY: string;
  CLERK_SECRET_KEY: string;
  VITE_CLERK_PUBLISHABLE_KEY: string;
  R2_BUCKET_BINDING: R2Bucket;
  NODE_ENV?: string;
}

const MODEL_ID = 'gemini-2.5-flash-preview-04-17';
const MAX_CACHE_AGE = 1000 * 60 * 60; // 1h

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://www.wanna-books.ch',
  'https://wanna-books.ch',
  'https://tempo-wanna-project.vercel.app',
  'https://tempo-wanna-project-cornelbandli.vercel.app',
  'https://tempo-wanna-project.pages.dev',
];

function getCorsHeaders(request: Request): Headers {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Vary', 'Origin');
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

/* ---------- utils: stream → Base64 (chunk‑safe) ---------- */
function uint8ToBase64(u8: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
  return btoa(binary);
}

async function streamToBase64(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  let leftover = new Uint8Array(0);
  let base64 = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    let chunk = value!;

    // concat with leftover to ensure 3‑byte alignment
    if (leftover.length) {
      const merged = new Uint8Array(leftover.length + chunk.length);
      merged.set(leftover);
      merged.set(chunk, leftover.length);
      chunk = merged;
      leftover = new Uint8Array(0);
    }

    const remainder = chunk.length % 3;
    const bytesToEncode = remainder ? chunk.slice(0, chunk.length - remainder) : chunk;
    base64 += uint8ToBase64(bytesToEncode);
    leftover = remainder ? chunk.slice(chunk.length - remainder) : leftover;
  }
  if (leftover.length) base64 += uint8ToBase64(leftover);
  return base64;
}

/* ---------- parse Gemini SSE stream ---------- */
async function parseGeminiStream(res: Response): Promise<string> {
  if (!res.body) throw new Error('No response body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let summary = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer = (buffer + decoder.decode(value, { stream: true })).replace(/
?/g, '
');

    const lines = buffer.split('
');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;
      try {
        const payload = JSON.parse(data);
        const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) summary += text;
      } catch {
        /* ignore malformed lines */
      }
    }
  }
  return summary.trim();
}

/* ---------- simple in‑memory cache ---------- */
interface CacheEntry { last: number; data: unknown }
const cache = new Map<string, CacheEntry>();

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  if (!['GET', 'POST'].includes(request.method)) {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: getCorsHeaders(request) });
  }

  /* ---------- Clerk auth ---------- */
  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY, publishableKey: env.VITE_CLERK_PUBLISHABLE_KEY });
  try {
    const auth = await clerk.authenticateRequest(request.clone(), { authorizedParties: ALLOWED_ORIGINS });
    if (!auth.isSignedIn) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: getCorsHeaders(request) });
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: getCorsHeaders(request) });
  }

  /* ---------- query param ---------- */
  const key = new URL(request.url).searchParams.get('key');
  if (!key) return Response.json({ error: 'Missing "key" query param' }, { status: 400, headers: getCorsHeaders(request) });

  /* ---------- cache ---------- */
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.last < MAX_CACHE_AGE) {
    cached.last = now;
    return Response.json(cached.data, { headers: getCorsHeaders(request) });
  }

  /* ---------- fetch from R2 (stream) ---------- */
  let obj: R2ObjectBody | null = null;
  try {
    obj = await env.R2_BUCKET_BINDING.get(key);
    if (!obj) return Response.json({ error: 'File not found' }, { status: 404, headers: getCorsHeaders(request) });
  } catch (err) {
    console.error('R2 get error', err);
    return Response.json({ error: 'R2 fetch failed' }, { status: 500, headers: getCorsHeaders(request) });
  }

  const base64Pdf = await streamToBase64(obj.body!);

  /* ---------- Gemini call ---------- */
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
    generationConfig: { responseMimeType: 'text/plain' },
    tools: [{ googleSearch: {} }],
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

  /* ---------- persist in Supabase ---------- */
  const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const metadata = { key, size: obj.size, processed_at: new Date().toISOString(), summary };
  try {
    const { error } = await supabase.from('pdf_metadata').insert(metadata);
    if (error) console.error('Supabase insert error', error);
  } catch (err) {
    console.error('Supabase error', err);
  }

  cache.set(key, { last: Date.now(), data: metadata });
  return Response.json(metadata, { headers: getCorsHeaders(request) });
};