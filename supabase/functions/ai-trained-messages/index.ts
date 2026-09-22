import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { Output, streamText } from "npm:ai";
import { z } from "npm:zod";

const headers = { ...corsHeaders, "Content-Type": "application/json" };
const MatchSchema = z.object({
  matched_rule_id: z.string().nullable(),
  confidence: z.number(),
  reason: z.string(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function safeError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Falha desconhecida na IA de Mensagens Treinadas";
}

async function transcribeAudio(audioUrl: string, lovableKey: string) {
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    return { text: null, error: `Não foi possível baixar o áudio (${audioResponse.status})` };
  }
  const blob = await audioResponse.blob();
  if (!blob.size) return { text: null, error: "O áudio recebido está vazio" };
  if (blob.size > 14 * 1024 * 1024) return { text: null, error: "O áudio ultrapassa o limite de 14 MB para transcrição" };
  const mimeType = blob.type.startsWith("audio/") ? blob.type : "audio/ogg";
  const extension = mimeType.includes("mpeg") ? "mp3" : mimeType.includes("wav") ? "wav" : mimeType.includes("webm") ? "webm" : "ogg";
  const form = new FormData();
  form.append("model", "google/gemini-3.5-transcribe");
  form.append("file", new File([blob], `audio.${extension}`, { type: mimeType }));
  form.append("response_format", "json");
  const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}` },
    body: form,
  });
  if (!response.ok) {
    const raw = await response.text();
    let message = raw;
    try {
      const parsed = JSON.parse(raw) as { message?: string; error?: { message?: string } | string };
      message = parsed.message || (typeof parsed.error === "string" ? parsed.error : parsed.error?.message) || raw;
    } catch { /* preserve the upstream text */ }
    return { text: null, error: message || `A transcrição falhou (${response.status})` };
  }
  const result = await response.json() as { text?: string };
  const text = result.text?.trim();
  return text ? { text, error: null } : { text: null, error: "O áudio não contém fala reconhecível" };
}

async function resolveAudioUrl(service: { storage: { from: (bucket: string) => { createSignedUrl: (path: string, expiresIn: number) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }> } } }, mediaUrl: string) {
  try {
    const parsed = new URL(mediaUrl);
    const marker = "/chat-media/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return mediaUrl;
    const objectPath = decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
    const { data, error } = await service.storage.from("chat-media").createSignedUrl(objectPath, 600);
    if (error || !data?.signedUrl) throw new Error(error?.message || "Não foi possível liberar o áudio para leitura");
    return data.signedUrl;
  } catch (error) {
    if (error instanceof TypeError) return mediaUrl;
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!url || !serviceKey || !lovableKey) return json({ error: "Configuração segura indisponível" }, 500);

    const authorization = req.headers.get("Authorization") || "";
    if (authorization !== `Bearer ${serviceKey}`) return json({ error: "Acesso não autorizado" }, 401);

    const body = await req.json().catch(() => null);
    const sourceMessageId = typeof body?.sourceMessageId === "string" ? body.sourceMessageId : "";
    if (!sourceMessageId) return json({ error: "sourceMessageId é obrigatório" }, 400);

    const service = createClient(url, serviceKey);
    const { data: message, error: messageError } = await service
      .from("messages")
      .select("id, conversation_id, content, media_url, message_type, sender_type, created_at, conversations!inner(id, workspace_id, connection_config_id, funnel_stage, sale_registered_at, contact_phone)")
      .eq("id", sourceMessageId)
      .maybeSingle();
    if (messageError) return json({ error: messageError.message }, 500);
    if (!message || message.sender_type !== "customer") return json({ skipped: true, reason: "Mensagem de cliente não encontrada" });

    const conversation = message.conversations as unknown as {
      id: string; workspace_id: string; connection_config_id: string | null; funnel_stage: string | null;
      sale_registered_at: string | null; contact_phone: string;
    };
    const { data: config, error: configError } = await service
      .from("ai_agent_configs")
      .select("id, enabled, operation_mode, instructions")
      .eq("workspace_id", conversation.workspace_id)
      .eq("agent_key", "trained_messages")
      .is("niche_id", null)
      .maybeSingle();
    if (configError) return json({ error: configError.message }, 500);
    if (!config?.enabled) return json({ skipped: true, reason: "IA de Mensagens Treinadas desativada" });

    const { data: connectionLink } = await service
      .from("ai_agent_connections")
      .select("id")
      .eq("agent_config_id", config.id)
      .eq("connection_config_id", conversation.connection_config_id || "")
      .maybeSingle();
    if (!connectionLink) return json({ skipped: true, reason: "IA fora da conexão desta conversa" });

    let customerMessage = message.content?.trim() || `[${message.message_type}]`;
    let audioTranscription: string | null = null;
    let transcriptionError: string | null = null;
    if (message.message_type === "audio") {
      if (!message.media_url) {
        transcriptionError = "O áudio não possui um arquivo disponível para transcrição";
      } else {
        const readableAudioUrl = await resolveAudioUrl(service, message.media_url);
        const transcription = await transcribeAudio(readableAudioUrl, lovableKey);
        audioTranscription = transcription.text;
        transcriptionError = transcription.error;
        if (audioTranscription) customerMessage = `[Áudio transcrito]: ${audioTranscription}`;
      }
    }

    const [{ data: recentMessages }, { data: tags }, { data: rules }] = await Promise.all([
      service.from("messages").select("sender_type, sender_label, content, message_type, created_at").eq("conversation_id", conversation.id).order("created_at", { ascending: false }).limit(20),
      service.from("contact_tags").select("tag_id, tags!inner(id, name, workspace_id)").eq("contact_phone", conversation.contact_phone).eq("tags.workspace_id", conversation.workspace_id).limit(30),
      service.from("ai_trained_message_rules").select("id, example_message, context_notes, expected_action, action_type, official_response, response_messages, flow_id, required_tag_ids, excluded_tag_ids").eq("agent_config_id", config.id).eq("active", true).order("updated_at", { ascending: false }).limit(100),
    ]);

    const transcript = [...(recentMessages || [])].reverse().map((item) =>
      `${item.sender_type === "customer" ? "CLIENTE" : item.sender_label || "ATENDENTE"}: ${item.content || `[${item.message_type}]`}`
    ).join("\n").slice(-24000);
    const tagNames = (tags || []).map((row) => (row.tags as unknown as { name?: string } | null)?.name).filter(Boolean);
    const tagIds = (tags || []).map((row) => row.tag_id).filter((value): value is string => typeof value === "string");
    const contextSnapshot = {
      funnel_stage: conversation.funnel_stage,
      sale_registered: Boolean(conversation.sale_registered_at),
      tags: tagNames,
      tag_ids: tagIds,
      recent_transcript: transcript,
      audio_transcription: audioTranscription,
      transcription_error: transcriptionError,
    };

    const { data: queued, error: queueError } = await service.from("ai_training_queue").upsert({
      workspace_id: conversation.workspace_id,
      agent_config_id: config.id,
      conversation_id: conversation.id,
      source_message_id: message.id,
      customer_message: customerMessage,
      message_type: message.message_type,
      context_snapshot: contextSnapshot,
      status: "pending",
    }, { onConflict: "source_message_id" }).select("id").single();
    if (queueError || !queued) return json({ error: queueError?.message || "Falha ao registrar mensagem para treinamento" }, 500);

    if (message.message_type === "audio" && !audioTranscription) {
      await service.from("ai_training_queue").update({
        status: "failed", confidence: 0, matched_rule_id: null,
        match_reason: transcriptionError || "Não foi possível transcrever o áudio",
        suggested_action: null, suggested_action_type: null, suggested_response: null, suggested_responses: [],
        processed_at: new Date().toISOString(),
      }).eq("id", queued.id);
      return json({ success: false, queued: true, transcriptionError, executed: false });
    }

    if (!rules?.length) return json({ success: true, queued: true, matched: false, transcription: audioTranscription, reason: "Nenhuma resposta treinada ainda" });

    const eligibleRules = rules.filter((rule) => {
      const required = Array.isArray(rule.required_tag_ids) ? rule.required_tag_ids : [];
      const excluded = Array.isArray(rule.excluded_tag_ids) ? rule.excluded_tag_ids : [];
      return required.every((tagId) => tagIds.includes(tagId)) && !excluded.some((tagId) => tagIds.includes(tagId));
    });
    if (!eligibleRules.length) {
      await service.from("ai_training_queue").update({
        status: "unmatched", confidence: 0, matched_rule_id: null,
        match_reason: "Nenhum cenário treinado atende às condições de etiquetas deste cliente.",
        suggested_action: null, suggested_action_type: null, suggested_response: null, suggested_responses: [],
        processed_at: new Date().toISOString(),
      }).eq("id", queued.id);
      return json({ success: true, queued: true, matched: false, reason: "Nenhuma condição de etiqueta compatível", executed: false });
    }

    const catalog = eligibleRules.map((rule, index) =>
      `${index + 1}. ID: ${rule.id}\nEXEMPLO: ${rule.example_message}\nCONTEXTO: ${rule.context_notes || "não informado"}\nAÇÃO TREINADA: ${rule.expected_action}\nTIPO: ${rule.action_type}\nFLUXO: ${rule.flow_id || "nenhum"}`
    ).join("\n\n").slice(0, 40000);
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey: lovableKey,
      headers: { "Lovable-API-Key": lovableKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });
    const result = streamText({
      model: provider.responses("openai/gpt-6-astra"),
      output: Output.object({ schema: MatchSchema }),
        system: `Você compara a nova mensagem e todo o contexto com cenários treinados previamente para as etiquetas que o cliente já possui. As etiquetas servem somente para escolher qual comportamento e resposta usar: nunca adicione, remova ou altere etiquetas. Compare intenção e significado, inclusive entre português do Brasil e espanhol do México. Considere o contexto recente, etapa, etiquetas e venda. Nunca invente, combine ou reescreva ações ou mensagens. Escolha um ID somente quando o cenário completo e a condição de etiqueta forem equivalentes com segurança. Em dúvida, retorne matched_rule_id null. A confiança deve ficar entre 0 e 1. ${config.instructions || ""}`,
      prompt: `NOVA MENSAGEM:\n${customerMessage}\n\nETAPA: ${conversation.funnel_stage || "não definida"}\nVENDA REGISTRADA: ${conversation.sale_registered_at ? "sim" : "não"}\nETIQUETAS: ${tagNames.join(", ") || "nenhuma"}\n\nCONTEXTO RECENTE:\n${transcript}\n\nREGRAS TREINADAS:\n${catalog}`,
      providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
    });
    const output = await result.output;
    const usage = await result.usage;
    const selectedRule = eligibleRules.find((rule) => rule.id === output.matched_rule_id);
    const confidence = Math.max(0, Math.min(1, Number(output.confidence) || 0));
    const safeMatch = selectedRule && confidence >= 0.85 ? selectedRule : null;
    const responseMessages = safeMatch && ["reply", "reply_then_flow"].includes(safeMatch.action_type)
      ? (Array.isArray(safeMatch.response_messages)
        ? safeMatch.response_messages.filter((message): message is string => typeof message === "string" && message.trim().length > 0)
        : [])
      : [];
    if (safeMatch && ["reply", "reply_then_flow"].includes(safeMatch.action_type) && responseMessages.length === 0 && safeMatch.official_response?.trim()) {
      responseMessages.push(safeMatch.official_response.trim());
    }

    const { error: updateError } = await service.from("ai_training_queue").update({
      status: safeMatch ? "matched" : "unmatched",
      matched_rule_id: safeMatch?.id || null,
      confidence,
      match_reason: output.reason,
       suggested_action: safeMatch?.expected_action || null,
       suggested_action_type: safeMatch?.action_type || null,
       suggested_response: responseMessages[0] || null,
       suggested_responses: responseMessages,
       suggested_flow_id: safeMatch?.flow_id || null,
      processed_at: new Date().toISOString(),
    }).eq("id", queued.id);
    if (updateError) return json({ error: updateError.message }, 500);

    await service.from("ai_usage_logs").insert({
      function_name: "ai-trained-messages",
      model: "openai/gpt-6-astra",
      input_tokens: usage.inputTokens || 0,
      output_tokens: usage.outputTokens || 0,
      total_tokens: usage.totalTokens || 0,
      conversation_id: conversation.id,
    });

    return json({
      success: true,
      mode: config.operation_mode,
      matched: Boolean(safeMatch),
       action: safeMatch?.expected_action || null,
       actionType: safeMatch?.action_type || null,
        response: responseMessages[0] || null,
        responses: responseMessages,
       flowId: safeMatch?.flow_id || null,
      confidence,
      reason: output.reason,
      transcription: audioTranscription,
      executed: false,
    });
  } catch (error) {
    const status = typeof error === "object" && error && "statusCode" in error ? Number((error as { statusCode?: number }).statusCode) : 500;
    console.error("[ai-trained-messages]", error);
    return json({ error: safeError(error), retryable: status === 429 || status >= 500 }, status >= 400 && status < 600 ? status : 500);
  }
});