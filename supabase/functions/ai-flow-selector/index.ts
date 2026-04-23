import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getWorkspaceAIConfig } from "../_shared/workspace-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function resolveConversationNiche(params: {
  supabase: any;
  conversationId: string;
  nicheId: string | null;
  connectionConfigId: string | null;
}) {
  if (!params.connectionConfigId) {
    return params.nicheId;
  }

  const { data: nicheConnection, error } = await params.supabase
    .from("niche_connections")
    .select("niche_id")
    .eq("connection_config_id", params.connectionConfigId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const mappedNicheId = nicheConnection?.niche_id ?? null;

  if (params.nicheId !== mappedNicheId) {
    const { error: updateError } = await params.supabase
      .from("conversations")
      .update({ niche_id: mappedNicheId })
      .eq("id", params.conversationId);

    if (updateError) {
      console.error(
        `[ai-flow-selector] Failed to sync niche for conversation ${params.conversationId}:`,
        updateError
      );
    } else {
      console.log(
        `[ai-flow-selector] Synced niche for conversation ${params.conversationId} from ${params.nicheId ?? "null"} to ${mappedNicheId ?? "null"} based on connection ${params.connectionConfigId}`
      );
    }
  }

  return mappedNicheId;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId } = await req.json();

    if (!conversationId) {
      return jsonResponse({ error: "conversationId is required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get conversation with niche_id
    const { data: conversation } = await supabase
      .from("conversations")
      .select("niche_id, sale_registered_at, connection_config_id, workspace_id")
      .eq("id", conversationId)
      .single();

    if (conversation?.sale_registered_at) {
      console.log(`[ai-flow-selector] Skipping: sale already registered for conversation ${conversationId}`);
      return jsonResponse({ skipped: true, reason: "Sale already registered" });
    }

    const nicheId = await resolveConversationNiche({
      supabase,
      conversationId,
      nicheId: conversation?.niche_id ?? null,
      connectionConfigId: conversation?.connection_config_id ?? null,
    });

    if (!nicheId && conversation?.connection_config_id) {
      console.log(
        `[ai-flow-selector] Skipping: no niche mapped for connection ${conversation.connection_config_id} on conversation ${conversationId}`
      );
      return jsonResponse({ skipped: true, reason: "No niche mapped to connection" });
    }

    // Check if flow selector is enabled (niche-specific or global)
    let selectorEnabled = false;
    let customInstructions = "";

    if (nicheId) {
      const { data: niche } = await supabase
        .from("niches")
        .select("flow_selector_enabled, flow_selector_instructions")
        .eq("id", nicheId)
        .single();

      if (niche) {
        selectorEnabled = niche.flow_selector_enabled;
        customInstructions = niche.flow_selector_instructions || "";
      }
    } else {
      const { data: config } = await supabase
        .from("connection_configs")
        .select("config")
        .eq("connection_id", "ai-flow-selector")
        .maybeSingle();

      const selectorConfig = config?.config as Record<string, unknown> | null;
      selectorEnabled = !!selectorConfig?.enabled;
      customInstructions = (selectorConfig?.instructions as string) || "";
    }

    if (!selectorEnabled) {
      return jsonResponse({ skipped: true, reason: "Flow selector disabled" });
    }

    // Fetch active flows filtered by niche
    let flowQuery = supabase
      .from("automation_flows")
      .select("id, name, description")
      .eq("is_active", true)
      .eq("manual_only", false);

    if (nicheId) {
      flowQuery = flowQuery.eq("niche_id", nicheId);
    } else {
      flowQuery = flowQuery.is("niche_id", null);
    }

    const { data: flows } = await flowQuery;

    if (!flows?.length) {
      return jsonResponse({ skipped: true, reason: "No active flows" });
    }

    // Fetch ALL nodes for active flows
    const flowIds = flows.map((f) => f.id);
    const { data: allNodes } = await supabase
      .from("automation_nodes")
      .select("flow_id, node_type, label, config, sort_order")
      .in("flow_id", flowIds)
      .order("sort_order", { ascending: true });

    const nodesByFlow: Record<string, typeof allNodes> = {};
    for (const node of allNodes || []) {
      if (!nodesByFlow[node.flow_id]) nodesByFlow[node.flow_id] = [];
      nodesByFlow[node.flow_id]!.push(node);
    }

    // Fetch past executions
    const { data: pastExecutions } = await supabase
      .from("flow_executions")
      .select("flow_id, status, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    const executedFlowIds = (pastExecutions || []).map((e) => e.flow_id);
    const executedFlowNames = executedFlowIds
      .map((id) => flows.find((f) => f.id === id)?.name)
      .filter(Boolean);

    // Fetch last 20 messages
    const { data: messages } = await supabase
      .from("messages")
      .select("content, sender_type, message_type, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!messages?.length) {
      return jsonResponse({ skipped: true, reason: "No messages" });
    }

    // Build flow descriptions
    const flowDescriptions = flows.map((f, i) => {
      const nodes = nodesByFlow[f.id] || [];
      const nodeDetails = nodes.map((n) => {
        const cfg = n.config as Record<string, unknown>;
        let detail = `  - [${n.node_type}] ${n.label}`;
        if (n.node_type === "message" && cfg?.message) {
          detail += `: "${cfg.message}"`;
        } else if (n.node_type === "quick_reply" && cfg?.message) {
          const options = (cfg?.options as string[]) || [];
          detail += `: "${cfg.message}" (opções: ${options.join(", ")})`;
        } else if (n.node_type === "image" || n.node_type === "video" || n.node_type === "audio") {
          detail += cfg?.caption ? `: "${cfg.caption}"` : "";
        } else if (n.node_type === "delay") {
          detail += `: ${cfg?.duration || "?"} ${cfg?.unit || "s"}`;
        }
        return detail;
      }).join("\n");

      const alreadySent = executedFlowIds.includes(f.id);

      return `${i + 1}. "${f.name}" ${alreadySent ? "[JÁ ENVIADO]" : "[DISPONÍVEL]"}
   Descrição: ${f.description || "Sem descrição"}
   Etapas do fluxo:
${nodeDetails || "   (sem etapas)"}`;
    }).join("\n\n");

    const recentMessages = messages
      .reverse()
      .map((m) => {
        let prefix = m.sender_type === "customer" ? "Cliente" : "Agente/Bot";
        if (m.message_type !== "text") prefix += ` [${m.message_type}]`;
        return `${prefix}: ${m.content}`;
      })
      .join("\n");

    const executionHistory = executedFlowNames.length > 0
      ? `Fluxos já enviados nesta conversa (em ordem): ${executedFlowNames.join(" → ")}`
      : "Nenhum fluxo foi enviado nesta conversa ainda.";

    const aiConfig = await getWorkspaceAIConfig(supabase, conversation.workspace_id);
    if (!aiConfig.apiKey) {
      console.error("AI not configured (no API key)");
      return jsonResponse({ error: "AI not configured" }, 500);
    }

    const systemPrompt = `Você é um selecionador inteligente de fluxos de automação para atendimento via WhatsApp.
Sua função é analisar a conversa completa e decidir qual fluxo disparar com base no contexto.

REGRAS OBRIGATÓRIAS:
1. A DESCRIÇÃO DE CADA FLUXO É O CRITÉRIO PRINCIPAL DE SELEÇÃO. Cada fluxo tem uma descrição que explica EXATAMENTE quando ele deve ser disparado. Leia a descrição com atenção e SÓ selecione o fluxo se a situação descrita corresponder ao momento atual da conversa. Se a descrição diz "Quando o cliente perguntar sobre X", o cliente PRECISA ter perguntado sobre X.
2. NUNCA selecione um fluxo que já foi enviado nesta conversa (marcado como [JÁ ENVIADO]).
3. RESPEITE A ORDEM DE PRIORIDADE: Se existem fluxos numerados por etapas (Etapa 1, Etapa 2, Etapa 3...), NUNCA envie uma etapa posterior sem que as anteriores já tenham sido enviadas.
4. Analise o CONTEÚDO COMPLETO de cada fluxo (todas as mensagens, perguntas e mídias das etapas) para entender o que cada fluxo faz antes de decidir.
5. Analise TODA a conversa, não apenas a última mensagem, para entender o contexto completo do atendimento.
6. Se nenhum fluxo se encaixar ou se todos os fluxos aplicáveis já foram enviados, retorne null. NA DÚVIDA, retorne null. É melhor não enviar nada do que enviar o fluxo errado.
7. Seja MUITO criterioso: só selecione um fluxo se a descrição dele corresponder CLARAMENTE ao que o cliente está pedindo ou ao momento da conversa.
8. NÃO envie fluxos apenas porque o cliente respondeu com uma saudação simples (ex: "bom dia", "oi", "olá"). Uma saudação NÃO é motivo para disparar um fluxo, a menos que seja a primeira mensagem do lead vinda de um anúncio.
${customInstructions ? `\nInstruções adicionais do administrador:\n${customInstructions}` : ""}`;

    const userPrompt = `${executionHistory}

Fluxos disponíveis (com conteúdo detalhado):
${flowDescriptions}

Conversa completa recente:
${recentMessages}

Qual fluxo deve ser disparado agora?`;

    const aiResponse = await fetch(aiConfig.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "select_flow",
              description: "Seleciona o fluxo de automação mais adequado para o momento atual da conversa, respeitando ordem de prioridade e histórico. Retorna null se nenhum se encaixar ou se já foi enviado.",
              parameters: {
                type: "object",
                properties: {
                  flow_index: {
                    type: ["integer", "null"],
                    description: "Índice do fluxo selecionado (1-based) ou null se nenhum se encaixar",
                  },
                  reason: {
                    type: "string",
                    description: "Justificativa detalhada da escolha",
                  },
                },
                required: ["flow_index", "reason"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "select_flow" } },
        stream: false,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errorText);
      if (aiResponse.status === 429) return jsonResponse({ error: "Rate limit exceeded" }, 429);
      if (aiResponse.status === 402) return jsonResponse({ error: "AI credits exhausted" }, 402);
      return jsonResponse({ error: "AI generation failed" }, 502);
    }

    const aiResult = await aiResponse.json();

    const usage = aiResult.usage;
    if (usage) {
      await supabase.from("ai_usage_logs").insert({
        function_name: "ai-flow-selector",
        model: "google/gemini-3-flash-preview",
        input_tokens: usage.prompt_tokens || 0,
        output_tokens: usage.completion_tokens || 0,
        total_tokens: usage.total_tokens || 0,
        conversation_id: conversationId,
      });
    }

    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return jsonResponse({ skipped: true, reason: "AI did not select a flow" });
    }

    let selection: { flow_index: number | null; reason: string };
    try {
      selection = JSON.parse(toolCall.function.arguments);
    } catch {
      console.error("Failed to parse AI tool call:", toolCall.function.arguments);
      return jsonResponse({ skipped: true, reason: "Invalid AI response" });
    }

    console.log("AI flow selection:", JSON.stringify(selection));

    if (selection.flow_index === null || selection.flow_index < 1 || selection.flow_index > flows.length) {
      return jsonResponse({ skipped: true, reason: selection.reason || "No matching flow" });
    }

    const selectedFlow = flows[selection.flow_index - 1];

    if (executedFlowIds.includes(selectedFlow.id)) {
      console.log(`Flow "${selectedFlow.name}" already executed, skipping.`);
      return jsonResponse({ skipped: true, reason: `Flow "${selectedFlow.name}" already sent` });
    }

    console.log(`Executing flow "${selectedFlow.name}" (${selectedFlow.id}). Reason: ${selection.reason}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const execResponse = await fetch(`${supabaseUrl}/functions/v1/execute-flow`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ flowId: selectedFlow.id, conversationId, senderLabel: "ia-seletora" }),
    });

    const execResult = await execResponse.json();

    return jsonResponse({
      success: true,
      selectedFlow: { id: selectedFlow.id, name: selectedFlow.name },
      reason: selection.reason,
      execution: execResult,
    });
  } catch (error) {
    console.error("Flow selector error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
