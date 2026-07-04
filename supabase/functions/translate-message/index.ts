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
      ? "Eres un traductor profesional. Traduce el texto del usuario al español rioplatense usado en Uruguay (voseo cuando sea natural, vocabulario uruguayo). Mantén emojis, saltos de línea, formato de WhatsApp (*negrita*, _itálica_) y el tono original (informal o formal). Responde SOLO con la traducción al ESPAÑOL, NUNCA en inglés ni en portugués, sin comillas, sin comentarios, sin explicaciones."
      : target === "pt-BR"
        ? "Traduza QUALQUER texto recebido para PORTUGUÊS BRASILEIRO (pt-BR). NUNCA responda em inglês, espanhol ou qualquer outro idioma. Se o texto já estiver em português, devolva-o inalterado. Mantenha emojis, quebras de linha e formatação do WhatsApp (*negrito*, _itálico_). Responda SOMENTE com a tradução em português brasileiro, sem aspas, sem comentários, sem explicações."
        : "You are a professional translator. Translate the user's text. Respond ONLY with the translation.";

    const userContent = target === "pt-BR"
      ? `Traduza para PORTUGUÊS BRASILEIRO (pt-BR). Não use inglês.\n\nTexto:\n${text}`
      : target === "es-UY"
        ? `Traducí al ESPAÑOL rioplatense de Uruguay. NO uses inglés ni portugués.\n\nTexto:\n${text}`
        : text;

    async function callGateway(sys: string, usr: string) {
      return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: sys },
            { role: "user", content: usr },
          ],
        }),
      });
    }

    let res = await callGateway(systemPrompt, userContent);

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

    let data = await res.json();
    let translation = data?.choices?.[0]?.message?.content?.trim() ?? "";

    // Detecta idioma errado e refaz
    function looksEnglish(t: string) {
      const lower = ` ${t.toLowerCase()} `;
      const hits = [" the ", " you ", " are ", " is ", " and ", " with ", " going ", " not ", " for ", " about ", " think ", " easy "].filter(w => lower.includes(w)).length;
      return hits >= 2;
    }
    function looksPortuguese(t: string) {
      const lower = ` ${t.toLowerCase()} `;
      return /[ãõçâê]/.test(lower) || [" você ", " não ", " está ", " então ", " também ", " aceitar ", " depois "].some(w => lower.includes(w));
    }
    function looksSpanish(t: string) {
      const lower = ` ${t.toLowerCase()} `;
      return /[ñ¿¡]/.test(lower) || [" usted ", " vos ", " está ", " después ", " propuesta ", " pensar ", " fácil "].some(w => lower.includes(w));
    }

    const wrongLang =
      (target === "pt-BR" && (looksEnglish(translation) || (!looksPortuguese(translation) && looksSpanish(translation)))) ||
      (target === "es-UY" && (looksEnglish(translation) || (!looksSpanish(translation) && looksPortuguese(translation))));

    if (wrongLang) {
      const retrySys = target === "pt-BR"
        ? "Você é um tradutor. Responda APENAS em PORTUGUÊS BRASILEIRO. Proibido inglês e espanhol."
        : "Sos un traductor. Respondé SOLO en ESPAÑOL rioplatense. Prohibido inglés y portugués.";
      const retryUsr = target === "pt-BR"
        ? `Traduza este texto para PORTUGUÊS BRASILEIRO. Devolva SOMENTE a tradução em português, sem inglês:\n\n${text}`
        : `Traducí este texto al ESPAÑOL rioplatense de Uruguay. Devolvé SOLO la traducción en español, sin inglés:\n\n${text}`;
      const res2 = await callGateway(retrySys, retryUsr);
      if (res2.ok) {
        const data2 = await res2.json();
        const t2 = data2?.choices?.[0]?.message?.content?.trim() ?? "";
        if (t2) translation = t2;
      }
    }

    return new Response(JSON.stringify({ translation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

