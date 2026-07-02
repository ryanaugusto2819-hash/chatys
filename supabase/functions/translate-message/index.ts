const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, target = "es-UY" } = await req.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      return new Response(JSON.stringify({ error: "Texto vazio" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = target === "es-UY"
      ? "Eres un traductor profesional. Traduce el texto del usuario al español rioplatense usado en Uruguay (voseo cuando sea natural, vocabulario uruguayo). Mantén emojis, saltos de línea, formato de WhatsApp (*negrita*, _itálica_) y el tono original (informal o formal). Responde SOLO con la traducción, sin comillas, sin comentarios, sin explicaciones."
      : target === "pt-BR"
        ? "Traduza QUALQUER texto recebido para PORTUGUÊS BRASILEIRO (pt-BR). NUNCA responda em inglês, espanhol ou qualquer outro idioma. Se o texto já estiver em português, devolva-o inalterado. Mantenha emojis, quebras de linha e formatação do WhatsApp (*negrito*, _itálico_). Responda SOMENTE com a tradução em português brasileiro, sem aspas, sem comentários, sem explicações."
        : "You are a professional translator. Translate the user's text. Respond ONLY with the translation.";



    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      }),
    });

    if (res.status === 429) {
      return new Response(JSON.stringify({ error: "Limite de uso atingido. Tente novamente em instantes." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (res.status === 402) {
      return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return new Response(JSON.stringify({ error: `Gateway error ${res.status}`, details: errText }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const translation = data?.choices?.[0]?.message?.content?.trim() ?? "";
    return new Response(JSON.stringify({ translation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
