const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const text = body?.text;
    const requestedTarget = String(body?.target || "es-UY").trim().toLowerCase();
    const target = requestedTarget.startsWith("pt") || requestedTarget.includes("portugu") ? "pt-BR" : "es-UY";
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

    const systemPrompt = target === "pt-BR"
      ? "Você é um tradutor profissional nativo do Brasil. Sua única tarefa é traduzir qualquer texto recebido para PORTUGUÊS BRASILEIRO. É proibido responder em inglês ou espanhol. Se o texto já estiver em português brasileiro, devolva-o inalterado. Preserve emojis, quebras de linha, links, números e formatação de WhatsApp. Responda somente com a tradução final, sem aspas e sem explicações."
      : "Sos un traductor profesional nativo de Uruguay. Tu única tarea es traducir cualquier texto recibido al ESPAÑOL rioplatense usado en Uruguay. Está prohibido responder en inglés o portugués. Si el texto ya está en español rioplatense, devolvelo sin cambios. Mantené emojis, saltos de línea, links, números y formato de WhatsApp. Respondé solamente con la traducción final, sin comillas ni explicaciones.";

    const userContent = target === "pt-BR"
      ? `IDIOMA OBRIGATÓRIO DE SAÍDA: português brasileiro (pt-BR).\nNÃO escreva em inglês. NÃO escreva em espanhol.\n\nTexto original:\n${text}`
      : `IDIOMA OBLIGATORIO DE SALIDA: español rioplatense de Uruguay.\nNO escribas en inglés. NO escribas en portugués.\n\nTexto original:\n${text}`;

    async function callGateway(sys: string, usr: string) {
      return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Lovable-API-Key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          temperature: 0,
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
      const lower = ` ${t.toLowerCase().replace(/[’']/g, "'")} `;
      const hits = [" the ", " you ", " your ", " they ", " we ", " are ", " is ", " and ", " with ", " not ", " for ", " about ", " what ", " kind ", " guarantee ", " nothing ", " i'm ", " telling ", " product ", " expensive ", " charge "].filter(w => lower.includes(w)).length;
      return hits >= 2;
    }
    function looksPortuguese(t: string) {
      const lower = ` ${t.toLowerCase()} `;
      const hits = [" você ", " vocês ", " não ", " está ", " estão ", " então ", " também ", " depois ", " caro ", " cobram ", " fosse ", " garantia ", " dão ", " nada ", " produto "].filter(w => lower.includes(w)).length;
      return /[ãõçâêáéíóúà]/.test(lower) || hits >= 2;
    }
    function looksSpanish(t: string) {
      const lower = ` ${t.toLowerCase()} `;
      const hits = [" usted ", " vos ", " está ", " están ", " después ", " propuesta ", " pensar ", " fácil ", " caro ", " cobran ", " fuera ", " garantía ", " dan ", " nada ", " producto "].filter(w => lower.includes(w)).length;
      return /[ñ¿¡]/.test(lower) || hits >= 2;
    }

    const wrongLang =
      (target === "pt-BR" && (looksEnglish(translation) || (!looksPortuguese(translation) && looksSpanish(translation)))) ||
      (target === "es-UY" && (looksEnglish(translation) || (!looksSpanish(translation) && looksPortuguese(translation))));

    if (wrongLang) {
      const retrySys = target === "pt-BR"
        ? "Você é um tradutor nativo do Brasil. Responda APENAS em PORTUGUÊS BRASILEIRO. Proibido inglês e espanhol."
        : "Sos un traductor. Respondé SOLO en ESPAÑOL rioplatense. Prohibido inglés y portugués.";
      const retryUsr = target === "pt-BR"
        ? `Corrija o idioma. A resposta anterior saiu no idioma errado. Traduza este texto para PORTUGUÊS BRASILEIRO. Devolva SOMENTE a tradução em português brasileiro, sem inglês e sem espanhol:\n\n${text}`
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

