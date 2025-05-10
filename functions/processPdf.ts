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

/* ---------- utils: stream → base64 (chunked) ---------- */
function uint8ToBase64(u8: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin);
}

async function streamToBase64(readable: ReadableStream<Uint8Array>): Promise<string> {
  const reader = readable.getReader();
  let leftover = new Uint8Array(0);
  let base64 = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (leftover.length) {
      // concat leftover + new chunk to ensure 3‑byte alignment for base64
      const merged = new Uint8Array(leftover.length + value!.length);
      merged.set(leftover);
      merged.set(value!, leftover.length);
      value = merged;
      leftover = new Uint8Array(0);
    }
    const remainder = value!.length % 3;
    const bytesToEncode = remainder ? value!.slice(0, value!.length - remainder) : value!;
    base64 += uint8ToBase64(bytesToEncode);
    leftover = remainder ? value!.slice(value!.length - remainder) : new Uint8Array(0);
  }
  if (leftover.length) base64 += uint8ToBase64(leftover);
  return base64;
}

/* ---------- parse Gemini stream ---------- */
async function parseGeminiStream(res: Response): Promise<string> {
  if (!res.body) throw new Error('no body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let summary = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('
');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;
      try {
        const obj = JSON.parse(data);
        const text = obj.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) summary += text;
      } catch {
        /* ignore JSON parse errors for keep‑alive lines */
      }
    }
  }
  return summary.trim();
}

/* ---------- cache (in‑memory, 1 h) ---------- */
interface Cached { last: number; data: unknown }
const cache = new Map<string, Cached>();
const MAX_AGE = 1000 * 60 * 60;

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
  } catch (e) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: getCorsHeaders(request) });
  }

  /* ---------- params ---------- */
  const key = new URL(request.url).searchParams.get('key');
  if (!key) return Response.json({ error: 'Missing "key" query param' }, { status: 400, headers: getCorsHeaders(request) });

  const cached = cache.get(key);
  const now = Date.now();
  if (cached && now - cached.last < MAX_AGE) {
    cached.last = now;
    return Response.json(cached.data, { headers: getCorsHeaders(request) });
  }

  /* ---------- fetch PDF (stream) ---------- */
  let object: R2ObjectBody | null;
  try {
    object = await env.R2_BUCKET_BINDING.get(key);
    if (!object) return Response.json({ error: 'File not found' }, { status: 404, headers: getCorsHeaders(request) });
  } catch (err) {
    console.error('R2 error', err);
    return Response.json({ error: 'R2 fetch failed' }, { status: 500, headers: getCorsHeaders(request) });
  }

  const base64Pdf = await streamToBase64(object.body!);

  /* ---------- call Gemini ---------- */
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:streamGenerateContent?key=${env.GEMINI_API_KEY}`;
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
    generationConfig: {
      responseMimeType: 'text/plain',
    },
    tools: [{ googleSearch: {} }],
  };

  let summary = '';
  try {
    const gRes = await fetch(url, {
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

  /* ---------- persist & cache ---------- */
  const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const metadata = { key, size: object.size, processed_at: new Date().toISOString(), summary };
  try {
    const { error } = await supabase.from('pdf_metadata').insert(metadata);
    if (error) console.error('Supabase insert error', error);
  } catch (err) {
    console.error('Supabase error', err);
  }

  cache.set(key, { last: Date.now(), data: metadata });
  return Response.json(metadata, { headers: getCorsHeaders(request) });
};
