import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { triggerTrainedMessageAnalysis } from "../_shared/trained-message.ts";
import { resumeWaitingFlow } from "../_shared/resume-waiting-flow.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "POST") {
    const body = await req.json();
    const processPromise = processZapiWebhook(body);
    processPromise.catch((err) =>
      console.error("Z-API webhook processing error:", err)
    );
    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "ok", provider: "z-api" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
});

async function resolveNicheByZapi(supabase: any, connectionConfigId: string | null): Promise<string | null> {
  if (!connectionConfigId) return null;

  // First try via niche_connections junction table
  const { data: nicheConn } = await supabase
    .from("niche_connections")
    .select("niche_id")
    .eq("connection_config_id", connectionConfigId)
    .limit(1)
    .maybeSingle();

  if (nicheConn?.niche_id) return nicheConn.niche_id;

  // Fallback: legacy zapi_instance_id on niches table
  const { data: config } = await supabase
    .from("connection_configs")
    .select("config")
    .eq("id", connectionConfigId)
    .single();

  const instanceId = (config?.config as any)?.instance_id;
  if (!instanceId) return null;

  const { data } = await supabase
    .from("niches")
    .select("id")
    .eq("zapi_instance_id", instanceId)
    .maybeSingle();

  return data?.id || null;
}

async function processZapiWebhook(body: any) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  console.log("Z-API webhook received:", JSON.stringify(body));

  // Resolve the connection config by instance_id from the webhook payload
  const webhookInstanceId = body.instanceId;
  let connectionConfigId: string | null = null;

  if (webhookInstanceId) {
    // Find connection config matching this instance
    const { data: configs } = await supabase
      .from("connection_configs")
      .select("id, is_connected, config")
      .eq("connection_id", "zapi");

    const matchedConfig = (configs || []).find((c: any) => {
      const cfg = c.config as any;
      return cfg?.instance_id === webhookInstanceId;
    });

    if (!matchedConfig) {
      console.log(`Z-API webhook: no connection config found for instanceId ${webhookInstanceId}`);
      return;
    }

    if (!matchedConfig.is_connected) {
      console.log("Z-API connection is not active, ignoring webhook");
      return;
    }

    connectionConfigId = matchedConfig.id;
  } else {
    // Fallback: pick the first active Z-API connection
    const { data: connectionConfig } = await supabase
      .from("connection_configs")
      .select("id, is_connected")
      .eq("connection_id", "zapi")
      .eq("is_connected", true)
      .limit(1)
      .maybeSingle();

    if (!connectionConfig?.is_connected) {
      console.log("Z-API connection is not active, ignoring webhook");
      return;
    }
    connectionConfigId = connectionConfig.id;
  }

  if (!body.phone && !body.chatId) {
    console.log("Not a message event, skipping");
    return;
  }

  const phone = body.phone || body.chatId?.replace("@c.us", "");
  if (!phone) return;

  const contactName = body.senderName || body.chatName || phone;
  const isFromMe = body.fromMe === true;
  const isGroup = body.isGroup === true;
  const isGroupPhone = phone.includes("-group") || phone.includes("@g.us");

  if (isFromMe) {
    console.log("Message from self, skipping");
    return;
  }
  if (isGroup || isGroupPhone) {
    console.log("Group message, skipping");
    return;
  }

  // Resolve niche
  const nicheId = await resolveNicheByZapi(supabase, connectionConfigId);

  let conversationId: string;

  let existingQuery = supabase
    .from("conversations")
    .select("id")
    .eq("contact_phone", phone)
    .order("created_at", { ascending: false })
    .limit(1);

  if (connectionConfigId) {
    existingQuery = existingQuery.eq("connection_config_id", connectionConfigId);
  }

  let { data: existing } = await existingQuery.maybeSingle();

  if (!existing && !connectionConfigId) {
    const fallbackResult = await supabase
      .from("conversations")
      .select("id")
      .eq("contact_phone", phone)
      .is("connection_config_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    existing = fallbackResult.data;
  }

  if (existing) {
    conversationId = existing.id;
    const updateData: any = { updated_at: new Date().toISOString(), status: "active" };
    if (connectionConfigId !== null) {
      updateData.connection_config_id = connectionConfigId;
      updateData.niche_id = nicheId;
    }
    await supabase
      .from("conversations")
      .update(updateData)
      .eq("id", conversationId);
  } else {
    const { data: newConv, error: convError } = await supabase
      .from("conversations")
      .insert({
        contact_name: contactName,
        contact_phone: phone,
        status: "new",
        tags: [],
        niche_id: nicheId,
        connection_config_id: connectionConfigId,
      })
      .select("id")
      .single();

    if (convError) {
      console.error("Error creating conversation:", convError);
      return;
    }
    conversationId = newConv.id;
  }

  let content = "";
  let messageType = "text";
  let mediaUrl: string | null = null;

  if (body.text?.message) {
    content = body.text.message;
    messageType = "text";
  } else if (body.buttonsResponseMessage) {
    content = body.buttonsResponseMessage.selectedDisplayText || body.buttonsResponseMessage.selectedButtonId || "[Botão]";
    messageType = "text";
  } else if (body.listResponseMessage) {
    content = body.listResponseMessage.title || body.listResponseMessage.singleSelectReply?.selectedRowId || "[Lista]";
    messageType = "text";
  } else if (body.image) {
    content = body.image.caption || "[Imagem]";
    messageType = "image";
    mediaUrl = body.image.imageUrl || body.image.url || null;
  } else if (body.audio) {
    content = "";
    messageType = "audio";
    mediaUrl = body.audio.audioUrl || body.audio.url || null;
    if (!mediaUrl) content = "[Áudio]";
  } else if (body.video) {
    content = body.video.caption || "";
    messageType = "video";
    mediaUrl = body.video.videoUrl || body.video.url || null;
    if (!content && !mediaUrl) content = "[Vídeo]";
  } else if (body.document) {
    content = body.document.fileName || "[Documento]";
    messageType = "document";
  } else if (body.sticker) {
    content = "[Sticker]";
    messageType = "text";
  } else if (body.contact) {
    content = "[Contato compartilhado]";
    messageType = "text";
  } else if (body.location) {
    content = `[Localização: ${body.location.latitude}, ${body.location.longitude}]`;
    messageType = "text";
  } else {
    content = body.body || "[Mensagem]";
  }

  const allowedTypes = ["text", "image", "document", "audio", "video"];
  const normalizedType = allowedTypes.includes(messageType) ? messageType : "text";

  // Deduplication: skip if this provider message was already stored
  const providerMsgId = body.messageId || body.id?.id || null;
  if (providerMsgId) {
    const { data: duplicate } = await supabase
      .from("messages")
      .select("id")
      .eq("provider_message_id", providerMsgId)
      .limit(1)
      .maybeSingle();
    if (duplicate) {
      console.log(`[zapi-webhook] Duplicate message ${providerMsgId}, skipping`);
      return;
    }
  }

  const { data: insertedMessage, error: msgError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    content,
    sender_type: "customer",
    message_type: normalizedType,
    media_url: mediaUrl,
    status: "delivered",
    provider_message_id: providerMsgId,
  }).select("id").single();

  if (msgError) {
    console.error("Error inserting message:", msgError);
  } else {
    if (insertedMessage?.id) triggerTrainedMessageAnalysis(insertedMessage.id).catch((err) =>
      console.error("Trained message analysis error:", err)
    );
    resumeWaitingFlow(supabase, conversationId, insertedMessage?.id).then((resumed) => {
      if (resumed) return;
      triggerAiFlowSelector(conversationId).catch((err) => console.error("Flow selector trigger error:", err));
      triggerAutoReply(conversationId).catch((err) => console.error("Auto-reply trigger error:", err));
    }).catch((err) => console.error("Waiting flow resume error:", err));
  }
}

async function triggerAiFlowSelector(conversationId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const response = await fetch(`${supabaseUrl}/functions/v1/ai-flow-selector`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ conversationId }),
  });

  const result = await response.json();
  console.log("Flow selector result:", result);
}

async function triggerAutoReply(conversationId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const response = await fetch(`${supabaseUrl}/functions/v1/ai-auto-reply`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ conversationId }),
  });

  const result = await response.json();
  console.log("Auto-reply result:", result);
}
