import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function getFunnelStageInfo(
  stage: string,
  stagesMap: Map<string, { label: string; description: string; strategy: string }>
): { label: string; description: string; strategy: string } {
  const info = stagesMap.get(stage);
  if (info) return info;
  return {
    label: stage,
    description: "Etapa do funil",
    strategy: "Aborde o lead de forma natural, referenciando o contexto da conversa.",
  };
}

// Detect when the salesperson (agent) has given up on the sale.
// Checks recent agent messages for phrases that indicate abandonment.
function detectAgentGaveUp(messages: any[]): { gaveUp: boolean; reason?: string } {
  const GIVEUP_PATTERNS: RegExp[] = [
    /me\s+chama?\s+(depois|mais\s+tarde|quando\s+puder)/i,
    /me\s+chame\s+(depois|mais\s+tarde|quando\s+puder)/i,
    /quando\s+(quiser|precisar|tiver\s+interesse|quiser\s+comprar)/i,
    /se\s+mudar\s+de\s+ideia/i,
    /se\s+quiser\s+(voltar|retomar|comprar)/i,
    /pode\s+fechar\s*(a\s+conversa)?/i,
    /fica\s+(à\s+)?vontade/i,
    /qualquer\s+coisa\s+me\s+(chama?|fala?|avisa?|manda\s+mensagem)/i,
    /se\s+precisar\s+(de\s+mim|de\s+algo)/i,
    /quando\s+quiser\s+comprar\s+me\s+(avisa?|fala?|chama?)/i,
    /t[aá]\s+(bom|ok|certo)[,.]?\s*(qualquer\s+coisa|fala|me\s+chama)/i,
    /n[aã]o\s+vou\s+(insistir|empurrar|forçar)/i,
    /sem\s+press[aã]o/i,
  ];

  // Only check agent messages (not customer)
  const agentMessages = messages.filter(
    (m: any) => m.sender_type !== "customer"
  );

  // Check the last 8 agent messages
  const recentAgentMsgs = agentMessages.slice(0, 8);

  for (const msg of recentAgentMsgs) {
    const content = (msg.content || "").toLowerCase();
    for (const pattern of GIVEUP_PATTERNS) {
      if (pattern.test(content)) {
        return { gaveUp: true, reason: content.substring(0, 100) };
      }
    }
  }

  return { gaveUp: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return jsonResponse({ error: "AI not configured" }, 500);
    }

    const now = new Date();
    const currentHour = now.getUTCHours() - 3;
    const normalizedHour = currentHour < 0 ? currentHour + 24 : currentHour;

    console.log(`[ai-follow-up] ⏰ Hora atual (BRT): ${normalizedHour}h | UTC: ${now.toISOString()}`);

    // Get all active templates
    const { data: templates } = await supabase
      .from("follow_up_templates")
      .select("*")
      .eq("is_active", true)
      .order("escalation_level", { ascending: true });

    if (!templates?.length) {
      console.log("[ai-follow-up] ❌ Nenhum template ativo encontrado");
      return jsonResponse({ processed: 0, reason: "No active templates" });
    }

    console.log(`[ai-follow-up] 📋 Templates ativos: ${templates.length}`);

    // Filter templates by active hours
    const activeTemplates = templates.filter((t: any) => {
      return normalizedHour >= t.active_hours_start && normalizedHour < t.active_hours_end;
    });

    if (!activeTemplates.length) {
      console.log(`[ai-follow-up] ❌ Nenhum template ativo na hora ${normalizedHour}.`);
      return jsonResponse({ processed: 0, reason: `No templates active at hour ${normalizedHour}` });
    }

    console.log(`[ai-follow-up] ✅ ${activeTemplates.length} templates ativos na hora ${normalizedHour}`);

    // Find minimum delay to filter conversations efficiently
    const minDelay = Math.min(...activeTemplates.map((t: any) => t.delay_hours));
    const cutoffTime = new Date(now.getTime() - minDelay * 60 * 60 * 1000).toISOString();

    // Get niche IDs from active templates
    const nicheIds = [...new Set(activeTemplates.map((t: any) => t.niche_id).filter(Boolean))];

    if (!nicheIds.length) {
      console.log("[ai-follow-up] ❌ Nenhum nicho configurado nos templates ativos");
      return jsonResponse({ processed: 0, reason: "No niches in templates" });
    }

    // Collect funnel stages from templates (including 'all')
    const templateStages = [...new Set(activeTemplates.map((t: any) => t.funnel_stage || 'all'))];
    const hasAllStage = templateStages.includes('all');

    // Load automation flows referenced by active templates
    const flowIds = [...new Set(activeTemplates.map((t: any) => t.flow_id).filter(Boolean))];
    let flowsMap = new Map<string, { name: string; description: string; nodesText: string }>();

    if (flowIds.length > 0) {
      const [flowsRes, nodesRes] = await Promise.all([
        supabase.from("automation_flows").select("id, name, description").in("id", flowIds),
        supabase.from("automation_nodes").select("flow_id, node_type, label, config, sort_order")
          .in("flow_id", flowIds)
          .order("sort_order"),
      ]);

      const nodesByFlow = new Map<string, any[]>();
      for (const node of (nodesRes.data || [])) {
        if (!nodesByFlow.has(node.flow_id)) nodesByFlow.set(node.flow_id, []);
        nodesByFlow.get(node.flow_id)!.push(node);
      }

      for (const flow of (flowsRes.data || [])) {
        const nodes = nodesByFlow.get(flow.id) || [];
        const nodesText = nodes.map((n: any, idx: number) => {
          const cfg = n.config || {};
          const msgPreview = cfg.message ? ` → "${String(cfg.message).substring(0, 80)}"` : '';
          return `  ${idx + 1}. [${n.node_type}] ${n.label}${msgPreview}`;
        }).join("\n");
        flowsMap.set(flow.id, { name: flow.name, description: flow.description || '', nodesText });
      }

      console.log(`[ai-follow-up] 🔀 ${flowIds.length} fluxos carregados como contexto`);
    }

    // Build query
    let query = supabase
      .from("conversations")
      .select("id, contact_name, contact_phone, niche_id, status, updated_at, tags, ad_title, funnel_stage, sale_registered_at")
      .neq("status", "resolved")
      .is("sale_registered_at", null)
      .in("niche_id", nicheIds)
      .lt("updated_at", cutoffTime)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (!hasAllStage) {
      const specificStages = templateStages.filter((s: string) => s !== 'all');
      query = query.in("funnel_stage", specificStages);
    }

    const { data: rawConversations, error: convError } = await query;

    const conversations = (rawConversations || []).slice(0, 50);

    if (convError) {
      console.error(`[ai-follow-up] ❌ Erro ao buscar conversas: ${convError.message}`);
      return jsonResponse({ error: convError.message }, 500);
    }

    if (!conversations?.length) {
      console.log(`[ai-follow-up] ❌ Nenhuma conversa elegível`);
      return jsonResponse({ processed: 0, reason: "No eligible conversations" });
    }

    console.log(`[ai-follow-up] 📊 ${conversations.length} conversas elegíveis`);

    // Load niche data in parallel
    const [nichesRes, kbRes, stagesRes] = await Promise.all([
      supabase.from("niches").select("id, name, system_prompt, language").in("id", nicheIds),
      supabase.from("knowledge_base_items").select("title, content, niche_id").in("niche_id", nicheIds).limit(50),
      supabase.from("niche_funnel_stages").select("*").in("niche_id", nicheIds).order("sort_order"),
    ]);

    const nichesMap = new Map((nichesRes.data || []).map((n: any) => [n.id, n]));

    const nicheStagesMap = new Map<string, Map<string, { label: string; description: string; strategy: string }>>();
    for (const s of (stagesRes.data || [])) {
      if (!nicheStagesMap.has(s.niche_id)) nicheStagesMap.set(s.niche_id, new Map());
      nicheStagesMap.get(s.niche_id)!.set(s.stage_key, { label: s.label, description: s.description, strategy: s.strategy });
    }

    let totalSent = 0;
    let totalGaveUp = 0;
    const skippedReasons: Record<string, number> = {};

    function trackSkip(reason: string) {
      skippedReasons[reason] = (skippedReasons[reason] || 0) + 1;
    }

    for (const conv of conversations) {
      // Get recent messages for this conversation
      const { data: lastMessages } = await supabase
        .from("messages")
        .select("sender_type, created_at, content, message_type, media_url")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (!lastMessages?.length) {
        trackSkip("sem_mensagens");
        continue;
      }

      // ── WHATSAPP 24H WINDOW CHECK ────────────────────────────────────────────
      // WhatsApp API only allows sending messages within 24h of last customer message
      const lastCustomerMsg = lastMessages.find((m: any) => m.sender_type === "customer");
      if (!lastCustomerMsg) {
        trackSkip("sem_msg_do_cliente");
        continue;
      }
      const lastCustomerMsgTime = new Date(lastCustomerMsg.created_at);
      const hoursSinceCustomerMsg = (now.getTime() - lastCustomerMsgTime.getTime()) / (1000 * 60 * 60);
      if (hoursSinceCustomerMsg > 24) {
        trackSkip(`janela_24h_expirada(${Math.round(hoursSinceCustomerMsg)}h)`);
        continue;
      }
      // ─────────────────────────────────────────────────────────────────────────

      const lastMsg = lastMessages[0];
      if (lastMsg.sender_type === "customer") {
        trackSkip("ultima_msg_do_cliente");
        continue;
      }

      // ── GIVE-UP DETECTION ────────────────────────────────────────────────────
      // Check if the salesperson has abandoned this sale in recent messages
      const giveUpResult = detectAgentGaveUp(lastMessages);
      if (giveUpResult.gaveUp) {
        console.log(`[ai-follow-up] 🚫 Vendedor desistiu em "${conv.contact_name}": "${giveUpResult.reason}"`);
        // Block follow-ups for this conversation permanently
        // Skip this conversation — agent gave up
        totalGaveUp++;
        trackSkip("vendedor_desistiu");
        continue;
      }
      // ─────────────────────────────────────────────────────────────────────────

      const lastMsgTime = new Date(lastMsg.created_at);
      const hoursSinceLastMsg = (now.getTime() - lastMsgTime.getTime()) / (1000 * 60 * 60);

      const nicheStages = conv.niche_id ? nicheStagesMap.get(conv.niche_id) || new Map() : new Map();
      const funnelStage = getFunnelStageInfo(conv.funnel_stage || "etapa_1", nicheStages);

      // Get existing follow-up executions
      const { data: existingExecs } = await supabase
        .from("follow_up_executions")
        .select("template_id, attempt_number, status")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false });

      const nicheTemplates = activeTemplates.filter((t: any) => t.niche_id === conv.niche_id);
      if (!nicheTemplates.length) {
        trackSkip("sem_template_pro_nicho");
        continue;
      }

      let sentForConv = false;

      for (const template of nicheTemplates) {
        if (sentForConv) break;

        // Check funnel stage match
        const templateStage = template.funnel_stage || 'all';
        const convStage = conv.funnel_stage || 'etapa_1';
        if (templateStage !== 'all' && templateStage !== convStage) {
          trackSkip(`etapa_incompativel(${convStage}!=${templateStage})`);
          continue;
        }

        // Check delay
        if (hoursSinceLastMsg < template.delay_hours) {
          trackSkip(`delay_insuficiente(${Math.round(hoursSinceLastMsg)}h<${template.delay_hours}h)`);
          continue;
        }

        // Check attempts
        const templateExecs = (existingExecs || []).filter((e: any) => e.template_id === template.id);
        const attemptsDone = templateExecs.length;
        if (attemptsDone >= template.max_attempts) {
          trackSkip(`max_tentativas(${attemptsDone}/${template.max_attempts})`);
          continue;
        }

        // Check pending
        if (templateExecs.some((e: any) => e.status === "pending")) {
          trackSkip("execucao_pendente");
          continue;
        }

        // Check if customer responded after last follow-up
        const lastExec = templateExecs[0];
        if (lastExec && lastExec.status === "sent") {
          const customerMsgAfterFollowUp = lastMessages.find((m: any) => m.sender_type === "customer");
          if (customerMsgAfterFollowUp) {
            await supabase
              .from("follow_up_executions")
              .update({ status: "responded", responded_at: now.toISOString() })
              .eq("conversation_id", conv.id)
              .eq("template_id", template.id)
              .eq("status", "sent");
            trackSkip("cliente_respondeu");
            continue;
          }
        }

        console.log(`[ai-follow-up] 🚀 Gerando follow-up para ${conv.contact_name} (etapa: ${funnelStage.label}, template: ${template.name}, tentativa: ${attemptsDone + 1}/${template.max_attempts})`);

        // Build context
        const allMsgsChronological = [...lastMessages].reverse();
        const recentMessages = allMsgsChronological
          .map((m: any) => {
            let content = m.content || "";
            if (!content.trim()) {
              const labels: Record<string, string> = {
                image: "[Imagem enviada]", video: "[Vídeo enviado]", audio: "[Áudio enviado]",
                document: "[Documento enviado]", sticker: "[Sticker]",
              };
              content = labels[m.message_type] || "[Mídia]";
            }
            const timestamp = new Date(m.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
            return `[${timestamp}] ${m.sender_type === "customer" ? "Cliente" : "Agente"}: ${content}`;
          })
          .join("\n");

        const nicheKb = (kbRes.data || []).filter((k: any) => k.niche_id === conv.niche_id);
        const kbContext = nicheKb.length
          ? `\n\nBASE DE CONHECIMENTO DO NICHO:\n${nicheKb.map((k: any) => `- ${k.title}: ${k.content.substring(0, 300)}`).join("\n")}`
          : "";

        const nicheInfo = conv.niche_id ? nichesMap.get(conv.niche_id) : null;

        const nicheLanguage = nicheInfo?.language || "pt-BR";
        const langInstruction = nicheLanguage === "es"
          ? "IDIOMA: Escreva TODA a mensagem em ESPANHOL (español). O cliente fala espanhol."
          : "IDIOMA: Escreva TODA a mensagem em PORTUGUÊS BRASILEIRO.";

        // Build automation flow context if template has a flow_id
        let flowContext = "";
        if (template.flow_id && flowsMap.has(template.flow_id)) {
          const flow = flowsMap.get(template.flow_id)!;
          flowContext = `\n\nFLUXO DE AUTOMAÇÃO DESTE TEMPLATE: "${flow.name}"
${flow.description ? `Descrição: ${flow.description}` : ""}
Etapas do fluxo (jornada do cliente):
${flow.nodesText || "(sem etapas definidas)"}

Use este fluxo para entender a jornada completa do cliente e adapte o follow-up ao estágio atual da conversa dentro deste fluxo.`;
        }

        const systemPrompt = `Você é um especialista em follow-up de vendas via WhatsApp. Gere uma mensagem de follow-up altamente personalizada com base no CONTEXTO COMPLETO da conversa e na ETAPA DO FUNIL em que o lead se encontra.

${nicheInfo ? `NICHO: ${nicheInfo.name}\nCONTEXTO DO NEGÓCIO: ${nicheInfo.system_prompt}` : ""}
${kbContext}
${flowContext}

ETAPA DO FUNIL DO LEAD: ${funnelStage.label}
${funnelStage.description}

ESTRATÉGIA PARA ESTA ETAPA:
${funnelStage.strategy}

IMPORTANTE: A etapa do funil foi definida pelo fluxo de automação. Adapte 100% da sua abordagem a esta etapa específica.

${template.trigger_condition ? `CONDIÇÃO DE ATIVAÇÃO DESTE FOLLOW-UP:\n${template.trigger_condition}\nUse esta condição como contexto adicional para entender POR QUE este follow-up está sendo enviado.` : ""}

REGRAS:
1. A mensagem DEVE ser natural, como se fosse de um humano real, não um robô.
2. NÃO use saudações genéricas como "Olá, tudo bem?" ou "Boa tarde!".
3. FAÇA referência ESPECÍFICA ao contexto da conversa — mencione o que o cliente falou, perguntou ou demonstrou interesse.
4. Nível de urgência: ${template.escalation_level} de ${nicheTemplates.length} (1=suave e amigável, mais alto=mais direto/urgente com senso de escassez).
5. Tentativa ${attemptsDone + 1} de ${template.max_attempts} para este nível.
6. Objetivo e instruções deste follow-up: ${template.objective}
7. Use como base o modelo: "${template.message_template}" — mas ADAPTE COMPLETAMENTE ao contexto real da conversa.
8. Mantenha a mensagem curta (máx 3-4 linhas).
9. Use emojis com moderação (máx 2).
10. NUNCA mencione que é um robô, IA ou sistema automatizado.
11. Se o lead mencionou um produto/serviço específico, FOQUE nele.
12. ${template.image_url ? `IMPORTANTE: Uma IMAGEM será enviada junto com sua mensagem. Sua mensagem será a LEGENDA da imagem. Adapte o texto sabendo que o cliente verá a imagem junto. Não descreva a imagem no texto, apenas complemente.` : ""}
13. ${conv.ad_title ? `O lead veio do anúncio: "${conv.ad_title}". Use isso como contexto se relevante.` : ""}
14. ${(conv.tags || []).length > 0 ? `Tags do contato: ${conv.tags!.join(", ")}. Podem indicar interesses ou estágio.` : ""}
15. ${langInstruction}`;

        // Generate AI follow-up
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: `Nome do cliente: ${conv.contact_name}
Etapa do funil: ${funnelStage.label}
Horas sem resposta: ${Math.round(hoursSinceLastMsg)}h
Status da conversa: ${conv.status}

HISTÓRICO COMPLETO DA CONVERSA:
${recentMessages}

Gere a mensagem de follow-up:`,
              },
            ],
            stream: false,
          }),
        });

        if (!aiResponse.ok) {
          const errText = await aiResponse.text();
          console.error(`[ai-follow-up] ❌ Erro na IA para ${conv.contact_name}: HTTP ${aiResponse.status} - ${errText}`);
          trackSkip(`erro_ia(${aiResponse.status})`);
          continue;
        }

        const aiResult = await aiResponse.json();
        const followUpMessage = aiResult.choices?.[0]?.message?.content?.trim();
        if (!followUpMessage) {
          console.error(`[ai-follow-up] ❌ IA retornou mensagem vazia para ${conv.contact_name}`);
          trackSkip("ia_msg_vazia");
          continue;
        }

        console.log(`[ai-follow-up] 💬 Mensagem gerada para ${conv.contact_name}: "${followUpMessage.substring(0, 80)}..."`);

        // Log AI usage
        const usage = aiResult.usage;
        if (usage) {
          await supabase.from("ai_usage_logs").insert({
            function_name: "ai-follow-up",
            model: "google/gemini-3-flash-preview",
            input_tokens: usage.prompt_tokens || 0,
            output_tokens: usage.completion_tokens || 0,
            total_tokens: usage.total_tokens || 0,
            conversation_id: conv.id,
          });
        }

        // Insert execution
        await supabase.from("follow_up_executions").insert({
          conversation_id: conv.id,
          template_id: template.id,
          attempt_number: attemptsDone + 1,
          status: "pending",
          scheduled_at: now.toISOString(),
          message_sent: followUpMessage,
        });

        // Determine send function and build payload
        let sendFunction = "whatsapp-send";
        const sendBody: Record<string, unknown> = {
          to: conv.contact_phone,
          message: followUpMessage,
          conversationId: conv.id,
          senderLabel: "ia-follow-up",
        };

        if (template.image_url) {
          sendBody.type = "image";
          sendBody.mediaUrl = template.image_url;
          console.log(`[ai-follow-up] 🖼️ Template tem imagem: ${template.image_url.substring(0, 80)}...`);
        }

        if (conv.niche_id) {
          const { data: nicheConn } = await supabase
            .from("niche_connections")
            .select("connection_config_id")
            .eq("niche_id", conv.niche_id)
            .limit(1)
            .maybeSingle();

          if (nicheConn) {
            const { data: connConfig } = await supabase
              .from("connection_configs")
              .select("connection_id")
              .eq("id", nicheConn.connection_config_id)
              .single();

            if (connConfig?.connection_id?.startsWith("zapi")) {
              sendFunction = "zapi-send";
            }
          }
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        console.log(`[ai-follow-up] 📤 Enviando via ${sendFunction} para ${conv.contact_name} (${conv.contact_phone})${template.image_url ? ' [COM IMAGEM]' : ''}`);

        const sendResp = await fetch(`${supabaseUrl}/functions/v1/${sendFunction}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(sendBody),
        });

        if (sendResp.ok) {
          await supabase
            .from("follow_up_executions")
            .update({ status: "sent", sent_at: now.toISOString() })
            .eq("conversation_id", conv.id)
            .eq("template_id", template.id)
            .eq("attempt_number", attemptsDone + 1);

          totalSent++;
          sentForConv = true;
          console.log(`[ai-follow-up] ✅ Enviado para ${conv.contact_name} (template: ${template.name}, tentativa: ${attemptsDone + 1})`);
        } else {
          const errText = await sendResp.text();
          console.error(`[ai-follow-up] ❌ Falha ao enviar para ${conv.contact_name}: ${errText}`);
          trackSkip(`erro_envio(${sendResp.status})`);
        }
      }
    }

    const skipSummary = Object.entries(skippedReasons).map(([reason, count]) => `${reason}: ${count}`).join(" | ");
    console.log(`[ai-follow-up] 📊 Resumo: ${totalSent} enviados, ${totalGaveUp} bloqueados (desistência), ${conversations.length} processadas. Motivos de skip: ${skipSummary || "nenhum"}`);

    return jsonResponse({ processed: totalSent, gaveUpBlocked: totalGaveUp, skippedReasons });
  } catch (error) {
    console.error("[ai-follow-up] ❌ Erro fatal:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
