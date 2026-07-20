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

    const logPayload = buildCompactAdLogPayload(payload, event);

    if (logPayload) {
      await supabase.from("evolution_webhook_events").insert({
        event,
        instance_name: instanceName,
        remote_jid: remoteJid,
        push_name: pushName,
        message_text: messageText,
        raw_payload: logPayload,
      });
    }

    // Process message events (use waitUntil so Edge runtime doesn't kill it)
    // Evolution sends history via "messages.set" (batch array) and live messages via "messages.upsert".
    // During initial sync, "messages.upsert" may also arrive with data as an array.
    if (
      event === "messages.upsert" || event === "MESSAGES_UPSERT" ||
      event === "messages.set" || event === "MESSAGES_SET"
    ) {
      const rawData = payload?.data;
      const items: any[] = Array.isArray(rawData)
        ? rawData
        : Array.isArray(rawData?.messages)
          ? rawData.messages
          : [rawData];

      const task = (async () => {
        for (const item of items) {
          if (!item) continue;
          const single = { ...payload, data: item };
          await processMessageEvent(supabase, single).catch((err) =>
            console.error("[evolution-webhook] process error:", err)
          );
        }
      })();

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

function hasAdAttribution(value: any): boolean {
  if (!value || typeof value !== "object") return false;

  const stack = [value];
  let inspected = 0;

  while (stack.length && inspected < 250) {
    inspected += 1;
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;

    for (const [key, child] of Object.entries(current)) {
      if (
        key === "ctwaClid" ||
        key === "ctwa_clid" ||
        key === "sourceId" ||
        key === "source_id" ||
        key === "externalAdReply" ||
        key === "ctwaPayload" ||
        key === "conversionData"
      ) {
        return true;
      }

      if (child && typeof child === "object") stack.push(child);
    }
  }

  return false;
}

function compactMessageForLog(item: any) {
  const msg = item?.message ?? {};
  const ctxInfo =
    msg?.extendedTextMessage?.contextInfo ??
    msg?.imageMessage?.contextInfo ??
    msg?.videoMessage?.contextInfo ??
    msg?.audioMessage?.contextInfo ??
    msg?.documentMessage?.contextInfo ??
    msg?.contextInfo ??
    item?.contextInfo ??
    null;

  return {
    key: item?.key ?? null,
    pushName: item?.pushName ?? null,
    messageTimestamp: item?.messageTimestamp ?? null,
    messageType: Object.keys(msg || {})[0] ?? null,
    text:
      msg?.conversation ??
      msg?.extendedTextMessage?.text ??
      msg?.imageMessage?.caption ??
      msg?.videoMessage?.caption ??
      msg?.documentMessage?.caption ??
      null,
    adAttribution: ctxInfo
      ? {
          externalAdReply: ctxInfo.externalAdReply ?? null,
          ctwaPayload: ctxInfo.ctwaPayload ?? null,
          conversionData: ctxInfo.conversionData ?? null,
        }
      : null,
  };
}

function buildCompactAdLogPayload(payload: any, event: string) {
  const rawData = payload?.data;
  const items: any[] = Array.isArray(rawData)
    ? rawData
    : Array.isArray(rawData?.messages)
      ? rawData.messages
      : [rawData];

  const adItems = items.filter(hasAdAttribution).slice(0, 5);
  if (adItems.length === 0 && !hasAdAttribution(payload)) return null;

  return {
    event,
    instance: payload?.instance ?? payload?.instanceName ?? null,
    logged_at: new Date().toISOString(),
    compacted: true,
    omitted_full_payload: true,
    item_count: items.filter(Boolean).length,
    ad_item_count_logged: adItems.length,
    ad_items: adItems.map(compactMessageForLog),
  };
}

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
  // Single unified workspace
  const DEFAULT_WORKSPACE = "10000000-0000-0000-0000-000000000001";

  let serverUrl = "";
  let apiKey = "";

  if (instanceName) {
    const { data: configs } = await supabase
      .from("connection_configs")
      .select("id, workspace_id, is_connected, config")
      .eq("connection_id", "evolution");

    const matched = (configs || []).find(
      (c: any) => (c.config?.instance_name || "").toLowerCase() === instanceName.toLowerCase()
    );

    if (matched) {
      if (!matched.is_connected) {
        await supabase
          .from("connection_configs")
          .update({ is_connected: true })
          .eq("id", matched.id);
      }
      connectionConfigId = matched.id;
      workspaceId = matched.workspace_id;
      serverUrl = (matched.config?.server_url || "").replace(/\/$/, "");
      apiKey = matched.config?.api_key || "";
    } else {
      console.log(`[evolution-webhook] auto-registering instance ${instanceName}`);
      const { error: createErr } = await supabase
        .from("connection_configs")
        .insert({
          connection_id: "evolution",
          workspace_id: DEFAULT_WORKSPACE,
          is_connected: true,
          config: { instance_name: instanceName, auto_registered: true },
        });
      if (createErr && (createErr as any).code !== "23505") {
        console.error(`[evolution-webhook] failed to auto-register ${instanceName}:`, createErr);
        return;
      }
      const { data: refetched } = await supabase
        .from("connection_configs")
        .select("id, workspace_id, config")
        .eq("connection_id", "evolution");
      const found = (refetched || []).find(
        (c: any) => (c.config?.instance_name || "").toLowerCase() === instanceName.toLowerCase()
      );
      if (!found) {
        console.error(`[evolution-webhook] could not re-fetch ${instanceName} after insert`);
        return;
      }
      connectionConfigId = found.id;
      workspaceId = found.workspace_id;
      serverUrl = (found.config?.server_url || "").replace(/\/$/, "");
      apiKey = found.config?.api_key || "";
    }
  }

  if (!serverUrl) serverUrl = (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/$/, "");
  if (!apiKey) apiKey = Deno.env.get("EVOLUTION_API_KEY") || "";



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

  // Extract Click-to-WhatsApp ad referral.
  // Evolution exposes it via externalAdReply OR via conversionData/ctwaPayload
  // (the latter happens on the very first message of a CTWA click — no externalAdReply yet).
  const ctxInfo =
    msg?.extendedTextMessage?.contextInfo ??
    msg?.imageMessage?.contextInfo ??
    msg?.videoMessage?.contextInfo ??
    msg?.audioMessage?.contextInfo ??
    msg?.documentMessage?.contextInfo ??
    msg?.contextInfo ??
    msg?.conversationContextInfo ??
    data?.message?.contextInfo ??
    data?.contextInfo ??
    null;
  const ear = ctxInfo?.externalAdReply ?? null;

  // ctwaPayload/conversionData may arrive as a byte array (object with numeric keys) or string
  const decodeBytes = (v: any): string | null => {
    if (!v) return null;
    if (typeof v === "string") return v;
    try {
      const arr = Array.isArray(v)
        ? v
        : Object.keys(v).sort((a, b) => Number(a) - Number(b)).map((k) => v[k]);
      if (!arr.length) return null;
      return new TextDecoder().decode(new Uint8Array(arr as number[]));
    } catch {
      return null;
    }
  };

  let ctwaClid: string | null =
    ear?.ctwaClid ?? ear?.ctwa_clid ?? ctxInfo?.ctwaClid ?? null;
  if (!ctwaClid) {
    ctwaClid = decodeBytes(ctxInfo?.ctwaPayload) ?? decodeBytes(ctxInfo?.conversionData);
  }
  const adSourceId: string | null = ear?.sourceId ?? ear?.source_id ?? null;
  const adTitle: string | null = ear?.title ?? ear?.body ?? null;
  const conversionSource: string | null = ctxInfo?.conversionSource ?? null;
  const hasAdReferral = Boolean(
    ctwaClid || adSourceId || (conversionSource && /fb|ig|meta/i.test(conversionSource))
  );

  const providerMsgId = key?.id || null;

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
    if (hasAdReferral) {
      if (ctwaClid && !existing.ctwa_clid) updates.ctwa_clid = ctwaClid;
      if (adSourceId && !existing.source_id) updates.source_id = adSourceId;
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

  const { data: insertedMsg, error: msgErr } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    content,
    sender_type: fromMe ? "agent" : "customer",
    message_type: normalizedType,
    media_url: mediaUrl,
    status: fromMe ? "sent" : "delivered",
    provider_message_id: providerMsgId,
    sender_label: fromMe ? "whatsapp" : null,
  }).select("id").single();

  if (msgErr) {
    console.error("[evolution-webhook] insert message error:", msgErr);
    return;
  }

  // If media is an encrypted WhatsApp URL (.enc), decrypt via Evolution and re-host on Supabase Storage
  if (insertedMsg && mediaUrl && /mmg\.whatsapp\.net|\.enc(\?|$)/.test(mediaUrl) && serverUrl && apiKey && instanceName) {
    const decryptTask = decryptAndRehostEvolutionMedia({
      supabase, serverUrl, apiKey, instanceName, key, msg, messageId: insertedMsg.id, messageType: normalizedType,
    }).catch((e) => console.error("[evolution-webhook] media decrypt error:", e));
    // @ts-ignore
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(decryptTask);
    }
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

async function decryptAndRehostEvolutionMedia(opts: {
  supabase: any;
  serverUrl: string;
  apiKey: string;
  instanceName: string;
  key: any;
  msg: any;
  messageId: string;
  messageType: string;
}) {
  const { supabase, serverUrl, apiKey, instanceName, key, msg, messageId, messageType } = opts;

  const endpoint = `${serverUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`;
  const body = { message: { key, message: msg }, convertToMp4: false };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { apikey: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`[evolution-webhook] getBase64 failed ${res.status}: ${await res.text().catch(() => "")}`);
    return;
  }

  const data = await res.json().catch(() => null);
  const base64: string | undefined = data?.base64 || data?.media || data?.buffer;
  const mimeType: string =
    data?.mimetype ||
    data?.mimeType ||
    msg?.audioMessage?.mimetype ||
    msg?.imageMessage?.mimetype ||
    msg?.videoMessage?.mimetype ||
    msg?.documentMessage?.mimetype ||
    "application/octet-stream";

  if (!base64) {
    console.error("[evolution-webhook] getBase64 returned no base64");
    return;
  }

  // Decode base64 to bytes
  const clean = base64.replace(/^data:[^;]+;base64,/, "");
  const binary = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));

  const extMap: Record<string, string> = {
    "audio/ogg": "ogg", "audio/ogg; codecs=opus": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/wav": "wav",
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "video/mp4": "mp4", "video/3gpp": "3gp", "video/webm": "webm",
    "application/pdf": "pdf",
  };
  const ext = extMap[mimeType.split(";")[0].trim()] || (messageType === "audio" ? "ogg" : messageType === "image" ? "jpg" : messageType === "video" ? "mp4" : "bin");
  const fileName = `evolution/${messageId}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("chat-media")
    .upload(fileName, binary, { contentType: mimeType, upsert: true });

  if (upErr) {
    console.error("[evolution-webhook] storage upload error:", upErr);
    return;
  }

  const { data: pub } = supabase.storage.from("chat-media").getPublicUrl(fileName);
  await supabase.from("messages").update({ media_url: pub.publicUrl }).eq("id", messageId);
  console.log(`[evolution-webhook] media rehosted: ${pub.publicUrl}`);
}
