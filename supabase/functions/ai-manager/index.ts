import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured (LOVABLE_API_KEY missing)" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { conversation_id } = await req.json();

    if (!conversation_id) {
      return new Response(JSON.stringify({ error: "conversation_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already analyzed
    const { data: existing } = await supabase
      .from("manager_analyses")
      .select("id")
      .eq("conversation_id", conversation_id)
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

    // Get flow executions for this conversation
    const { data: flowExecs } = await supabase
      .from("flow_executions")
      .select("*, automation_flows(name, description)")
      .eq("conversation_id", conversation_id);

    // Load full node details for each executed flow
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

    // Get niche info if available
    let nicheInfo = null;
    if (conversation.niche_id) {
      const { data: niche } = await supabase
        .from("niches")
        .select("name, system_prompt")
        .eq("id", conversation.niche_id)
        .single();
      nicheInfo = niche;
    }

    // Load manager config
    const { data: managerConfig } = await supabase
      .from("manager_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    const customPrompt = managerConfig?.custom_prompt || '';
    const evalCriteria = (managerConfig?.evaluation_criteria || []) as Array<{ name: string; weight: number; description: string }>;

    // Load knowledge base items for context
    const { data: kbItems } = await supabase
      .from("knowledge_base_items")
      .select("title, content, type")
      .order("created_at", { ascending: false })
      .limit(30);

    const kbContext = (kbItems || []).map((item: any) => {
      if (item.type === 'qa') return `P: ${item.title}\nR: ${item.content}`;
      return `[${item.title}]: ${item.content.substring(0, 500)}`;
    }).join("\n\n");

    // Build the conversation transcript (handle media messages)
    const transcript = messages.map((m: any) => {
      const sender = m.sender_type === "customer" ? "CLIENTE" :
                     m.sender_type === "bot" ? "BOT/IA" : "ATENDENTE";
      const time = new Date(m.created_at).toLocaleString("pt-BR");

      let displayContent = m.content || "";

      // If content is empty, describe the media type so the AI knows what was sent
      if (!displayContent.trim()) {
        const typeLabels: Record<string, string> = {
          image: "[Imagem enviada]",
          video: "[Vídeo enviado]",
          audio: "[Áudio enviado]",
          document: "[Documento enviado]",
          sticker: "[Sticker enviado]",
        };
        displayContent = typeLabels[m.message_type] || "[Mídia enviada]";
      }

      // Append media indicator if there's a media_url but content doesn't mention it
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
      const flowDesc = fe.automation_flows?.description || "Sem descrição";
      const nodes = allFlowNodes[fe.flow_id] || [];
      
      const nodesDetail = nodes.map((n: any, i: number) => {
        const cfg = n.config || {};
        let detail = `  ${i + 1}. [${n.node_type}] ${n.label}`;
        if (n.node_type === 'message' && cfg.text) detail += ` — Texto: "${cfg.text}"`;
        if (n.node_type === 'audio' && cfg.audioUrl) detail += ` — Áudio: ${cfg.audioUrl}`;
        if (n.node_type === 'image' && cfg.imageUrl) detail += ` — Imagem: ${cfg.imageUrl}`;
        if (n.node_type === 'image' && cfg.caption) detail += ` (legenda: "${cfg.caption}")`;
        if (n.node_type === 'video' && cfg.videoUrl) detail += ` — Vídeo: ${cfg.videoUrl}`;
        if (n.node_type === 'video' && cfg.caption) detail += ` (legenda: "${cfg.caption}")`;
        if (n.node_type === 'document' && cfg.documentUrl) detail += ` — Documento: ${cfg.documentUrl}`;
        if (n.node_type === 'quick_reply' && cfg.text) detail += ` — Texto: "${cfg.text}"`;
        if (n.node_type === 'quick_reply' && cfg.buttons) detail += ` — Botões: ${JSON.stringify(cfg.buttons)}`;
        if (n.node_type === 'set_funnel_stage' && cfg.stage) detail += ` — Define etapa: ${cfg.stage}`;
        if (n.node_type === 'delay' && cfg.seconds) detail += ` — Espera: ${cfg.seconds}s`;
        return detail;
      }).join("\n");

      return `- Fluxo "${flowName}" (${flowDesc}) — Status: ${fe.status}, Nós completados: ${fe.completed_nodes}/${fe.total_nodes}\n  CONTEÚDO COMPLETO DO FLUXO:\n${nodesDetail}`;
    }).join("\n\n");

    // Build criteria text
    const criteriaText = evalCriteria.length > 0
      ? evalCriteria.map((c, i) => `${i + 1}. ${c.name} (Peso: ${c.weight}%): ${c.description}`).join("\n")
      : `1. QUALIDADE DAS RESPOSTAS: As respostas do bot/atendente foram claras, úteis e profissionais?
2. PRECISÃO DOS FLUXOS: Os fluxos de automação disparados foram adequados ao contexto?
3. ADERÊNCIA AO CONTEXTO: As respostas mantiveram coerência com o histórico?
4. IDENTIFICAÇÃO DE ERROS: Houve respostas incorretas ou informações contraditórias?`;

    const systemPrompt = `${customPrompt || 'Você é um GERENTE DE QUALIDADE especializado em atendimento ao cliente via WhatsApp.'}

Sua função é analisar conversas de atendimento e gerar um relatório detalhado avaliando:

${criteriaText}

REGRAS:
- Avalie cada aspecto com uma nota de 0 a 100.
- Identifique problemas específicos citando trechos da conversa.
- Sugira melhorias concretas e acionáveis.
- Se fluxos foram disparados, verifique se a DESCRIÇÃO do fluxo realmente corresponde à necessidade do cliente.
- Seja crítico mas justo.

${nicheInfo ? `CONTEXTO DO NICHO: "${nicheInfo.name}"\nPrompt do sistema: ${nicheInfo.system_prompt}` : ""}

${kbContext ? `BASE DE CONHECIMENTO (use como referência para validar respostas):\n${kbContext}` : ""}

FLUXOS EXECUTADOS NESTA CONVERSA:
${flowSummary || "Nenhum fluxo foi executado."}

Responda EXCLUSIVAMENTE usando a função fornecida.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analise esta conversa de atendimento:\n\n${transcript}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_analysis",
            description: "Gera a análise de qualidade da conversa",
            parameters: {
              type: "object",
              properties: {
                overall_score: { type: "integer", description: "Nota geral de 0-100" },
                flow_accuracy_score: { type: "integer", description: "Nota de precisão dos fluxos 0-100" },
                response_quality_score: { type: "integer", description: "Nota de qualidade das respostas 0-100" },
                context_adherence_score: { type: "integer", description: "Nota de aderência ao contexto 0-100" },
                summary: { type: "string", description: "Resumo geral da análise em 2-3 frases" },
                issues: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["error", "warning", "info"] },
                      title: { type: "string" },
                      description: { type: "string" },
                      excerpt: { type: "string", description: "Trecho relevante da conversa" },
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

    // Save to database
    const { data: saved, error: saveError } = await supabase
      .from("manager_analyses")
      .insert({
        conversation_id,
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

    // Log AI usage
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
