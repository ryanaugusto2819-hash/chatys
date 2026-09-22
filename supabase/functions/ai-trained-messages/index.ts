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
      .select("id, conversation_id, content, message_type, sender_type, created_at, conversations!inner(id, workspace_id, connection_config_id, funnel_stage, sale_registered_at, contact_phone)")
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

    const [{ data: recentMessages }, { data: tags }, { data: rules }] = await Promise.all([
      service.from("messages").select("sender_type, sender_label, content, message_type, created_at").eq("conversation_id", conversation.id).order("created_at", { ascending: false }).limit(20),
      service.from("contact_tags").select("tag_id, tags!inner(id, name, workspace_id)").eq("contact_phone", conversation.contact_phone).eq("tags.workspace_id", conversation.workspace_id).limit(30),
      service.from("ai_trained_message_rules").select("id, example_message, context_notes, expected_action, action_type, official_response, required_tag_ids, excluded_tag_ids").eq("agent_config_id", config.id).eq("active", true).order("updated_at", { ascending: false }).limit(100),
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
    };

    const { data: queued, error: queueError } = await service.from("ai_training_queue").upsert({
      workspace_id: conversation.workspace_id,
      agent_config_id: config.id,
      conversation_id: conversation.id,
      source_message_id: message.id,
      customer_message: message.content || `[${message.message_type}]`,
      message_type: message.message_type,
      context_snapshot: contextSnapshot,
      status: "pending",
    }, { onConflict: "source_message_id" }).select("id").single();
    if (queueError || !queued) return json({ error: queueError?.message || "Falha ao registrar mensagem para treinamento" }, 500);

    if (!rules?.length) return json({ success: true, queued: true, matched: false, reason: "Nenhuma resposta treinada ainda" });

    const eligibleRules = rules.filter((rule) => {
      const required = Array.isArray(rule.required_tag_ids) ? rule.required_tag_ids : [];
      const excluded = Array.isArray(rule.excluded_tag_ids) ? rule.excluded_tag_ids : [];
      return required.every((tagId) => tagIds.includes(tagId)) && !excluded.some((tagId) => tagIds.includes(tagId));
    });
    if (!eligibleRules.length) {
      await service.from("ai_training_queue").update({
        status: "unmatched", confidence: 0, matched_rule_id: null,
        match_reason: "Nenhum cenário treinado atende às condições de etiquetas deste cliente.",
        suggested_action: null, suggested_action_type: null, suggested_response: null,
        processed_at: new Date().toISOString(),
      }).eq("id", queued.id);
      return json({ success: true, queued: true, matched: false, reason: "Nenhuma condição de etiqueta compatível", executed: false });
    }

    const catalog = eligibleRules.map((rule, index) =>
      `${index + 1}. ID: ${rule.id}\nEXEMPLO: ${rule.example_message}\nCONTEXTO: ${rule.context_notes || "não informado"}\nAÇÃO TREINADA: ${rule.expected_action}\nTIPO: ${rule.action_type}`
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
      prompt: `NOVA MENSAGEM:\n${message.content || `[${message.message_type}]`}\n\nETAPA: ${conversation.funnel_stage || "não definida"}\nVENDA REGISTRADA: ${conversation.sale_registered_at ? "sim" : "não"}\nETIQUETAS: ${tagNames.join(", ") || "nenhuma"}\n\nCONTEXTO RECENTE:\n${transcript}\n\nREGRAS TREINADAS:\n${catalog}`,
      providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
    });
    const output = await result.output;
    const usage = await result.usage;
    const selectedRule = eligibleRules.find((rule) => rule.id === output.matched_rule_id);
    const confidence = Math.max(0, Math.min(1, Number(output.confidence) || 0));
    const safeMatch = selectedRule && confidence >= 0.85 ? selectedRule : null;

    const { error: updateError } = await service.from("ai_training_queue").update({
      status: safeMatch ? "matched" : "unmatched",
      matched_rule_id: safeMatch?.id || null,
      confidence,
      match_reason: output.reason,
       suggested_action: safeMatch?.expected_action || null,
       suggested_action_type: safeMatch?.action_type || null,
       suggested_response: safeMatch?.action_type === "reply" ? safeMatch.official_response : null,
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
       response: safeMatch?.action_type === "reply" ? safeMatch.official_response : null,
      confidence,
      reason: output.reason,
      executed: false,
    });
  } catch (error) {
    const status = typeof error === "object" && error && "statusCode" in error ? Number((error as { statusCode?: number }).statusCode) : 500;
    console.error("[ai-trained-messages]", error);
    return json({ error: safeError(error), retryable: status === 429 || status >= 500 }, status >= 400 && status < 600 ? status : 500);
  }
});