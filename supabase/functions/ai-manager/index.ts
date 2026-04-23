import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getWorkspaceAIConfig } from "../_shared/workspace-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ManagerMode = "human" | "follow_up" | "flow_selector";

// ── Mode-specific system prompts ──────────────────────────────────────────────

const MODE_SYSTEM_PROMPTS: Record<ManagerMode, string> = {
  human: `Você é um GERENTE DE QUALIDADE especializado em avaliar VENDEDORES HUMANOS no atendimento via WhatsApp.

Sua função é analisar exclusivamente o desempenho do ATENDENTE HUMANO (mensagens do "ATENDENTE"). Ignore mensagens do BOT/IA ao avaliar o desempenho — use as mensagens do bot apenas como contexto.

Avalie:
- Como o vendedor conduziu a conversa e criou rapport
- Profissionalismo, empatia e educação no tratamento
- Domínio do produto/serviço e capacidade de responder dúvidas
- Técnica de vendas: identificação de necessidades, contorno de objeções, geração de urgência, fechamento
- Resultado: o lead avançou no funil? A venda foi fechada? Houve perda de oportunidade clara?`,

  follow_up: `Você é um GERENTE especializado em avaliar a qualidade das mensagens de FOLLOW-UP geradas pela IA de Follow-Up.

Sua função é analisar as mensagens de follow-up enviadas automaticamente pela IA. Avalie:
- Personalização: a mensagem fez referência específica ao contexto da conversa? Evitou ser genérica?
- Adequação ao funil: o follow-up foi correto para o estágio do lead?
- Tom e naturalidade: a mensagem soou humana, não robótica? Respeitou limites?
- Timing: o follow-up foi enviado no momento certo após o silêncio do cliente?
- Efetividade: a mensagem conseguiu reengajar? O cliente respondeu?
- Verifique se os follow-ups deveriam ter sido bloqueados (vendedor desistiu da venda).`,

  flow_selector: `Você é um GERENTE especializado em avaliar a SELEÇÃO E EXECUÇÃO DE FLUXOS DE AUTOMAÇÃO pela IA.

Sua função é analisar se os fluxos disparados foram os mais adequados para cada momento da conversa. Avalie:
- Precisão: o fluxo selecionado era o mais relevante para a mensagem/situação do cliente?
- Trigger: a condição de disparo fez sentido dentro do contexto?
- Conteúdo dos nós: as mensagens e ações dentro do fluxo foram relevantes e bem ordenadas?
- Oportunidades perdidas: houve momentos em que um fluxo deveria ter sido disparado mas não foi?
- Exageros: algum fluxo foi disparado de forma incorreta ou desnecessária?`,
};

// ── Default evaluation criteria per mode ─────────────────────────────────────

const MODE_DEFAULT_CRITERIA: Record<ManagerMode, Array<{ name: string; weight: number; description: string }>> = {
  human: [
    { name: "Profissionalismo e Empatia", weight: 25, description: "O atendente foi profissional, empático e educado com o cliente?" },
    { name: "Tempo de Resposta", weight: 15, description: "O atendente respondeu com agilidade e manteve o cliente engajado?" },
    { name: "Conhecimento do Produto", weight: 25, description: "O atendente demonstrou domínio correto do produto/serviço oferecido?" },
    { name: "Técnica de Vendas", weight: 35, description: "O atendente aplicou boas técnicas: identificou necessidades, contornou objeções e avançou no funil?" },
  ],
  follow_up: [
    { name: "Personalização", weight: 30, description: "A mensagem fez referência ao contexto real da conversa? Evitou ser genérica?" },
    { name: "Timing e Adequação ao Funil", weight: 25, description: "O follow-up foi enviado no momento e etapa certos?" },
    { name: "Tom Natural e Não Invasivo", weight: 20, description: "A mensagem soou humana, natural e respeitosa?" },
    { name: "Efetividade e Persuasão", weight: 25, description: "O follow-up reengajou o cliente? A abordagem foi persuasiva sem ser agressiva?" },
  ],
  flow_selector: [
    { name: "Precisão da Seleção", weight: 35, description: "O fluxo selecionado foi o mais adequado para a mensagem do cliente?" },
    { name: "Relevância do Trigger", weight: 25, description: "A condição de disparo fez sentido para o contexto?" },
    { name: "Qualidade dos Nós Executados", weight: 25, description: "As mensagens e ações dentro do fluxo foram relevantes e bem sequenciadas?" },
    { name: "Oportunidades Perdidas", weight: 15, description: "Houve fluxos mais adequados não acionados? Algum fluxo não foi disparado quando deveria?" },
  ],
};

const MODE_CONFIG_IDS: Record<ManagerMode, string> = {
  human: "00000000-0000-0000-0000-000000000001",
  follow_up: "00000000-0000-0000-0000-000000000002",
  flow_selector: "00000000-0000-0000-0000-000000000003",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { conversation_id } = body;
    const mode: ManagerMode = body.mode || "human";

    if (!conversation_id) {
      return new Response(JSON.stringify({ error: "conversation_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already analyzed for this mode
    const { data: existing } = await supabase
      .from("manager_analyses")
      .select("id")
      .eq("conversation_id", conversation_id)
      .eq("mode", mode)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ message: "Already analyzed", id: existing.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get conversation details
    const { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversation_id)
      .single();

    if (!conversation) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiConfig = await getWorkspaceAIConfig(supabase, conversation.workspace_id);
    if (!aiConfig.apiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all messages
    const { data: messages } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true })
      .limit(200);

    if (!messages || messages.length < 2) {
      return new Response(JSON.stringify({ message: "Not enough messages to analyze" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Fetch mode-specific extra data ───────────────────────────────────────

    // Flow executions (used by human and flow_selector modes)
    const { data: flowExecs } = await supabase
      .from("flow_executions")
      .select("*, automation_flows(name, description)")
      .eq("conversation_id", conversation_id);

    const flowIds = [...new Set((flowExecs || []).map((fe: any) => fe.flow_id))];
    let allFlowNodes: Record<string, any[]> = {};
    if (flowIds.length > 0) {
      const { data: nodes } = await supabase
        .from("automation_nodes")
        .select("flow_id, node_type, label, config, sort_order")
        .in("flow_id", flowIds)
        .order("sort_order", { ascending: true });
      for (const node of (nodes || [])) {
        if (!allFlowNodes[node.flow_id]) allFlowNodes[node.flow_id] = [];
        allFlowNodes[node.flow_id].push(node);
      }
    }

    // Follow-up executions (used by follow_up mode)
    let followUpContext = "";
    if (mode === "follow_up") {
      const { data: fuExecs } = await supabase
        .from("follow_up_executions")
        .select("*, follow_up_templates(name, escalation_level, funnel_stage, delay_hours)")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: true });

      if (fuExecs && fuExecs.length > 0) {
        followUpContext = `\n\nFOLLOW-UPS ENVIADOS NESTA CONVERSA:\n` + fuExecs.map((fe: any) => {
          const tpl = fe.follow_up_templates;
          const sentAt = fe.sent_at ? new Date(fe.sent_at).toLocaleString("pt-BR") : "(não enviado)";
          return `- Template: "${tpl?.name || 'desconhecido'}" | Nível ${tpl?.escalation_level || '?'} | Etapa: ${tpl?.funnel_stage || '?'} | Atraso: ${tpl?.delay_hours || '?'}h | Status: ${fe.status} | Enviado: ${sentAt}\n  Mensagem: "${fe.message_sent?.substring(0, 200) || '(vazia)'}"`;
        }).join("\n");
      } else {
        followUpContext = "\n\nNenhum follow-up foi enviado para esta conversa.";
      }
    }

    // Niche info
    let nicheInfo = null;
    if (conversation.niche_id) {
      const { data: niche } = await supabase
        .from("niches")
        .select("name, system_prompt")
        .eq("id", conversation.niche_id)
        .single();
      nicheInfo = niche;
    }

    // Load mode-specific config
    const { data: managerConfig } = await supabase
      .from("manager_config")
      .select("*")
      .eq("mode", mode)
      .limit(1)
      .maybeSingle();

    const customPrompt = (managerConfig as any)?.custom_prompt || "";
    const evalCriteria = ((managerConfig as any)?.evaluation_criteria || []) as Array<{ name: string; weight: number; description: string }>;
    const activeCriteria = evalCriteria.length > 0 ? evalCriteria : MODE_DEFAULT_CRITERIA[mode];

    // Knowledge base
    const { data: kbItems } = await supabase
      .from("knowledge_base_items")
      .select("title, content, type")
      .order("created_at", { ascending: false })
      .limit(30);

    const kbContext = (kbItems || []).map((item: any) => {
      if (item.type === "qa") return `P: ${item.title}\nR: ${item.content}`;
      return `[${item.title}]: ${item.content.substring(0, 500)}`;
    }).join("\n\n");

    // Build conversation transcript
    const transcript = messages.map((m: any) => {
      const sender = m.sender_type === "customer" ? "CLIENTE" :
                     m.sender_type === "bot" ? "BOT/IA" : "ATENDENTE";
      const time = new Date(m.created_at).toLocaleString("pt-BR");
      let displayContent = m.content || "";
      if (!displayContent.trim()) {
        const typeLabels: Record<string, string> = {
          image: "[Imagem enviada]", video: "[Vídeo enviado]", audio: "[Áudio enviado]",
          document: "[Documento enviado]", sticker: "[Sticker enviado]",
        };
        displayContent = typeLabels[m.message_type] || "[Mídia enviada]";
      }
      if (m.media_url && !displayContent.includes("[") && m.message_type !== "text") {
        const mediaLabel = m.message_type === "image" ? "📷 Imagem" :
                           m.message_type === "video" ? "🎥 Vídeo" :
                           m.message_type === "audio" ? "🎤 Áudio" : "📎 Arquivo";
        displayContent = `${displayContent} [${mediaLabel} anexado]`.trim();
      }
      return `[${time}] ${sender}: ${displayContent}`;
    }).join("\n");

    // Build flow execution summary
    const flowSummary = (flowExecs || []).map((fe: any) => {
      const flowName = fe.automation_flows?.name || "Desconhecido";
      const flowDesc = fe.automation_flows?.description || "";
      const nodes = allFlowNodes[fe.flow_id] || [];
      const nodesDetail = nodes.map((n: any, i: number) => {
        const cfg = n.config || {};
        let detail = `  ${i + 1}. [${n.node_type}] ${n.label}`;
        if (cfg.text) detail += ` — "${cfg.text}"`;
        if (cfg.audioUrl) detail += ` — Áudio: ${cfg.audioUrl}`;
        if (cfg.imageUrl) detail += ` — Imagem: ${cfg.imageUrl}`;
        if (cfg.caption) detail += ` (legenda: "${cfg.caption}")`;
        if (cfg.stage) detail += ` — Define etapa: ${cfg.stage}`;
        if (cfg.seconds) detail += ` — Espera: ${cfg.seconds}s`;
        if (cfg.buttons) detail += ` — Botões: ${JSON.stringify(cfg.buttons)}`;
        return detail;
      }).join("\n");
      return `- Fluxo "${flowName}" ${flowDesc ? `(${flowDesc})` : ""} — Status: ${fe.status}, Nós: ${fe.completed_nodes}/${fe.total_nodes}\n${nodesDetail}`;
    }).join("\n\n");

    // Build criteria text
    const criteriaText = activeCriteria
      .map((c, i) => `${i + 1}. ${c.name} (Peso: ${c.weight}%): ${c.description}`)
      .join("\n");

    // Build mode label for context
    const modeLabels = { human: "Atendente Humano", follow_up: "IA de Follow-Up", flow_selector: "IA Seletora de Fluxo" };
    const modeLabel = modeLabels[mode];

    const systemPrompt = `${customPrompt || MODE_SYSTEM_PROMPTS[mode]}

MODO DE ANÁLISE: ${modeLabel}
CRITÉRIOS DE AVALIAÇÃO:
${criteriaText}

REGRAS:
- Avalie cada aspecto com nota de 0 a 100.
- Identifique problemas citando trechos específicos da conversa.
- Sugira melhorias concretas e acionáveis.
- Seja crítico mas justo.

${nicheInfo ? `CONTEXTO DO NICHO: "${nicheInfo.name}"\n${nicheInfo.system_prompt}` : ""}
${kbContext ? `\nBASE DE CONHECIMENTO:\n${kbContext}` : ""}
${mode !== "follow_up" ? `\nFLUXOS EXECUTADOS:\n${flowSummary || "Nenhum fluxo executado."}` : ""}
${followUpContext}

Responda EXCLUSIVAMENTE usando a função fornecida.`;

    const response = await fetch(aiConfig.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `MODO: ${modeLabel}\n\nAnalise esta conversa:\n\n${transcript}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_analysis",
            description: `Gera a análise de qualidade — modo: ${modeLabel}`,
            parameters: {
              type: "object",
              properties: {
                overall_score: { type: "integer", description: "Nota geral 0-100" },
                flow_accuracy_score: { type: "integer", description: "Nota de precisão de fluxos/follow-ups 0-100" },
                response_quality_score: { type: "integer", description: "Nota de qualidade das respostas/mensagens 0-100" },
                context_adherence_score: { type: "integer", description: "Nota de aderência ao contexto 0-100" },
                summary: { type: "string", description: "Resumo da análise em 2-3 frases focado no modo avaliado" },
                issues: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["error", "warning", "info"] },
                      title: { type: "string" },
                      description: { type: "string" },
                      excerpt: { type: "string" },
                    },
                    required: ["type", "title", "description"],
                  },
                },
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      priority: { type: "string", enum: ["high", "medium", "low"] },
                      title: { type: "string" },
                      description: { type: "string" },
                    },
                    required: ["priority", "title", "description"],
                  },
                },
                flows_analyzed: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      flow_name: { type: "string" },
                      was_appropriate: { type: "boolean" },
                      reason: { type: "string" },
                    },
                    required: ["flow_name", "was_appropriate", "reason"],
                  },
                },
              },
              required: ["overall_score", "flow_accuracy_score", "response_quality_score", "context_adherence_score", "summary", "issues", "suggestions", "flows_analyzed"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_analysis" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const analysis = JSON.parse(toolCall.function.arguments);

    const { data: saved, error: saveError } = await supabase
      .from("manager_analyses")
      .insert({
        conversation_id,
        mode,
        overall_score: analysis.overall_score,
        flow_accuracy_score: analysis.flow_accuracy_score,
        response_quality_score: analysis.response_quality_score,
        context_adherence_score: analysis.context_adherence_score,
        summary: analysis.summary,
        issues: analysis.issues,
        suggestions: analysis.suggestions,
        flows_analyzed: analysis.flows_analyzed,
      })
      .select()
      .single();

    if (saveError) throw saveError;

    const usage = aiResult.usage;
    if (usage) {
      await supabase.from("ai_usage_logs").insert({
        function_name: "ai-manager",
        model: "google/gemini-2.5-flash",
        input_tokens: usage.prompt_tokens || 0,
        output_tokens: usage.completion_tokens || 0,
        total_tokens: usage.total_tokens || 0,
        conversation_id,
      });
    }

    return new Response(JSON.stringify(saved), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    console.error("ai-manager error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
