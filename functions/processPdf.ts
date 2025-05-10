// ----------------------------------------------
// functions/processPdf.ts
// Cloudflare Pages Function – process a single PDF located in R2
// ----------------------------------------------
import type { PagesFunction } from '@cloudflare/workers-types';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/generative-ai';
import { createClerkClient } from '@clerk/backend';

interface Env {
  VITE_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GEMINI_API_KEY: string;
  CLERK_SECRET_KEY: string;
  VITE_CLERK_PUBLISHABLE_KEY: string;
  R2_BUCKET_NAME_ENV?: string;
  R2_BUCKET_BINDING: R2Bucket;
  NODE_ENV?: string;
}

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
  const origin = request.headers.get('Origin');

  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Vary', 'Origin');

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }
  return headers;
}

interface CachedMetadata {
  lastAccessed: number;
  metadata: unknown;
}

const metadataCache = new Map<string, CachedMetadata>();
const MAX_CACHE_AGE = 1000 * 60 * 60; // 1 h

function cleanupMetadataCache() {
  const now = Date.now();
  for (const [key, cacheEntry] of metadataCache.entries()) {
    if (now - cacheEntry.lastAccessed > MAX_CACHE_AGE) {
      metadataCache.delete(key);
    }
  }
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  /* ---------- CORS pre‑flight ---------- */
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return Response.json(
      { error: 'Method not allowed' },
      { status: 405, headers: getCorsHeaders(request) },
    );
  }

  /* ---------- Clerk + Supabase + Gemini setup ---------- */
  const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const genAI = new GoogleGenAI(env.GEMINI_API_KEY);
  const clerk = createClerkClient({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.VITE_CLERK_PUBLISHABLE_KEY,
  });

  /* ---------- Auth ---------- */
  try {
    const authHeader = request.headers.get('Authorization');
    let isSignedIn = false;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const clerkRequest = new Request(request.url, { headers: request.headers, method: request.method });
      const authResult = await clerk.authenticateRequest(clerkRequest.clone(), { authorizedParties: ALLOWED_ORIGINS });
      isSignedIn = authResult.isSignedIn;
    } else {
      const authResult = await clerk.authenticateRequest(request.clone(), { authorizedParties: ALLOWED_ORIGINS });
      isSignedIn = authResult.isSignedIn;
    }

    if (!isSignedIn) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: getCorsHeaders(request) });
    }
  } catch (authError: any) {
    console.error('Authentication error:', authError.message);
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: getCorsHeaders(request) });
  }

  /* ---------- Parse request ---------- */
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) {
    return Response.json({ error: 'Missing "key" query param' }, { status: 400, headers: getCorsHeaders(request) });
  }

  /* ---------- Cached metadata ---------- */
  const now = Date.now();
  const cached = metadataCache.get(key);
  if (cached && now - cached.lastAccessed < MAX_CACHE_AGE) {
    cached.lastAccessed = now;
    return Response.json(cached.metadata, { headers: getCorsHeaders(request) });
  }

  /* ---------- Fetch PDF from R2 ---------- */
  let object: R2ObjectBody | null = null;
  try {
    object = await env.R2_BUCKET_BINDING.get(key);
    if (!object) {
      return Response.json({ error: 'File not found' }, { status: 404, headers: getCorsHeaders(request) });
    }
  } catch (err) {
    console.error('R2 get error', err);
    return Response.json({ error: 'Failed to fetch file' }, { status: 500, headers: getCorsHeaders(request) });
  }

  /* ---------- Process PDF with Gemini or other logic ---------- */
  // NOTE: Implement your PDF‑processing logic here.  As the original code
  // used Google Gen‑AI, Supabase, etc., copy that logic into this block.
  // For brevity this sample stores the object size only.

  const metadata = {
    key,
    size: object.size,
    processedAt: new Date().toISOString(),
  };

  /* ---------- Cache & persist ---------- */
  metadataCache.set(key, { lastAccessed: Date.now(), metadata });

  try {
    const { error: dbError } = await supabase.from('pdf_metadata').insert(metadata);
    if (dbError) console.error('Supabase insert error', dbError);
  } catch (dbErr) {
    console.error('Supabase error', dbErr);
  }

  return Response.json(metadata, { headers: getCorsHeaders(request) });
};