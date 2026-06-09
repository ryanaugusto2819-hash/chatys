import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return json({ status: "ok", provider: "evolution-webhook" });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ success: false, error: "Invalid JSON body" }, 400);
  }

  // Always log raw event first
  try {
    const event: string = payload?.event ?? payload?.type ?? "unknown";
    const instanceName: string | null = payload?.instance ?? payload?.instanceName ?? null;
    const data = payload?.data ?? {};
    const key = data?.key ?? {};
    const msg = data?.message ?? {};

    const remoteJid: string | null = key?.remoteJid ?? data?.remoteJid ?? null;
    const pushName: string | null = data?.pushName ?? null;
    const messageText: string | null =
      msg?.conversation ??
      msg?.extendedTextMessage?.text ??
      msg?.imageMessage?.caption ??
      msg?.videoMessage?.caption ??
      msg?.documentMessage?.caption ??
      null;

    await supabase.from("evolution_webhook_events").insert({
      event,
      instance_name: instanceName,
      remote_jid: remoteJid,
      push_name: pushName,
      message_text: messageText,
      raw_payload: payload,
    });

    // Process message events (use waitUntil so Edge runtime doesn't kill it)
    if (event === "messages.upsert" || event === "MESSAGES_UPSERT") {
      const task = processMessageEvent(supabase, payload).catch((err) =>
        console.error("[evolution-webhook] process error:", err)
      );
      // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(task);
      } else {
        await task;
      }
    }

    return json({ success: true });
  } catch (err) {
    console.error("evolution-webhook error:", err);
    return json({ success: false, error: String(err) }, 500);
  }
});

async function processMessageEvent(supabase: any, payload: any) {
  const instanceName: string | null = payload?.instance ?? payload?.instanceName ?? null;
  const data = payload?.data ?? {};
  const key = data?.key ?? {};
  const msg = data?.message ?? {};

  const remoteJid: string = key?.remoteJid ?? "";
  const fromMe: boolean = key?.fromMe === true;
  const pushName: string = data?.pushName ?? "";

  // Ignore groups and status. Messages sent directly from the connected phone
  // must still appear in the CRM chat as agent messages.
  if (!remoteJid) return;
  if (remoteJid.endsWith("@g.us") || remoteJid.includes("-group")) return;
  if (remoteJid === "status@broadcast") return;

  const phone = remoteJid.replace(/@s\.whatsapp\.net$/, "").replace(/@c\.us$/, "").replace(/\D/g, "");
  if (!phone) return;

  // Resolve connection_config_id by instance_name.
  // If the instance exists on the Evolution server but has no row yet,
  // auto-create one in the default workspace so messages are not lost.
  let connectionConfigId: string | null = null;
  let workspaceId: string | null = null;
  const DEFAULT_WORKSPACE = "10000000-0000-0000-0000-000000000001";

  if (instanceName) {
    const { data: configs } = await supabase
      .from("connection_configs")
      .select("id, workspace_id, is_connected, config")
      .eq("connection_id", "evolution");

    const matched = (configs || []).find(
      (c: any) => (c.config?.instance_name || "").toLowerCase() === instanceName.toLowerCase()
    );

    if (matched) {
      // Auto-activate if the instance is sending traffic
      if (!matched.is_connected) {
        await supabase
          .from("connection_configs")
          .update({ is_connected: true })
          .eq("id", matched.id);
      }
      connectionConfigId = matched.id;
      workspaceId = matched.workspace_id;
    } else {
      console.log(`[evolution-webhook] auto-registering instance ${instanceName}`);
      const { data: created, error: createErr } = await supabase
        .from("connection_configs")
        .insert({
          connection_id: "evolution",
          workspace_id: DEFAULT_WORKSPACE,
          is_connected: true,
          config: { instance_name: instanceName, auto_registered: true },
        })
        .select("id, workspace_id")
        .single();
      if (createErr || !created) {
        console.error(`[evolution-webhook] failed to auto-register ${instanceName}:`, createErr);
        return;
      }
      connectionConfigId = created.id;
      workspaceId = created.workspace_id;
    }
  }



  // Extract content + type
  let content = "";
  let messageType = "text";
  let mediaUrl: string | null = null;

  if (msg?.conversation) {
    content = msg.conversation;
  } else if (msg?.extendedTextMessage?.text) {
    content = msg.extendedTextMessage.text;
  } else if (msg?.imageMessage) {
    content = msg.imageMessage.caption || "[Imagem]";
    messageType = "image";
    mediaUrl = msg.imageMessage.url || null;
  } else if (msg?.videoMessage) {
    content = msg.videoMessage.caption || "[Vídeo]";
    messageType = "video";
    mediaUrl = msg.videoMessage.url || null;
  } else if (msg?.audioMessage) {
    content = "";
    messageType = "audio";
    mediaUrl = msg.audioMessage.url || null;
    if (!mediaUrl) content = "[Áudio]";
  } else if (msg?.documentMessage) {
    content = msg.documentMessage.fileName || "[Documento]";
    messageType = "document";
    mediaUrl = msg.documentMessage.url || null;
  } else if (msg?.stickerMessage) {
    content = "[Sticker]";
  } else if (msg?.locationMessage) {
    const lat = msg.locationMessage.degreesLatitude;
    const lng = msg.locationMessage.degreesLongitude;
    content = `[Localização: ${lat}, ${lng}]`;
  } else {
    content = "[Mensagem]";
  }

  // Dedup
  const providerMsgId = key?.id || null;
  if (providerMsgId) {
    const { data: dup } = await supabase
      .from("messages")
      .select("id")
      .eq("provider_message_id", providerMsgId)
      .limit(1)
      .maybeSingle();
    if (dup) {
      console.log(`[evolution-webhook] duplicate ${providerMsgId}`);
      return;
    }
  }

  // Extract Click-to-WhatsApp ad referral (externalAdReply), if present.
  // Baileys/Evolution exposes it under any message type's contextInfo.
  const ctxInfo =
    msg?.extendedTextMessage?.contextInfo ??
    msg?.imageMessage?.contextInfo ??
    msg?.videoMessage?.contextInfo ??
    msg?.audioMessage?.contextInfo ??
    msg?.documentMessage?.contextInfo ??
    msg?.conversationContextInfo ??
    data?.contextInfo ??
    null;
  const ear = ctxInfo?.externalAdReply ?? null;
  const ctwaClid: string | null =
    ear?.ctwaClid ?? ear?.ctwa_clid ?? ctxInfo?.ctwaClid ?? null;
  const adSourceId: string | null =
    ear?.sourceId ?? ear?.source_id ?? null;
  const adTitle: string | null = ear?.title ?? ear?.body ?? null;
  const hasAdReferral = Boolean(ctwaClid || adSourceId);

  // Find or create conversation
  let conversationId: string;
  const { data: existing } = await supabase
    .from("conversations")
    .select("id, ctwa_clid, source_id")
    .eq("contact_phone", phone)
    .eq("connection_config_id", connectionConfigId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    conversationId = existing.id;
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      status: "active",
    };
    // Backfill ad info if not yet set on this conversation
    if (hasAdReferral && !existing.ctwa_clid && !existing.source_id) {
      if (ctwaClid) updates.ctwa_clid = ctwaClid;
      if (adSourceId) updates.source_id = adSourceId;
      if (adTitle) updates.ad_title = adTitle;
      updates.source_type = "ads";
    }
    await supabase.from("conversations").update(updates).eq("id", conversationId);
  } else {
    const { data: created, error: convErr } = await supabase
      .from("conversations")
      .insert({
        contact_name: fromMe ? phone : (pushName || phone),
        contact_phone: phone,
        status: "new",
        tags: [],
        connection_config_id: connectionConfigId,
        workspace_id: workspaceId,
        ctwa_clid: hasAdReferral ? ctwaClid : null,
        source_id: hasAdReferral ? adSourceId : null,
        ad_title: hasAdReferral ? adTitle : null,
        source_type: hasAdReferral ? "ads" : null,
      })
      .select("id")
      .single();
    if (convErr || !created) {
      console.error("[evolution-webhook] insert conversation error:", convErr);
      return;
    }
    conversationId = created.id;
  }

  // If we got a source_id, try resolving the human ad name via meta-ad-lookup (best effort, async)
  if (hasAdReferral && adSourceId) {
    const supabaseUrlBg = Deno.env.get("SUPABASE_URL")!;
    const serviceKeyBg = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    fetch(`${supabaseUrlBg}/functions/v1/meta-ad-lookup`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKeyBg}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: adSourceId, conversationId }),
    }).catch((e) => console.error("[evolution-webhook] meta-ad-lookup error:", e));
  }


  const allowed = ["text", "image", "document", "audio", "video"];
  const normalizedType = allowed.includes(messageType) ? messageType : "text";

  const { error: msgErr } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    content,
    sender_type: fromMe ? "agent" : "customer",
    message_type: normalizedType,
    media_url: mediaUrl,
    status: fromMe ? "sent" : "delivered",
    provider_message_id: providerMsgId,
    sender_label: fromMe ? "whatsapp" : null,
  });

  if (msgErr) {
    console.error("[evolution-webhook] insert message error:", msgErr);
    return;
  }

  // Trigger AI flows (best-effort)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const fire = (fn: string) =>
    fetch(`${supabaseUrl}/functions/v1/${fn}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId }),
    }).catch((e) => console.error(`${fn} trigger error:`, e));

  fire("ai-flow-selector");
  fire("ai-auto-reply");
}
