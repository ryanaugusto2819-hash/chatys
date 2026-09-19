import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function responseErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim()) return record.message;
    if (typeof record.error === "string" && record.error.trim()) return record.error;
    if (record.error && typeof record.error === "object") {
      const nested = record.error as Record<string, unknown>;
      if (typeof nested.message === "string" && nested.message.trim()) return nested.message;
    }
  }
  return `Falha na tradução (${status})`;
}

async function readTranslationStream(response: Response): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let translation = "";
  let completedText = "";

  const processEvent = (rawEvent: string) => {
    const dataLine = rawEvent
      .split("\n")
      .find((line) => line.startsWith("data:"));
    if (!dataLine) return;
    const rawData = dataLine.slice(5).trim();
    if (!rawData || rawData === "[DONE]") return;

    try {
      const event = JSON.parse(rawData);
      if (event?.type === "response.output_text.delta" && typeof event.delta === "string") {
        translation += event.delta;
      }
      if (event?.type === "response.completed") {
        const terminalText = event?.response?.output_text;
        if (typeof terminalText === "string") completedText = terminalText;
      }
      if (event?.type === "error") {
        throw new Error(responseErrorMessage(event, 502));
      }
    } catch (error) {
      if (error instanceof SyntaxError) return;
      throw error;
    }
  };

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, "\n");
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    for (const event of events) processEvent(event);
  }
  buffer += decoder.decode().replace(/\r\n/g, "\n");
  if (buffer.trim()) processEvent(buffer);

  return (translation || completedText).trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const text = body?.text;
    const requestedTarget = String(body?.target || "es-MX").trim().toLowerCase();
    const target = requestedTarget.startsWith("pt") || requestedTarget.includes("portugu") ? "pt-BR" : "es-MX";
    if (!text || typeof text !== "string" || !text.trim()) {
      return new Response(JSON.stringify({ error: "Texto vazio" }), {
        status: 400, headers: jsonHeaders,
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
        status: 500, headers: jsonHeaders,
      });
    }

    const systemPrompt = target === "pt-BR"
      ? "Você é um tradutor profissional nativo do Brasil. Sua única tarefa é traduzir qualquer texto recebido para PORTUGUÊS BRASILEIRO. É proibido responder em inglês ou espanhol. Se o texto já estiver em português brasileiro, devolva-o inalterado. Preserve emojis, quebras de linha, links, números e formatação de WhatsApp. Responda somente com a tradução final, sem aspas e sem explicações."
      : "Eres un traductor profesional nativo de México. Traduce fielmente el texto recibido al ESPAÑOL DE MÉXICO natural y claro. Conserva exactamente el significado, la intención, el tono, el nivel de formalidad y toda la información original. No resumas, no expliques, no censures, no suavices, no intensifiques, no corrijas hechos y no agregues contenido. Mantén intactos nombres propios, marcas, teléfonos, importes, monedas, fechas, enlaces, códigos, emojis, saltos de línea y el formato de WhatsApp. Usa vocabulario mexicano neutral y evita regionalismos de otros países, incluido el voseo. Si el texto ya está en español de México, devuélvelo sin cambios. Responde únicamente con la traducción final, sin comillas ni comentarios.";

    const userContent = target === "pt-BR"
      ? `IDIOMA OBRIGATÓRIO DE SAÍDA: português brasileiro (pt-BR).\nNÃO escreva em inglês. NÃO escreva em espanhol.\n\nTexto original:\n${text}`
      : `IDIOMA OBLIGATORIO DE SALIDA: español de México (es-MX).\nTRADUCCIÓN LITERAL Y FIEL: conserva toda la información, intención, tono y formato. No agregues ni elimines nada.\nNO uses voseo ni expresiones rioplatenses. NO escribas en inglés ni en portugués.\n\nTexto original:\n${text}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
      }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(async () => ({ message: await res.text().catch(() => "") }));
      return new Response(JSON.stringify({ error: responseErrorMessage(payload, res.status) }), {
        status: res.status, headers: jsonHeaders,
      });
    }

    const translation = await readTranslationStream(res);
    if (!translation) {
      return new Response(JSON.stringify({ error: "A tradução terminou sem produzir texto." }), {
        status: 502, headers: jsonHeaders,
      });
    }

    return new Response(JSON.stringify({ translation }), {
      headers: jsonHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: jsonHeaders,
    });
  }
});

