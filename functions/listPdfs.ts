// ----------------------------------------------
// functions/lisPdfs.ts
// Cloudflare Pages Function – list objects in an R2 bucket
// ----------------------------------------------
import type { PagesFunction } from '@cloudflare/workers-types';
import { createClerkClient } from '@clerk/backend';

interface Env {
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

  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Vary', 'Origin');

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }
  return headers;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  /* ---------- CORS pre‑flight ---------- */
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }

  if (request.method !== 'GET') {
    return Response.json(
      { error: 'Method not allowed' },
      { status: 405, headers: getCorsHeaders(request) },
    );
  }

  /* ---------- Clerk Auth ---------- */
  const clerk = createClerkClient({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.VITE_CLERK_PUBLISHABLE_KEY,
  });

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

  /* ---------- List objects in R2 ---------- */
  const url = new URL(request.url);
  const prefix = url.searchParams.get('prefix') || url.searchParams.get('path') || undefined;

  try {
    const listOptions: R2ListOptions = {
      prefix,
      limit: 1000,
    };

    const listed = await env.R2_BUCKET_BINDING.list(listOptions);

    const files = listed.objects.map((o) => ({
      name: o.key,
      size: o.size,
      lastModified: o.uploaded,
      etag: o.httpEtag || o.etag,
    }));

    const responseHeaders = getCorsHeaders(request);
    responseHeaders.set('Cache-Control', 'no-store');
    return Response.json({ files }, { headers: responseHeaders });
  } catch (error: any) {
    console.error('R2 list error:', error);
    return Response.json(
      {
        error: error.message || 'Unexpected error',
        details: env.NODE_ENV === 'development' ? error.toString() : undefined,
      },
      { status: 500, headers: getCorsHeaders(request) },
    );
  }
};

