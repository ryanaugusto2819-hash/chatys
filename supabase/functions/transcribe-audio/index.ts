import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audioUrl, conversationId } = await req.json();

    if (!audioUrl) {
      return new Response(
        JSON.stringify({ error: "audioUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "AI not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Download the audio file and convert to base64
    console.log(`[transcribe-audio] Downloading audio from: ${audioUrl}`);
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      console.error("Failed to download audio:", audioResponse.status);
      return new Response(
        JSON.stringify({ error: "Failed to download audio file" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const audioBlob = await audioResponse.arrayBuffer();
    const base64Audio = btoa(
      new Uint8Array(audioBlob).reduce((data, byte) => data + String.fromCharCode(byte), "")
    );

    // Detect mime type from URL or default to ogg
    let mimeType = "audio/ogg";
    if (audioUrl.includes(".mp3")) mimeType = "audio/mpeg";
    else if (audioUrl.includes(".aac")) mimeType = "audio/aac";
    else if (audioUrl.includes(".wav")) mimeType = "audio/wav";

    console.log(`[transcribe-audio] Audio size: ${audioBlob.byteLength} bytes, mime: ${mimeType}`);

    // Use Gemini multimodal to transcribe audio
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "Você é um transcritor de áudio. Transcreva o áudio exatamente como foi dito, em português brasileiro. Retorne APENAS a transcrição, sem comentários adicionais. Se o áudio estiver inaudível ou vazio, retorne '[Áudio inaudível]'.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Transcreva este áudio:",
              },
              {
                type: "input_audio",
                input_audio: {
                  data: base64Audio,
                  format:
                    mimeType === "audio/mpeg" ? "mp3"
                    : mimeType === "audio/wav" ? "wav"
                    : mimeType === "audio/aac" ? "aac"
                    : "ogg",
                },
              },
            ],
          },
        ],
        stream: false,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI transcription error:", aiResponse.status, errorText);

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Transcription failed" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await aiResponse.json();
    const transcription = aiResult.choices?.[0]?.message?.content?.trim() || "[Áudio inaudível]";

    console.log(`[transcribe-audio] Transcription: "${transcription.substring(0, 100)}..."`);

    // Log token usage
    const usage = aiResult.usage;
    if (usage) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      await supabase.from("ai_usage_logs").insert({
        function_name: "transcribe-audio",
        model: "google/gemini-2.5-flash",
        input_tokens: usage.prompt_tokens || 0,
        output_tokens: usage.completion_tokens || 0,
        total_tokens: usage.total_tokens || 0,
        conversation_id: conversationId || null,
      });
    }

    return new Response(
      JSON.stringify({ success: true, transcription }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Transcribe audio error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
