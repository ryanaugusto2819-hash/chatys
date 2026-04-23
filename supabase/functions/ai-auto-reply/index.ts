// ── Workspace AI Config Helper ──────────────────────────────────
  async function getWorkspaceAIConfig(supabase: any, workspaceId: string | null | undefined) {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
    const fallback = {
      apiUrl: "https://ai.gateway.lovable.dev/v1/chat/completions",
      apiKey: lovableKey,
      model: "google/gemini-3-flash-preview",
      temperature: 0.7,
      maxTokens: 1000,
      systemPrompt: null as string | null,
    };
    if (!workspaceId) return fallback;
    const { data } = await supabase
      .from("ai_configs")
      .select("openai_api_key, model, temperature, max_tokens, system_prompt")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!data?.openai_api_key) return fallback;
    return {
      apiUrl: "https://api.openai.com/v1/chat/completions",
      apiKey: data.openai_api_key,
      model: data.model || "gpt-4o-mini",
      temperature: data.temperature ?? 0.7,
      maxTokens: data.max_tokens ?? 1000,
      systemPrompt: data.system_prompt || null,
    };
  }
  // ───────────────────────────────────────────────────────────────

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform,
  x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };

  function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  function getSupabase() {
    return createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
  }

  async function handleSchedule(conversationId: string) {
    const supabase = getSupabase();
    const scheduledFor = new Date(Date.now() + 60_000).toISOString();
    const { error } = await supabase
      .from("pending_ai_replies")
      .upsert(
        { conversation_id: conversationId, scheduled_for: scheduledFor, processed_at: null },
        { onConflict: "conversation_id" }
      );
    if (error) {
      console.error("[ai-auto-reply][schedule] upsert error:", error);
      return jsonResponse({ error: "Failed to schedule" }, 500);
    }
    return jsonResponse({ scheduled: true, scheduled_for: scheduledFor });
  }

  async function handleProcess(conversationId: string) {
    const supabase = getSupabase();

    const convPromise = supabase
      .from("conversations")
      .select("contact_phone, niche_id, connection_config_id, sale_registered_at, workspace_id")
      .eq("id", conversationId)
      .single();

    const { data: conversation } = await convPromise;

    if (!conversation) {
      return jsonResponse({ error: "Conversation not found" }, 404);
    }

    if (conversation.sale_registered_at) {
      console.log(`[ai-auto-reply] Skipping: sale already registered for ${conversationId}`);
      return jsonResponse({ skipped: true, reason: "Sale already registered" });
    }

    const nicheId = conversation.niche_id;

    let aiEnabled = false;
    let systemPrompt = "Você é um assistente virtual amigável. Responda de forma concisa e útil em português
  brasileiro.";
    let nicheLanguage = "pt-BR";

    if (nicheId) {
      const { data: niche } = await supabase
        .from("niches")
        .select("auto_reply_enabled, system_prompt, language")
        .eq("id", nicheId)
        .single();
      if (niche) {
        aiEnabled = niche.auto_reply_enabled;
        systemPrompt = niche.system_prompt || systemPrompt;
        nicheLanguage = niche.language || "pt-BR";
      }
    } else {
      const { data: config } = await supabase
        .from("connection_configs")
        .select("config")
        .eq("connection_id", "ai-auto-reply")
        .maybeSingle();
      const aiConfig = config?.config as Record<string, unknown> | null;
      aiEnabled = !!aiConfig?.enabled;
      if (aiConfig?.system_prompt) systemPrompt = aiConfig.system_prompt as string;
    }

    if (!aiEnabled) {
      return jsonResponse({ skipped: true, reason: "Auto-reply disabled" });
    }

    const { data: lastCustomerMsg } = await supabase
      .from("messages")
      .select("created_at")
      .eq("conversation_id", conversationId)
      .eq("sender_type", "customer")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!lastCustomerMsg) {
      return jsonResponse({ skipped: true, reason: "No customer message found" });
    }

    const { data: recentReplies } = await supabase
      .from("messages")
      .select("id, sender_type, sender_label")
      .eq("conversation_id", conversationId)
      .neq("sender_type", "customer")
      .gt("created_at", lastCustomerMsg.created_at)
      .limit(1);

    if (recentReplies && recentReplies.length > 0) {
      const reply = recentReplies[0];
      return jsonResponse({
        skipped: true,
        reason: `Already replied by ${reply.sender_label || reply.sender_type}`,
      });
    }

    console.log("[ai-auto-reply] No reply found, generating AI response...");

    let kbQuery = supabase
      .from("knowledge_base_items")
      .select("type, title, content")
      .order("created_at", { ascending: true })
      .limit(50);

    if (nicheId) {
      kbQuery = kbQuery.eq("niche_id", nicheId);
    } else {
      kbQuery = kbQuery.is("niche_id", null);
    }

    const [kbResult, msgsResult] = await Promise.all([
      kbQuery,
      supabase
        .from("messages")
        .select("content, sender_type, created_at, message_type, media_url")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(20),
    ]);

    const kbItems = kbResult.data;
    const messages = msgsResult.data;

    if (!messages?.length) {
      return jsonResponse({ skipped: true, reason: "No messages" });
    }

    let knowledgeContext = "";
    if (kbItems && kbItems.length > 0) {
      const sections: string[] = [];
      for (const item of kbItems) {
        if (item.type === "qa") {
          sections.push(`Pergunta: ${item.title}\nResposta: ${item.content}`);
        } else if (item.type === "text") {
          sections.push(`[${item.title}]\n${item.content}`);
        } else if (item.type === "file") {
          sections.push(`[Arquivo: ${item.title}]\n${item.content}`);
        }
      }
      knowledgeContext = "\n\n--- BASE DE CONHECIMENTO ---\nUse as informações abaixo para responder com precisão:\n\n"
  + sections.join("\n\n");
    }

    const langInstruction = nicheLanguage === "es"
      ? "\n\nIMPORTANTE: Responda SEMPRE em espanhol (español). Toda a comunicação deve ser em espanhol."
      : "\n\nIMPORTANTE: Responda SEMPRE em português brasileiro.";

    const fullSystemPrompt = systemPrompt + knowledgeContext + langInstruction;

    const chatMessages: Array<{ role: string; content: unknown }> = [
      { role: "system", content: fullSystemPrompt },
    ];

    for (const m of messages) {
      const role = m.sender_type === "customer" ? "user" : "assistant";
      const hasImage = m.message_type === "image" && m.media_url;
      if (hasImage && role === "user") {
        const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
        if (m.content?.trim()) {
          parts.push({ type: "text", text: m.content });
        } else {
          parts.push({ type: "text", text: "O cliente enviou esta imagem:" });
        }
        parts.push({ type: "image_url", image_url: { url: m.media_url } });
        chatMessages.push({ role, content: parts });
      } else {
        let text = m.content || "";
        if (!text.trim() && m.message_type !== "text") {
          const labels: Record<string, string> = {
            audio: "[Áudio enviado]",
            video: "[Vídeo enviado]",
            document: "[Documento enviado]",
            sticker: "[Sticker enviado]",
          };
          text = labels[m.message_type] || "[Mídia enviada]";
        }
        chatMessages.push({ role, content: text });
      }
    }

    // Call AI using workspace config
    const aiConfig = await getWorkspaceAIConfig(supabase, conversation.workspace_id);
    if (!aiConfig.apiKey) {
      console.error("AI not configured (no API key)");
      return jsonResponse({ error: "AI not configured" }, 500);
    }

    const aiResponse = await fetch(aiConfig.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: chatMessages,
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
    const replyContent = aiResult.choices?.[0]?.message?.content;

    const usage = aiResult.usage;
    if (usage) {
      await supabase.from("ai_usage_logs").insert({
        function_name: "ai-auto-reply",
        model: aiConfig.model,
        input_tokens: usage.prompt_tokens || 0,
        output_tokens: usage.completion_tokens || 0,
        total_tokens: usage.total_tokens || 0,
        conversation_id: conversationId,
      });
    }

    if (!replyContent) {
      return jsonResponse({ error: "Empty AI response" }, 500);
    }

    let phoneNumberId: string | null = null;

    if (conversation.connection_config_id) {
      const { data: connConfig } = await supabase
        .from("connection_configs")
        .select("config")
        .eq("id", conversation.connection_config_id)
        .single();
      const cfg = connConfig?.config as Record<string, unknown> | null;
      if (typeof cfg?.phone_number_id === "string" && cfg.phone_number_id.trim()) {
        phoneNumberId = cfg.phone_number_id;
      }
    }

    if (!phoneNumberId && nicheId) {
      const { data: nicheData } = await supabase
        .from("niches")
        .select("whatsapp_phone_number_id")
        .eq("id", nicheId)
        .single();
      phoneNumberId = nicheData?.whatsapp_phone_number_id || null;
    }

    if (!phoneNumberId) {
      phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || null;
    }

    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");

    await Promise.all([
      supabase.from("messages").insert({
        conversation_id: conversationId,
        content: replyContent,
        sender_type: "agent",
        message_type: "text",
        status: phoneNumberId && accessToken ? "pending" : "failed",
        sender_label: "ia-auto-reply",
      }),
      supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId),
    ]);

    if (!phoneNumberId || !accessToken) {
      console.error("WhatsApp credentials missing for auto-reply");
      return jsonResponse({ error: "WhatsApp not configured, but message saved", reply: replyContent }, 500);
    }

    const waResponse = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: conversation.contact_phone,
          type: "text",
          text: { body: replyContent },
        }),
      }
    );

    const waResult = await waResponse.json();

    if (!waResponse.ok) {
      console.error("WhatsApp send error:", waResult);
      await supabase
        .from("messages")
        .update({ status: "failed", provider_error: JSON.stringify(waResult.error || waResult) })
        .eq("conversation_id", conversationId)
        .eq("sender_label", "ia-auto-reply")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1);
      return jsonResponse({ error: "Failed to send auto-reply", reply: replyContent, details: waResult }, 502);
    }

    await supabase
      .from("messages")
      .update({ status: "sent", provider_message_id: waResult.messages?.[0]?.id })
      .eq("conversation_id", conversationId)
      .eq("sender_label", "ia-auto-reply")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1);

    return jsonResponse({ success: true, reply: replyContent });
  }

  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    try {
      const body = await req.json();
      const { conversationId, mode = "schedule" } = body;
      if (!conversationId) {
        return jsonResponse({ error: "conversationId is required" }, 400);
      }
      if (mode === "schedule") {
        return await handleSchedule(conversationId);
      } else if (mode === "process") {
        return await handleProcess(conversationId);
      } else {
        return jsonResponse({ error: "Invalid mode. Use 'schedule' or 'process'" }, 400);
      }
    } catch (error) {
      console.error("Auto-reply error:", error);
      return jsonResponse({ error: "Internal server error" }, 500);
    }
  });

  ---
  2. ai-manager

  import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
  import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

  // ── Workspace AI Config Helper ──────────────────────────────────
  async function getWorkspaceAIConfig(supabase: any, workspaceId: string | null | undefined) {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
    const fallback = {
      apiUrl: "https://ai.gateway.lovable.dev/v1/chat/completions",
      apiKey: lovableKey,
      model: "google/gemini-2.5-flash",
      temperature: 0.7,
      maxTokens: 1000,
      systemPrompt: null as string | null,
    };
    if (!workspaceId) return fallback;
    const { data } = await supabase
      .from("ai_configs")
      .select("openai_api_key, model, temperature, max_tokens, system_prompt")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!data?.openai_api_key) return fallback;
    return {
      apiUrl: "https://api.openai.com/v1/chat/completions",
      apiKey: data.openai_api_key,
      model: data.model || "gpt-4o-mini",
      temperature: data.temperature ?? 0.7,
      maxTokens: data.max_tokens ?? 1000,
      systemPrompt: data.system_prompt || null,
    };
  }
  // ───────────────────────────────────────────────────────────────

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  type ManagerMode = "human" | "follow_up" | "flow_selector";

  const MODE_SYSTEM_PROMPTS: Record<ManagerMode, string> = {
    human: `Você é um GERENTE DE QUALIDADE especializado em avaliar VENDEDORES HUMANOS no atendimento via WhatsApp.

  Sua função é analisar exclusivamente o desempenho do ATENDENTE HUMANO (mensagens do "ATENDENTE"). Ignore mensagens do
  BOT/IA ao avaliar o desempenho — use as mensagens do bot apenas como contexto.

  Avalie:
  - Como o vendedor conduziu a conversa e criou rapport
  - Profissionalismo, empatia e educação no tratamento
  - Domínio do produto/serviço e capacidade de responder dúvidas
  - Técnica de vendas: identificação de necessidades, contorno de objeções, geração de urgência, fechamento
  - Resultado: o lead avançou no funil? A venda foi fechada? Houve perda de oportunidade clara?`,

    follow_up: `Você é um GERENTE especializado em avaliar a qualidade das mensagens de FOLLOW-UP geradas pela IA de
  Follow-Up.

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

  const MODE_DEFAULT_CRITERIA: Record<ManagerMode, Array<{ name: string; weight: number; description: string }>> = {
    human: [
      { name: "Profissionalismo e Empatia", weight: 25, description: "O atendente foi profissional, empático e educado
  com o cliente?" },
      { name: "Tempo de Resposta", weight: 15, description: "O atendente respondeu com agilidade e manteve o cliente
  engajado?" },
      { name: "Conhecimento do Produto", weight: 25, description: "O atendente demonstrou domínio correto do
  produto/serviço oferecido?" },
      { name: "Técnica de Vendas", weight: 35, description: "O atendente aplicou boas técnicas: identificou
  necessidades, contornou objeções e avançou no funil?" },
    ],
    follow_up: [
      { name: "Personalização", weight: 30, description: "A mensagem fez referência ao contexto real da conversa? Evitou
   ser genérica?" },
      { name: "Timing e Adequação ao Funil", weight: 25, description: "O follow-up foi enviado no momento e etapa
  certos?" },
      { name: "Tom Natural e Não Invasivo", weight: 20, description: "A mensagem soou humana, natural e respeitosa?" },
      { name: "Efetividade e Persuasão", weight: 25, description: "O follow-up reengajou o cliente? A abordagem foi
  persuasiva sem ser agressiva?" },
    ],
    flow_selector: [
      { name: "Precisão da Seleção", weight: 35, description: "O fluxo selecionado foi o mais adequado para a mensagem
  do cliente?" },
      { name: "Relevância do Trigger", weight: 25, description: "A condição de disparo fez sentido para o contexto?" },
      { name: "Qualidade dos Nós Executados", weight: 25, description: "As mensagens e ações dentro do fluxo foram
  relevantes e bem sequenciadas?" },
      { name: "Oportunidades Perdidas", weight: 15, description: "Houve fluxos mais adequados não acionados? Algum fluxo
   não foi disparado quando deveria?" },
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
            return `- Template: "${tpl?.name || 'desconhecido'}" | Nível ${tpl?.escalation_level || '?'} | Etapa:
  ${tpl?.funnel_stage || '?'} | Atraso: ${tpl?.delay_hours || '?'}h | Status: ${fe.status} | Enviado: ${sentAt}\n
  Mensagem: "${fe.message_sent?.substring(0, 200) || '(vazia)'}"`;
          }).join("\n");
        } else {
          followUpContext = "\n\nNenhum follow-up foi enviado para esta conversa.";
        }
      }

      let nicheInfo = null;
      if (conversation.niche_id) {
        const { data: niche } = await supabase
          .from("niches")
          .select("name, system_prompt")
          .eq("id", conversation.niche_id)
          .single();
        nicheInfo = niche;
      }

      const { data: managerConfig } = await supabase
        .from("manager_config")
        .select("*")
        .eq("mode", mode)
        .limit(1)
        .maybeSingle();

      const customPrompt = (managerConfig as any)?.custom_prompt || "";
      const evalCriteria = ((managerConfig as any)?.evaluation_criteria || []) as Array<{ name: string; weight: number;
  description: string }>;
      const activeCriteria = evalCriteria.length > 0 ? evalCriteria : MODE_DEFAULT_CRITERIA[mode];

      const { data: kbItems } = await supabase
        .from("knowledge_base_items")
        .select("title, content, type")
        .order("created_at", { ascending: false })
        .limit(30);

      const kbContext = (kbItems || []).map((item: any) => {
        if (item.type === "qa") return `P: ${item.title}\nR: ${item.content}`;
        return `[${item.title}]: ${item.content.substring(0, 500)}`;
      }).join("\n\n");

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
        return `- Fluxo "${flowName}" ${flowDesc ? `(${flowDesc})` : ""} — Status: ${fe.status}, Nós:
  ${fe.completed_nodes}/${fe.total_nodes}\n${nodesDetail}`;
      }).join("\n\n");

      const criteriaText = activeCriteria
        .map((c, i) => `${i + 1}. ${c.name} (Peso: ${c.weight}%): ${c.description}`)
        .join("\n");

      const modeLabels = { human: "Atendente Humano", follow_up: "IA de Follow-Up", flow_selector: "IA Seletora de
  Fluxo" };
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
                  response_quality_score: { type: "integer", description: "Nota de qualidade das respostas/mensagens
  0-100" },
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
                required: ["overall_score", "flow_accuracy_score", "response_quality_score", "context_adherence_score",
  "summary", "issues", "suggestions", "flows_analyzed"],
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
          model: aiConfig.model,
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

  ---
  3. ai-flow-selector

  import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

  // ── Workspace AI Config Helper ──────────────────────────────────
  async function getWorkspaceAIConfig(supabase: any, workspaceId: string | null | undefined) {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
    const fallback = {
      apiUrl: "https://ai.gateway.lovable.dev/v1/chat/completions",
      apiKey: lovableKey,
      model: "google/gemini-3-flash-preview",
      temperature: 0.7,
      maxTokens: 1000,
      systemPrompt: null as string | null,
    };
    if (!workspaceId) return fallback;
    const { data } = await supabase
      .from("ai_configs")
      .select("openai_api_key, model, temperature, max_tokens, system_prompt")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!data?.openai_api_key) return fallback;
    return {
      apiUrl: "https://api.openai.com/v1/chat/completions",
      apiKey: data.openai_api_key,
      model: data.model || "gpt-4o-mini",
      temperature: data.temperature ?? 0.7,
      maxTokens: data.max_tokens ?? 1000,
      systemPrompt: data.system_prompt || null,
    };
  }
  // ───────────────────────────────────────────────────────────────

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform,
  x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    if (error) throw error;

    const mappedNicheId = nicheConnection?.niche_id ?? null;

    if (params.nicheId !== mappedNicheId) {
      const { error: updateError } = await params.supabase
        .from("conversations")
        .update({ niche_id: mappedNicheId })
        .eq("id", params.conversationId);

      if (updateError) {
        console.error(`[ai-flow-selector] Failed to sync niche for conversation ${params.conversationId}:`,
  updateError);
      } else {
        console.log(`[ai-flow-selector] Synced niche for conversation ${params.conversationId} from ${params.nicheId ??
  "null"} to ${mappedNicheId ?? "null"} based on connection ${params.connectionConfigId}`);
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
        console.log(`[ai-flow-selector] Skipping: no niche mapped for connection ${conversation.connection_config_id} on
   conversation ${conversationId}`);
        return jsonResponse({ skipped: true, reason: "No niche mapped to connection" });
      }

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

      const { data: pastExecutions } = await supabase
        .from("flow_executions")
        .select("flow_id, status, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      const executedFlowIds = (pastExecutions || []).map((e) => e.flow_id);
      const executedFlowNames = executedFlowIds
        .map((id) => flows.find((f) => f.id === id)?.name)
        .filter(Boolean);

      const { data: messages } = await supabase
        .from("messages")
        .select("content, sender_type, message_type, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (!messages?.length) {
        return jsonResponse({ skipped: true, reason: "No messages" });
      }

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

      const aiConfig = await getWorkspaceAIConfig(supabase, conversation?.workspace_id);
      if (!aiConfig.apiKey) {
        console.error("AI not configured (no API key)");
        return jsonResponse({ error: "AI not configured" }, 500);
      }

      const systemPrompt = `Você é um selecionador inteligente de fluxos de automação para atendimento via WhatsApp.
  Sua função é analisar a conversa completa e decidir qual fluxo disparar com base no contexto.

  REGRAS OBRIGATÓRIAS:
  1. A DESCRIÇÃO DE CADA FLUXO É O CRITÉRIO PRINCIPAL DE SELEÇÃO. Cada fluxo tem uma descrição que explica EXATAMENTE
  quando ele deve ser disparado. Leia a descrição com atenção e SÓ selecione o fluxo se a situação descrita corresponder
   ao momento atual da conversa. Se a descrição diz "Quando o cliente perguntar sobre X", o cliente PRECISA ter
  perguntado sobre X.
  2. NUNCA selecione um fluxo que já foi enviado nesta conversa (marcado como [JÁ ENVIADO]).
  3. RESPEITE A ORDEM DE PRIORIDADE: Se existem fluxos numerados por etapas (Etapa 1, Etapa 2, Etapa 3...), NUNCA envie
  uma etapa posterior sem que as anteriores já tenham sido enviadas.
  4. Analise o CONTEÚDO COMPLETO de cada fluxo (todas as mensagens, perguntas e mídias das etapas) para entender o que
  cada fluxo faz antes de decidir.
  5. Analise TODA a conversa, não apenas a última mensagem, para entender o contexto completo do atendimento.
  6. Se nenhum fluxo se encaixar ou se todos os fluxos aplicáveis já foram enviados, retorne null. NA DÚVIDA, retorne
  null. É melhor não enviar nada do que enviar o fluxo errado.
  7. Seja MUITO criterioso: só selecione um fluxo se a descrição dele corresponder CLARAMENTE ao que o cliente está
  pedindo ou ao momento da conversa.
  8. NÃO envie fluxos apenas porque o cliente respondeu com uma saudação simples (ex: "bom dia", "oi", "olá"). Uma
  saudação NÃO é motivo para disparar um fluxo, a menos que seja a primeira mensagem do lead vinda de um anúncio.
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
                description: "Seleciona o fluxo de automação mais adequado para o momento atual da conversa, respeitando
   ordem de prioridade e histórico. Retorna null se nenhum se encaixar ou se já foi enviado.",
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
          model: aiConfig.model,
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

  ---
  4. ai-follow-up

  import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

  // ── Workspace AI Config Helper ──────────────────────────────────
  async function getWorkspaceAIConfig(supabase: any, workspaceId: string | null | undefined) {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
    const fallback = {
      apiUrl: "https://ai.gateway.lovable.dev/v1/chat/completions",
      apiKey: lovableKey,
      model: "google/gemini-3-flash-preview",
      temperature: 0.7,
      maxTokens: 1000,
      systemPrompt: null as string | null,
    };
    if (!workspaceId) return fallback;
    const { data } = await supabase
      .from("ai_configs")
      .select("openai_api_key, model, temperature, max_tokens, system_prompt")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!data?.openai_api_key) return fallback;
    return {
      apiUrl: "https://api.openai.com/v1/chat/completions",
      apiKey: data.openai_api_key,
      model: data.model || "gpt-4o-mini",
      temperature: data.temperature ?? 0.7,
      maxTokens: data.max_tokens ?? 1000,
      systemPrompt: data.system_prompt || null,
    };
  }
  // ───────────────────────────────────────────────────────────────

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform,
  x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const agentMessages = messages.filter((m: any) => m.sender_type !== "customer");
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

      const now = new Date();
      const currentHour = now.getUTCHours() - 3;
      const normalizedHour = currentHour < 0 ? currentHour + 24 : currentHour;

      console.log(`[ai-follow-up] ⏰ Hora atual (BRT): ${normalizedHour}h | UTC: ${now.toISOString()}`);

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

      const activeTemplates = templates.filter((t: any) => {
        return normalizedHour >= t.active_hours_start && normalizedHour < t.active_hours_end;
      });

      if (!activeTemplates.length) {
        console.log(`[ai-follow-up] ❌ Nenhum template ativo na hora ${normalizedHour}.`);
        return jsonResponse({ processed: 0, reason: `No templates active at hour ${normalizedHour}` });
      }

      console.log(`[ai-follow-up] ✅ ${activeTemplates.length} templates ativos na hora ${normalizedHour}`);

      const minDelay = Math.min(...activeTemplates.map((t: any) => t.delay_hours));
      const cutoffTime = new Date(now.getTime() - minDelay * 60 * 60 * 1000).toISOString();

      const nicheIds = [...new Set(activeTemplates.map((t: any) => t.niche_id).filter(Boolean))];

      if (!nicheIds.length) {
        console.log("[ai-follow-up] ❌ Nenhum nicho configurado nos templates ativos");
        return jsonResponse({ processed: 0, reason: "No niches in templates" });
      }

      const templateStages = [...new Set(activeTemplates.map((t: any) => t.funnel_stage || 'all'))];
      const hasAllStage = templateStages.includes('all');

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

      let query = supabase
        .from("conversations")
        .select("id, contact_name, contact_phone, niche_id, status, updated_at, tags, ad_title, funnel_stage,
  sale_registered_at, workspace_id")
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

      const BLOCKED_TAG_NAMES = ["fazer agendamento", "pedido agendado"];
      const { data: blockedTags } = await supabase
        .from("tags")
        .select("id, name")
        .in("name", BLOCKED_TAG_NAMES);
      const blockedTagIds = (blockedTags || []).map((t: any) => t.id);

      let conversations = (rawConversations || []).slice(0, 50);

      if (blockedTagIds.length > 0 && conversations.length > 0) {
        const phones = conversations.map((c: any) => c.contact_phone);
        const { data: blockedContacts } = await supabase
          .from("contact_tags")
          .select("contact_phone")
          .in("tag_id", blockedTagIds)
          .in("contact_phone", phones);
        const blockedPhones = new Set((blockedContacts || []).map((ct: any) => ct.contact_phone));
        const before = conversations.length;
        conversations = conversations.filter((c: any) => !blockedPhones.has(c.contact_phone));
        if (before !== conversations.length) {
          console.log(`[ai-follow-up] 🏷️ ${before - conversations.length} conversas bloqueadas por etiqueta
  (${BLOCKED_TAG_NAMES.join(", ")})`);
        }
      }

      if (convError) {
        console.error(`[ai-follow-up] ❌ Erro ao buscar conversas: ${convError.message}`);
        return jsonResponse({ error: convError.message }, 500);
      }

      if (!conversations?.length) {
        console.log(`[ai-follow-up] ❌ Nenhuma conversa elegível`);
        return jsonResponse({ processed: 0, reason: "No eligible conversations" });
      }

      console.log(`[ai-follow-up] 📊 ${conversations.length} conversas elegíveis`);

      const [nichesRes, kbRes, stagesRes] = await Promise.all([
        supabase.from("niches").select("id, name, system_prompt, language").in("id", nicheIds),
        supabase.from("knowledge_base_items").select("title, content, niche_id").in("niche_id", nicheIds).limit(50),
        supabase.from("niche_funnel_stages").select("*").in("niche_id", nicheIds).order("sort_order"),
      ]);

      const nichesMap = new Map((nichesRes.data || []).map((n: any) => [n.id, n]));

      const nicheStagesMap = new Map<string, Map<string, { label: string; description: string; strategy: string }>>();
      for (const s of (stagesRes.data || [])) {
        if (!nicheStagesMap.has(s.niche_id)) nicheStagesMap.set(s.niche_id, new Map());
        nicheStagesMap.get(s.niche_id)!.set(s.stage_key, { label: s.label, description: s.description, strategy:
  s.strategy });
      }

      let totalSent = 0;
      let totalGaveUp = 0;
      const skippedReasons: Record<string, number> = {};

      function trackSkip(reason: string) {
        skippedReasons[reason] = (skippedReasons[reason] || 0) + 1;
      }

      // Cache AI configs per workspace to avoid redundant DB queries
      const aiConfigCache = new Map<string, Awaited<ReturnType<typeof getWorkspaceAIConfig>>>();

      async function getConvAIConfig(workspaceId: string | null) {
        const key = workspaceId || "__fallback__";
        if (!aiConfigCache.has(key)) {
          aiConfigCache.set(key, await getWorkspaceAIConfig(supabase, workspaceId));
        }
        return aiConfigCache.get(key)!;
      }

      for (const conv of conversations) {
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

        const lastMsg = lastMessages[0];
        if (lastMsg.sender_type === "customer") {
          trackSkip("ultima_msg_do_cliente");
          continue;
        }

        const giveUpResult = detectAgentGaveUp(lastMessages);
        if (giveUpResult.gaveUp) {
          console.log(`[ai-follow-up] 🚫 Vendedor desistiu em "${conv.contact_name}": "${giveUpResult.reason}"`);
          totalGaveUp++;
          trackSkip("vendedor_desistiu");
          continue;
        }

        const lastMsgTime = new Date(lastMsg.created_at);
        const hoursSinceLastMsg = (now.getTime() - lastMsgTime.getTime()) / (1000 * 60 * 60);

        const nicheStages = conv.niche_id ? nicheStagesMap.get(conv.niche_id) || new Map() : new Map();
        const funnelStage = getFunnelStageInfo(conv.funnel_stage || "etapa_1", nicheStages);

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

          const templateStage = template.funnel_stage || 'all';
          const convStage = conv.funnel_stage || 'etapa_1';
          if (templateStage !== 'all' && templateStage !== convStage) {
            trackSkip(`etapa_incompativel(${convStage}!=${templateStage})`);
            continue;
          }

          if (hoursSinceLastMsg < template.delay_hours) {
            trackSkip(`delay_insuficiente(${Math.round(hoursSinceLastMsg)}h<${template.delay_hours}h)`);
            continue;
          }

          const templateExecs = (existingExecs || []).filter((e: any) => e.template_id === template.id);
          const attemptsDone = templateExecs.length;
          if (attemptsDone >= template.max_attempts) {
            trackSkip(`max_tentativas(${attemptsDone}/${template.max_attempts})`);
            continue;
          }

          if (templateExecs.some((e: any) => e.status === "pending")) {
            trackSkip("execucao_pendente");
            continue;
          }

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

          console.log(`[ai-follow-up] 🚀 Gerando follow-up para ${conv.contact_name} (etapa: ${funnelStage.label},
  template: ${template.name}, tentativa: ${attemptsDone + 1}/${template.max_attempts})`);

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
            ? `\n\nBASE DE CONHECIMENTO DO NICHO:\n${nicheKb.map((k: any) => `- ${k.title}: ${k.content.substring(0,
  300)}`).join("\n")}`
            : "";

          const nicheInfo = conv.niche_id ? nichesMap.get(conv.niche_id) : null;

          const nicheLanguage = nicheInfo?.language || "pt-BR";
          const langInstruction = nicheLanguage === "es"
            ? "IDIOMA: Escreva TODA a mensagem em ESPANHOL (español). O cliente fala espanhol."
            : "IDIOMA: Escreva TODA a mensagem em PORTUGUÊS BRASILEIRO.";

          let flowContext = "";
          if (template.flow_id && flowsMap.has(template.flow_id)) {
            const flow = flowsMap.get(template.flow_id)!;
            flowContext = `\n\nFLUXO DE AUTOMAÇÃO DESTE TEMPLATE: "${flow.name}"
  ${flow.description ? `Descrição: ${flow.description}` : ""}
  Etapas do fluxo (jornada do cliente):
  ${flow.nodesText || "(sem etapas definidas)"}

  Use este fluxo para entender a jornada completa do cliente e adapte o follow-up ao estágio atual da conversa dentro
  deste fluxo.`;
          }

          const systemPrompt = `Você é um especialista em follow-up de vendas via WhatsApp. Gere uma mensagem de
  follow-up altamente personalizada com base no CONTEXTO COMPLETO da conversa e na ETAPA DO FUNIL em que o lead se
  encontra.

  ${nicheInfo ? `NICHO: ${nicheInfo.name}\nCONTEXTO DO NEGÓCIO: ${nicheInfo.system_prompt}` : ""}
  ${kbContext}
  ${flowContext}

  ETAPA DO FUNIL DO LEAD: ${funnelStage.label}
  ${funnelStage.description}

  ESTRATÉGIA PARA ESTA ETAPA:
  ${funnelStage.strategy}

  IMPORTANTE: A etapa do funil foi definida pelo fluxo de automação. Adapte 100% da sua abordagem a esta etapa
  específica.

  ${template.trigger_condition ? `CONDIÇÃO DE ATIVAÇÃO DESTE FOLLOW-UP:\n${template.trigger_condition}\nUse esta
  condição como contexto adicional para entender POR QUE este follow-up está sendo enviado.` : ""}

  REGRAS:
  1. A mensagem DEVE ser natural, como se fosse de um humano real, não um robô.
  2. NÃO use saudações genéricas como "Olá, tudo bem?" ou "Boa tarde!".
  3. FAÇA referência ESPECÍFICA ao contexto da conversa — mencione o que o cliente falou, perguntou ou demonstrou
  interesse.
  4. Nível de urgência: ${template.escalation_level} de ${nicheTemplates.length} (1=suave e amigável, mais alto=mais
  direto/urgente com senso de escassez).
  5. Tentativa ${attemptsDone + 1} de ${template.max_attempts} para este nível.
  6. Objetivo e instruções deste follow-up: ${template.objective}
  7. Use como base o modelo: "${template.message_template}" — mas ADAPTE COMPLETAMENTE ao contexto real da conversa.
  8. Mantenha a mensagem curta (máx 3-4 linhas).
  9. Use emojis com moderação (máx 2).
  10. NUNCA mencione que é um robô, IA ou sistema automatizado.
  11. Se o lead mencionou um produto/serviço específico, FOQUE nele.
  12. ${template.image_url ? `IMPORTANTE: Uma IMAGEM será enviada junto com sua mensagem. Sua mensagem será a LEGENDA da
   imagem. Adapte o texto sabendo que o cliente verá a imagem junto. Não descreva a imagem no texto, apenas
  complemente.` : ""}
  13. ${conv.ad_title ? `O lead veio do anúncio: "${conv.ad_title}". Use isso como contexto se relevante.` : ""}
  14. ${(conv.tags || []).length > 0 ? `Tags do contato: ${conv.tags!.join(", ")}. Podem indicar interesses ou estágio.`
   : ""}
  15. ${langInstruction}`;

          // Generate AI follow-up using workspace config
          const convAIConfig = await getConvAIConfig(conv.workspace_id ?? null);
          if (!convAIConfig.apiKey) {
            trackSkip("ia_nao_configurada");
            continue;
          }
          const aiResponse = await fetch(convAIConfig.apiUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${convAIConfig.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: convAIConfig.model,
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
            console.error(`[ai-follow-up] ❌ Erro na IA para ${conv.contact_name}: HTTP ${aiResponse.status} -
  ${errText}`);
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

          console.log(`[ai-follow-up] 💬 Mensagem gerada para ${conv.contact_name}: "${followUpMessage.substring(0,
  80)}..."`);

          const usage = aiResult.usage;
          if (usage) {
            await supabase.from("ai_usage_logs").insert({
              function_name: "ai-follow-up",
              model: convAIConfig.model,
              input_tokens: usage.prompt_tokens || 0,
              output_tokens: usage.completion_tokens || 0,
              total_tokens: usage.total_tokens || 0,
              conversation_id: conv.id,
            });
          }

          await supabase.from("follow_up_executions").insert({
            conversation_id: conv.id,
            template_id: template.id,
            attempt_number: attemptsDone + 1,
            status: "pending",
            scheduled_at: now.toISOString(),
            message_sent: followUpMessage,
          });

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

          console.log(`[ai-follow-up] 📤 Enviando via ${sendFunction} para ${conv.contact_name}
  (${conv.contact_phone})${template.image_url ? ' [COM IMAGEM]' : ''}`);

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
            console.log(`[ai-follow-up] ✅ Enviado para ${conv.contact_name} (template: ${template.name}, tentativa:
  ${attemptsDone + 1})`);
          } else {
            const errText = await sendResp.text();
            console.error(`[ai-follow-up] ❌ Falha ao enviar para ${conv.contact_name}: ${errText}`);
            trackSkip(`erro_envio(${sendResp.status})`);
          }
        }
      }

      const skipSummary = Object.entries(skippedReasons).map(([reason, count]) => `${reason}: ${count}`).join(" | ");
      console.log(`[ai-follow-up] 📊 Resumo: ${totalSent} enviados, ${totalGaveUp} bloqueados (desistência),
  ${conversations.length} processadas. Motivos de skip: ${skipSummary || "nenhum"}`);

      return jsonResponse({ processed: totalSent, gaveUpBlocked: totalGaveUp, skippedReasons });
    } catch (error) {
      console.error("[ai-follow-up] ❌ Erro fatal:", error);
      return jsonResponse({ error: "Internal server error" }, 500);
    }
  });