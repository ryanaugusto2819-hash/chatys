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

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ─── MODE: SCHEDULE ────────────────────────────────────────────
// Called by webhook on new customer message. Upserts a pending row
// with scheduled_for = now() + 60s and returns immediately (~50ms).
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

// ─── MODE: PROCESS ─────────────────────────────────────────────
// Called by the cron function for conversations whose delay has elapsed.
async function handleProcess(conversationId: string) {
  const supabase = getSupabase();

  // 1. Fetch conversation + niche config in parallel
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

  // 2. Load AI config (niche or global)
  let aiEnabled = false;
  let systemPrompt = "Você é um assistente virtual amigável. Responda de forma concisa e útil em português brasileiro.";
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

  // 3. Check if someone already replied (no more sleep!)
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
    console.log(`[ai-auto-reply] Skipping: already replied by ${reply.sender_type} (${reply.sender_label})`);
    return jsonResponse({
      skipped: true,
      reason: `Already replied by ${reply.sender_label || reply.sender_type}`,
    });
  }

  console.log("[ai-auto-reply] No reply found, generating AI response...");

  // 4. Fetch knowledge base + messages in parallel
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

  // 5. Build system prompt with knowledge context
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
    knowledgeContext = "\n\n--- BASE DE CONHECIMENTO ---\nUse as informações abaixo para responder com precisão:\n\n" + sections.join("\n\n");
  }

  const langInstruction = nicheLanguage === "es"
    ? "\n\nIMPORTANTE: Responda SEMPRE em espanhol (español). Toda a comunicação deve ser em espanhol."
    : "\n\nIMPORTANTE: Responda SEMPRE em português brasileiro.";

  const fullSystemPrompt = systemPrompt + knowledgeContext + langInstruction;

  // 6. Build chat messages with multimodal support
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

  // 7. Call AI
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

  // 8. Log usage
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

  // 9. Get WhatsApp credentials
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
  console.log(`[ai-auto-reply] Using phoneNumberId: ${phoneNumberId}, connConfigId: ${conversation.connection_config_id}, hasAccessToken: ${!!accessToken}`);

  // 10. Save message + update conversation in parallel
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

  // 11. Send via WhatsApp
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

// ─── MAIN HANDLER ──────────────────────────────────────────────
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
