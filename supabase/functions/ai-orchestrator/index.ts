import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { Output, streamText } from "npm:ai";
import { z } from "npm:zod";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const agentKeys = ["flow_selector", "support", "post_sale", "upsell", "remarketing"] as const;

type AgentKey = typeof agentKeys[number] | "none";

const DecisionSchema = z.object({
  selected_agent: z.enum(["none", ...agentKeys]),
  action: z.string(),
  reason: z.string(),
  confidence: z.number(),
  blockers: z.array(z.string()),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function safeErrorMessage(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const value = payload as Record<string, unknown>;
    if (typeof value.message === "string" && value.message) return value.message;
    if (typeof value.error === "string" && value.error) return value.error;
  }
  return `Falha na decisão da Orquestradora (${status})`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const startedAt = Date.now();

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!url || !anonKey || !serviceKey || !lovableKey) {
      return json({ error: "Configuração segura da Orquestradora indisponível" }, 500);
    }

    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "Sessão obrigatória" }, 401);

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData.user) return json({ error: "Sessão inválida" }, 401);

    const body = await req.json().catch(() => null);
    const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
    const conversationId = typeof body?.conversationId === "string" ? body.conversationId : "";
    if (!workspaceId || !conversationId) return json({ error: "Workspace e conversa são obrigatórios" }, 400);

    const { data: isAdmin, error: adminError } = await userClient.rpc("is_workspace_admin", { _workspace_id: workspaceId });
    if (adminError || !isAdmin) return json({ error: "Apenas administradores podem testar a Orquestradora" }, 403);

    const service = createClient(url, serviceKey);
    const { data: conversation, error: conversationError } = await service
      .from("conversations")
      .select("id, workspace_id, contact_name, contact_phone, status, funnel_stage, niche_id, connection_config_id, sale_registered_at, updated_at")
      .eq("id", conversationId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (conversationError) return json({ error: conversationError.message }, 500);
    if (!conversation) return json({ error: "Conversa não encontrada neste workspace" }, 404);

    const [configResult, messagesResult, executionsResult, tagsResult, saleResult, connectionLinksResult, flowLinksResult] = await Promise.all([
      service.from("ai_agent_configs").select("agent_key, enabled, operation_mode, priority, instructions, entry_criteria, blocking_rules").eq("workspace_id", workspaceId).is("niche_id", null),
      service.from("messages").select("id, sender_type, sender_label, content, message_type, created_at").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(30),
      service.from("flow_executions").select("status, created_at, automation_flows(name)").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(20),
      service.from("contact_tags").select("tags(name)").eq("contact_phone", conversation.contact_phone).limit(30),
      service.from("sales_orders").select("valor, moeda, upsell_sent, upsell_sent_at, created_at").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(5),
      service.from("ai_agent_connections").select("agent_config_id, connection_config_id, ai_agent_configs!inner(id, workspace_id, agent_key)").eq("ai_agent_configs.workspace_id", workspaceId),
      service.from("ai_agent_flows").select("agent_config_id, flow_id, send_when, ai_agent_configs!inner(id, workspace_id, agent_key), automation_flows!inner(id, name, description, is_active)").eq("ai_agent_configs.workspace_id", workspaceId),
    ]);

    const configs = configResult.data || [];
    const orchestratorConfig = configs.find((item) => item.agent_key === "orchestrator");
    if (!orchestratorConfig?.enabled) return json({ skipped: true, reason: "Orquestradora desativada" });

    const connectionLinks = connectionLinksResult.data || [];
    const orchestratorConnections = connectionLinks.filter((link) => link.agent_config_id === orchestratorConfig.id).map((link) => link.connection_config_id);
    if (!conversation.connection_config_id || !orchestratorConnections.includes(conversation.connection_config_id)) {
      return json({ skipped: true, reason: "A Orquestradora não está anexada à conexão desta conversa" });
    }

    const messages = messagesResult.data || [];
    if (!messages.length) return json({ skipped: true, reason: "Conversa sem mensagens" });
    const chronological = [...messages].reverse();
    const lastMessage = messages[0];
    const sourceMessageId = orchestratorConfig.operation_mode === "live" && lastMessage.sender_type === "customer" ? lastMessage.id : null;

    if (orchestratorConfig.operation_mode === "live" && sourceMessageId) {
      const { data: prior } = await service.from("ai_orchestration_decisions").select("id, selected_agent, status").eq("conversation_id", conversationId).eq("source_message_id", sourceMessageId).maybeSingle();
      if (prior) return json({ skipped: true, reason: "Esta mensagem já foi decidida", decision: prior });
    }

    const enabledAgents = new Set(configs.filter((item) => {
      if (item.agent_key === "orchestrator" || !item.enabled) return false;
      return connectionLinks.some((link) => link.agent_config_id === item.id && link.connection_config_id === conversation.connection_config_id);
    }).map((item) => item.agent_key));
    const isPaid = Boolean(conversation.sale_registered_at || (saleResult.data || []).length);
    const deterministicBlockers: string[] = [];
    if (lastMessage.sender_type !== "customer") deterministicBlockers.push("A última mensagem não é do lead");
    if (isPaid) deterministicBlockers.push("Venda/pagamento registrado: bloquear fluxos comerciais anteriores");

    const transcript = chronological.map((message) => {
      const actor = message.sender_type === "customer" ? "LEAD" : (message.sender_label || "ATENDENTE/IA").toUpperCase();
      return `[${message.created_at}] ${actor}: ${message.content || `[${message.message_type}]`}`;
    }).join("\n");
    const tags = (tagsResult.data || []).map((row) => {
      const tag = row.tags as unknown as { name?: string } | null;
      return tag?.name;
    }).filter(Boolean);
    const executions = (executionsResult.data || []).map((row) => {
      const flow = row.automation_flows as unknown as { name?: string } | null;
      return `${flow?.name || "Fluxo"} (${row.status})`;
    });

    const availableAgents = agentKeys.map((key) => {
      const config = configs.find((item) => item.agent_key === key);
      const attached = config ? connectionLinks.some((link) => link.agent_config_id === config.id && link.connection_config_id === conversation.connection_config_id) : false;
      const state = config?.enabled && attached ? "ATIVO NESTA CONEXÃO" : (config?.enabled ? "FORA DESTA CONEXÃO" : "AGUARDANDO CONFIGURAÇÃO");
      return `- ${key}: ${state}; prioridade ${config?.priority ?? 100}; instruções: ${config?.instructions || "não configuradas"}`;
    }).join("\n");

    const selectorConfig = configs.find((item) => item.agent_key === "flow_selector");
    const allowedFlows = (flowLinksResult.data || []).filter((link) => link.agent_config_id === selectorConfig?.id).map((link) => {
      const flow = link.automation_flows as unknown as { name?: string; description?: string | null; is_active?: boolean } | null;
      return `- ${flow?.name || link.flow_id} [${flow?.is_active ? "ATIVO" : "PAUSADO"}]: enviar quando: ${link.send_when || "critério não descrito"}. Descrição original: ${flow?.description || "sem descrição"}`;
    }).join("\n");

    const prompt = `Você é a IA ORQUESTRADORA de um CRM de WhatsApp. Você nunca fala com o lead e nunca escreve a resposta final. Sua única função é escolher exatamente um Atendente de IA ou nenhuma ação.

ATENDENTES POSSÍVEIS:
- flow_selector: escolhe e executa uma etapa/fluxo pronto quando a intenção corresponde claramente.
- support: responde dúvidas atuais sobre produto, pagamento, envio, prazo e modo de uso antes da venda.
- post_sale: suporte, uso, entrega, satisfação ou problema depois da compra.
- upsell: oferta adicional somente após pagamento e quando houver elegibilidade explícita.
- remarketing: reengaja lead inativo ou que abandonou o pagamento; não é resposta imediata a uma nova dúvida.
- none: quando nenhuma ação é segura, a última mensagem não é do lead ou faltam critérios.

REGRAS INVIOLÁVEIS:
1. Escolha no máximo um Atendente.
2. A Orquestradora não responde e não executa mensagens.
3. Em dúvida, escolha none.
4. Após venda/pagamento, não escolha support, flow_selector ou remarketing; use post_sale, upsell ou none.
5. Upsell exige venda/pagamento e sinal claro de elegibilidade. Não escolha upsell apenas porque houve compra.
6. Remarketing só pode agir por inatividade/abandono e nunca como resposta imediata.
7. Agentes desativados podem ser recomendados no modo de teste, mas inclua "Agente aguardando configuração" em blockers.
8. Confiança deve ficar entre 0 e 1.

INSTRUÇÕES DO ADMINISTRADOR:
${orchestratorConfig.instructions || "Ainda não há instruções personalizadas; aplique apenas as regras de segurança acima."}

ESTADO DOS ATENDENTES:
${availableAgents}

FLUXOS PERMITIDOS PARA A SELETORA:
${allowedFlows || "Nenhum fluxo anexado. Não escolha flow_selector."}`;

    const context = `LEAD: ${conversation.contact_name || "Sem nome"}
ETAPA: ${conversation.funnel_stage || "não definida"}
STATUS: ${conversation.status || "não definido"}
VENDA/PAGAMENTO REGISTRADO: ${isPaid ? "sim" : "não"}
ETIQUETAS: ${tags.join(", ") || "nenhuma"}
FLUXOS EXECUTADOS: ${executions.join("; ") || "nenhum"}
BLOQUEIOS DETERMINÍSTICOS: ${deterministicBlockers.join("; ") || "nenhum"}

CONVERSA RECENTE:
${transcript}

Decida qual Atendente deveria assumir agora. Não produza a mensagem ao lead.`;

    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey: lovableKey,
      headers: { "Lovable-API-Key": lovableKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });
    const result = streamText({
      model: provider.responses("openai/gpt-6-astra"),
      output: Output.object({ schema: DecisionSchema }),
      system: prompt,
      prompt: context,
      providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
    });
    const output = await result.output;
    const usage = await result.usage;

    let selectedAgent: AgentKey = output.selected_agent;
    const blockers = [...deterministicBlockers, ...output.blockers];
    if (lastMessage.sender_type !== "customer") selectedAgent = "none";
    if (isPaid && ["support", "flow_selector", "remarketing"].includes(selectedAgent)) {
      blockers.push("Decisão bloqueada pela regra global pós-venda");
      selectedAgent = "none";
    }
    if (selectedAgent !== "none" && !enabledAgents.has(selectedAgent)) blockers.push("Agente aguardando configuração");
    if (selectedAgent === "flow_selector" && !allowedFlows) {
      blockers.push("A Seletora não possui fluxos anexados");
      selectedAgent = "none";
    }

    const confidence = Math.max(0, Math.min(1, Number(output.confidence) || 0));
    const decision = {
      workspace_id: workspaceId,
      conversation_id: conversationId,
      source_message_id: sourceMessageId,
      selected_agent: selectedAgent,
      action: selectedAgent === "none" ? "none" : (orchestratorConfig.operation_mode === "test" || !enabledAgents.has(selectedAgent) ? "recommend_only" : output.action || "route"),
      reason: output.reason,
      confidence,
      blockers,
      context_snapshot: { funnel_stage: conversation.funnel_stage, sale_registered: isPaid, tags, last_message_id: lastMessage.id },
      operation_mode: orchestratorConfig.operation_mode,
      status: selectedAgent === "none" ? "skipped" : "decided",
      duration_ms: Date.now() - startedAt,
      input_tokens: usage.inputTokens || 0,
      output_tokens: usage.outputTokens || 0,
    };

    const { data: saved, error: saveError } = await service.from("ai_orchestration_decisions").insert(decision).select().single();
    if (saveError) return json({ error: saveError.message, decision }, 500);

    await service.from("ai_usage_logs").insert({
      function_name: "ai-orchestrator",
      model: "openai/gpt-6-astra",
      input_tokens: usage.inputTokens || 0,
      output_tokens: usage.outputTokens || 0,
      total_tokens: usage.totalTokens || 0,
      conversation_id: conversationId,
    });

    return json({ success: true, decision: saved, executed: false });
  } catch (error) {
    const status = typeof error === "object" && error && "statusCode" in error ? Number((error as { statusCode?: number }).statusCode) : 500;
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[ai-orchestrator]", error);
    return json({ error: safeErrorMessage({ message }, status) }, status >= 400 && status < 600 ? status : 500);
  }
});
