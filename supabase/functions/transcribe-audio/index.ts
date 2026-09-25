import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod";

const headers = { ...corsHeaders, "Content-Type": "application/json" };
const MODEL = "google/gemini-3.5-transcribe";
const MAX_AUDIO_BYTES = 14 * 1024 * 1024;
const BodySchema = z.object({
  audioUrl: z.string().url(),
  conversationId: z.string().uuid().optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { audioUrl, conversationId } = parsed.data;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json({ error: "A transcrição de áudio não está configurada" }, 401);

    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) return json({ error: `Não foi possível baixar o áudio (${audioResponse.status})` }, 502);
    const audio = await audioResponse.blob();
    if (!audio.size) return json({ error: "O áudio recebido está vazio" }, 400);
    if (audio.size > MAX_AUDIO_BYTES) return json({ error: "O áudio ultrapassa o limite de 14 MB" }, 400);

    const mimeType = audio.type.startsWith("audio/") ? audio.type.split(";")[0] : "audio/ogg";
    const extension = mimeType.includes("mpeg") ? "mp3" : mimeType.includes("wav") ? "wav" : mimeType.includes("webm") ? "webm" : mimeType.includes("mp4") ? "m4a" : "ogg";
    const form = new FormData();
    form.append("model", MODEL);
    form.append("file", new File([audio], `audio.${extension}`, { type: mimeType }));
    form.append("response_format", "json");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}` },
      body: form,
    });
    if (!aiResponse.ok) {
      const raw = await aiResponse.text();
      let safeMessage = raw;
      try {
        const error = JSON.parse(raw) as { message?: string; error?: string | { message?: string } };
        safeMessage = error.message || (typeof error.error === "string" ? error.error : error.error?.message) || raw;
      } catch { /* Preserve the gateway's safe response text. */ }
      return json({ error: safeMessage || "Falha ao transcrever o áudio" }, aiResponse.status);
    }

    const result = await aiResponse.json() as { text?: string; usage?: { seconds?: number } };
    const transcription = result.text?.trim();
    if (!transcription) return json({ error: "O áudio não contém fala reconhecível" }, 400);

    if (conversationId) {
      const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await service.from("ai_usage_logs").insert({
        function_name: "transcribe-audio",
        model: MODEL,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        conversation_id: conversationId,
      });
    }
    return json({ success: true, transcription });
  } catch (error) {
    console.error("[transcribe-audio]", error);
    return json({ error: error instanceof Error ? error.message : "Falha interna ao transcrever o áudio" }, 500);
  }
});