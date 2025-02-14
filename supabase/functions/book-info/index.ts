import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin":
    "https://musing-galois3-hcdlb.dev-2.tempolabs.ai",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    const { isbn } = await req.json();
    if (!isbn) {
      return new Response(JSON.stringify({ error: "ISBN is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          {
            role: "system",
            content:
              "Du bist ein präziser Buchinformations-Assistent. Deine Aufgabe ist es, genaue Daten zu Büchern basierend auf ihrer ISBN zu liefern. Antworte ausschließlich mit einem validen JSON-Objekt.",
          },
          {
            role: "user",
            content: `Suche nach dem Buch mit der ISBN ${isbn}. Gib die Informationen ausschließlich als valides JSON-Objekt zurück, ohne zusätzlichen Text. Das JSON sollte folgende Felder enthalten: 'Titel', 'Autor', 'ISBN', 'Stufe' (KiGa, Unterstufe, Mittelstufe, Oberstufe), 'Fach' (Mathematik, Deutsch, Französisch, NMG, Sport, Musik, Englisch, Bildnerisches Gestalten, TTG, Divers), 'Erscheinungsjahr'. Wenn eine Information nicht verfügbar ist, verwende null als Wert.`,
          },
        ],
        max_tokens: 1000,
        temperature: 0.1,
        top_p: 0.95,
      }),
    });

    if (!response.ok) {
      throw new Error(`Perplexity API error: ${response.statusText}`);
    }

    const result = await response.json();
    console.log("Raw API response:", result);

    if (!result.choices?.[0]?.message?.content) {
      console.error("Invalid API response structure:", result);
      throw new Error("Invalid API response structure");
    }

    const content = result.choices[0].message.content;
    console.log("Content from API:", content);

    // Ensure we have valid JSON
    let bookData;
    try {
      // Remove any potential markdown formatting
      const cleanContent = content.replace(/```json\n?|```/g, "").trim();
      console.log("Cleaned content:", cleanContent);
      bookData = JSON.parse(cleanContent);
    } catch (e) {
      console.error("Failed to parse JSON:", content);
      return new Response(
        JSON.stringify({
          error: "Invalid JSON response from AI",
          content: content,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }

    // Set default values for missing fields
    const defaultValues = {
      Titel: null,
      Autor: null,
      ISBN: isbn,
      Stufe: null,
      Fach: null,
      Erscheinungsjahr: null,
    };

    bookData = { ...defaultValues, ...bookData };

    return new Response(JSON.stringify(bookData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
