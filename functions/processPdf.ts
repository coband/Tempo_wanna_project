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
// SSE‑Parser: Extrahiert und kombiniert Text aus JSON-Blöcken
async function parseGeminiSSE(res: Response): Promise<string> {
  console.log("Parsen der Gemini-Antwort beginnt...");
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let rawText = "";
  
  try {
    // Sammle den gesamten Rohtext
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // Dekodiere den Chunk und füge ihn zum gesammelten Text hinzu
      const chunk = decoder.decode(value, { stream: true });
      rawText += chunk;
    }
    
    // Extrahiere alle JSON-Objekte 
    // Gemini antwortet im Format: Objekt1, Objekt2, Objekt3, ...
    const combinedText: string[] = [];
    
    // Versuche, den Text als JSON-Array zu parsen
    // Die rohe Antwort beginnt mit '[' und endet mit ']'
    try {
      // Wenn es wie ein Array aussieht, versuche es als Array zu parsen
      if (rawText.trim().startsWith('[') && rawText.trim().endsWith(']')) {
        const jsonArray = JSON.parse(rawText) as any[];
        console.log(`Gefundene JSON-Objekte: ${jsonArray.length}`);
        
        // Durchlaufe alle Objekte im Array
        for (const jsonObj of jsonArray) {
          // Extrahiere Text aus candidates[0].content.parts[].text
          if (jsonObj.candidates && 
              jsonObj.candidates[0] && 
              jsonObj.candidates[0].content &&
              jsonObj.candidates[0].content.parts) {
            
            for (const part of jsonObj.candidates[0].content.parts) {
              if (part.text) {
                combinedText.push(part.text);
              }
            }
          }
        }
      } else {
        // Alternativ: Suche nach einzelnen JSON-Objekten im Text
        // Muster: Ein JSON-Objekt pro Zeile nach "data: "
        const jsonPattern = /data:\s*({.*?})\n/g;
        const matches = Array.from(rawText.matchAll(jsonPattern));
        
        console.log(`Gefundene JSON-Objekte mit Regex: ${matches.length}`);
        
        for (const match of matches) {
          try {
            const jsonObj = JSON.parse(match[1]);
            
            // Extrahiere Text aus candidates[0].content.parts[].text
            if (jsonObj.candidates && 
                jsonObj.candidates[0] && 
                jsonObj.candidates[0].content &&
                jsonObj.candidates[0].content.parts) {
              
              for (const part of jsonObj.candidates[0].content.parts) {
                if (part.text) {
                  combinedText.push(part.text);
                }
              }
            }
          } catch (e) {
            console.warn("Fehler beim Parsen eines JSON-Objekts:", e);
          }
        }
      }
    } catch (e) {
      console.warn("Fehler beim Parsen des JSON-Arrays:", e);
      
      // Fallback: Versuche, die JSON-Objekte einzeln zu parsen
      // Trenne den Text an Kommas, die zwischen den JSON-Objekten stehen könnten
      const parts = rawText.split('} , {');
      const jsonBlocks: string[] = parts.map((block, i) => {
        // Erster Block beginnt mit '['
        if (i === 0) return block.startsWith('[') ? block : '{' + block;
        // Letzter Block endet mit ']'
        if (i === parts.length - 1) return block.endsWith(']') ? block : block + '}';
        // Mittlere Blöcke
        return '{' + block + '}';
      });
      
      console.log(`Gefundene JSON-Blöcke durch Splitting: ${jsonBlocks.length}`);
      
      for (const block of jsonBlocks) {
        try {
          const jsonObj = JSON.parse(block) as any;
          
          // Extrahiere Text aus candidates[0].content.parts[].text
          if (jsonObj.candidates && 
              jsonObj.candidates[0] && 
              jsonObj.candidates[0].content &&
              jsonObj.candidates[0].content.parts) {
            
            for (const part of jsonObj.candidates[0].content.parts) {
              if (part.text) {
                combinedText.push(part.text);
              }
            }
          }
        } catch (e) {
          // Ignoriere fehlerhafte JSON-Blöcke
        }
      }
    }
    
    // Kombiniere alle gefundenen Textteile
    const resultText = combinedText.join("");
    
    if (!resultText.trim()) {
      console.warn("Keine Textteile extrahiert, verwende Fallback-Text");
      return "Es tut mir leid, aber ich konnte keine Informationen zu diesem PDF extrahieren. Bitte versuche es mit einer anderen Frage oder einem anderen PDF.";
    }
    
    console.log("Extrahierter Text:", resultText.substring(0, 200) + (resultText.length > 200 ? '...' : ''));
    return resultText;
  } catch (error) {
    console.error("Fehler beim Parsen der Gemini-Antwort:", error);
    return "Es ist ein Fehler beim Verarbeiten der Anfrage aufgetreten. Bitte versuche es später noch einmal.";
  }
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
        maxOutputTokens: 4096, // Erhöhung des Ausgabe-Limits für deutlich längere Antworten
        responseMimeType: "text/plain"
      },
    }),
  });

  if (!geminiRes.ok) {
    const msg = await geminiRes.text();
    console.error('Gemini summary failed', msg);
    return Response.json({ error: 'Gemini summary failed', detail: msg }, { status: 502, headers: cors(request) });
  }

  const answer = await parseGeminiSSE(geminiRes);
  
  // Fallback für leere Antworten
  const finalAnswer = answer.trim() 
    ? answer 
    : "Es tut mir leid, aber ich konnte keine Informationen zu diesem PDF extrahieren. Bitte versuche es mit einer anderen Frage oder einem anderen PDF.";

  // -------------------------------------------------------------------------
  // 4. Supabase persistieren --------------------------------------------------
  // -------------------------------------------------------------------------
  try {
    const supabase = createSupabase(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const metadata = { 
      key, 
      size: obj.size, 
      processed_at: new Date().toISOString(), 
      question: decodedQuestion, 
      answer: finalAnswer 
    };
    
    // Wir fangen Supabase-Fehler ab, aber lassen sie die Hauptfunktionalität nicht beeinflussen
    try {
      const { error } = await supabase.from('pdf_metadata').insert(metadata);
      if (error) console.error('Supabase insert error', error);
    } catch (err) {
      console.error('Supabase error', err);
      // Wir ignorieren Supabase-Fehler, da sie für die Hauptfunktionalität nicht kritisch sind
    }

    // -------------------------------------------------------------------------
    // 5. Cache + Antwort --------------------------------------------------------
    // -------------------------------------------------------------------------
    // Vereinfachte Antwortstruktur, die nur das Wichtigste enthält
    const responseData = {
      answer: finalAnswer, // Das einzige, was das Frontend wirklich braucht
      key: key,       // Optional für Debug-Zwecke
      question: decodedQuestion // Optional für Debug-Zwecke
    };
    
    // Im Cache speichern
    cache.set(cacheKey, { last: Date.now(), data: responseData });
    
    // Zum Debuggen die Antwort in die Konsole schreiben
    console.log("Sende Antwort:", JSON.stringify(responseData).substring(0, 100) + "...");
    
    // -------------------------------------------------------------------------
    // 5. Datei aus Gemini File API löschen ---------------------------------
    // -------------------------------------------------------------------------
    try {
      // Extrahieren des Dateinamens aus der URI (format: files/abc-123)
      const fileName = fileUri.split('/').pop();
      const fileApiName = `files/${fileName}`;
      
      console.log(`Lösche Datei von Gemini File API: ${fileApiName}`);
      
      const deleteRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileApiName}?key=${env.GEMINI_API_KEY}`, {
        method: 'DELETE',
      });
      
      if (deleteRes.ok) {
        console.log(`Datei ${fileApiName} erfolgreich gelöscht`);
      } else {
        const errorMsg = await deleteRes.text();
        console.error(`Fehler beim Löschen der Datei ${fileApiName}:`, errorMsg);
      }
    } catch (deleteError) {
      console.error("Fehler beim Löschen der Datei:", deleteError);
      // Wir ignorieren Fehler beim Löschen, um die Hauptfunktionalität nicht zu beeinträchtigen
    }
    
    return Response.json(responseData, { headers: cors(request) });
  } catch (finalError) {
    console.error("Unerwarteter Fehler:", finalError);
    return Response.json({ 
      error: "Unerwarteter Fehler beim Verarbeiten der Anfrage", 
      details: finalError.message 
    }, { status: 500, headers: cors(request) });
  }
};
