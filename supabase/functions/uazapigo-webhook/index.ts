import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { triggerTrainedMessageAnalysis } from "../_shared/trained-message.ts";
import { resumeWaitingFlow } from "../_shared/resume-waiting-flow.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const first = (...values: unknown[]) => values.find((value) => typeof value === "string" && value.trim()) as string | undefined;

function findNestedValue(value: unknown, keys: string[]): unknown {
  if (!value || typeof value !== "object") return undefined;
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const queue: unknown[] = [value];
  let inspected = 0;

  while (queue.length > 0 && inspected < 350) {
    const current = queue.shift();
    inspected += 1;
    if (!current || typeof current !== "object") continue;

    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (wanted.has(key.toLowerCase()) && child !== null && child !== undefined && child !== "") {
        return child;
      }
      if (child && typeof child === "object") queue.push(child);
    }
  }
  return undefined;
}

function extractAdAttribution(payload: unknown) {
  const sourceIdValue = findNestedValue(payload, ["source_id", "sourceId", "ad_id", "adId"]);
  const ctwaValue = findNestedValue(payload, ["ctwa_clid", "ctwaClid"]);
  const sourceTypeValue = findNestedValue(payload, ["source_type", "sourceType", "conversionSource"]);
  const headlineValue = findNestedValue(payload, ["headline", "ad_title", "adTitle"]);
  const sourceId = typeof sourceIdValue === "string" || typeof sourceIdValue === "number"
    ? String(sourceIdValue).trim()
    : null;
  const ctwaClid = typeof ctwaValue === "string" ? ctwaValue.trim() : null;
  const adTitle = typeof headlineValue === "string" ? headlineValue.trim() : null;
  const sourceType = typeof sourceTypeValue === "string" ? sourceTypeValue.trim() : null;

  return {
    sourceId: sourceId && /^\d{10,30}$/.test(sourceId) ? sourceId : null,
    ctwaClid: ctwaClid || null,
    adTitle: adTitle || null,
    sourceType: sourceType || null,
  };
}

function normalizeStatus(value: unknown) {
  const status = String(value ?? "").toLowerCase();
  if (/fail|error|reject|cancel/.test(status)) return "failed";
  if (/read|played/.test(status)) return "read";
  if (/deliver/.test(status)) return "delivered";
  if (/sent|server|ack/.test(status)) return "sent";
  if (/pending|queue|accept/.test(status)) return "pending";
  return null;
}

function extractMessage(payload: any) {
  const data = payload?.data ?? payload?.message ?? payload;
  const message = data?.message ?? data;
  const chat = data?.chat ?? message?.chat ?? {};
  
  const senderJid = first(data?.sender, message?.sender);
  const chatId = first(
    data?.chatid, data?.chatId, data?.wa_chatid, 
    message?.chatid, message?.chatId, message?.wa_chatid, 
    chat?.wa_chatid, chat?.chatid, chat?.id, 
    data?.key?.remoteJid, data?.remoteJid, 
    senderJid?.includes("@") ? senderJid : undefined
  ) || "";
  
  const phone = String(first(
    data?.phone, message?.phone, chat?.phone, 
    data?.sender_pn, message?.sender_pn, 
    data?.sender, message?.sender, chatId
  ) || "").split("@")[0].replace(/\D/g, "");

  const typeRaw = String(
    first(data?.messageType, data?.type, message?.messageType, message?.type) || "text"
  ).toLowerCase();

  const type = /image|photo/.test(typeRaw) ? "image" : 
               /video/.test(typeRaw) ? "video" : 
               /audio|ptt|voice/.test(typeRaw) ? "audio" : 
               /document|file/.test(typeRaw) ? "document" : "text";

  // Try to find the file URL in various possible fields used by uazapi and other providers
  const fileUrl = first(
    data?.fileURL, data?.fileUrl, data?.mediaUrl, data?.url, data?.file, data?.base64, data?.arquivo,
    message?.fileURL, message?.fileUrl, message?.mediaUrl, message?.url, message?.file, message?.base64, message?.arquivo,
    message?.imageMessage?.url, message?.videoMessage?.url, message?.audioMessage?.url, message?.documentMessage?.url,
    message?.image?.url, message?.video?.url, message?.audio?.url, message?.document?.url,
    data?.image?.url, data?.video?.url, data?.audio?.url, data?.document?.url
  ) || null;

  // Try to find the text/caption in various possible fields
  const text = first(
    data?.text, data?.body, data?.caption, 
    message?.text, message?.body, message?.caption,
    message?.conversation, message?.extendedTextMessage?.text,
    message?.imageMessage?.caption, message?.videoMessage?.caption, message?.documentMessage?.caption,
    message?.image?.caption, message?.video?.caption, message?.document?.caption,
    data?.image?.caption, data?.video?.caption, data?.document?.caption
  ) || "";

  return {
    data,
    phone,
    chatId,
    fromMe: data?.fromMe === true || message?.fromMe === true,
    id: first(
      data?.messageid, data?.messageId, data?.id, 
      message?.messageid, message?.messageId, message?.id, 
      data?.key?.id
    ) || null,
    name: first(data?.senderName, data?.pushName, data?.chatName, message?.senderName, message?.pushName) || phone,
    type,
    content: text || (type === "image" ? "[Imagem]" : type === "video" ? "[Vídeo]" : type === "document" ? "[Documento]" : type === "audio" ? "" : "[Mensagem]"),
    mediaUrl: fileUrl,
  };
}

function decodeBase64(value: string) {
  const clean = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const binary = atob(clean);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function extensionFor(type: string, mimeType: string) {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mpeg")) return type === "audio" ? "mp3" : "mpeg";
  if (mimeType.includes("pdf")) return "pdf";
  return type === "image" ? "jpg" : type === "audio" ? "ogg" : type === "video" ? "mp4" : "bin";
}

async function persistIncomingMedia(
  supabase: any,
  serverUrl: string,
  token: string,
  messageId: string,
  type: string,
) {
  const downloadUrl = new URL(`${serverUrl.replace(/\/+$/, "")}/message/download`);
  downloadUrl.searchParams.set("token", token);
  const response = await fetch(downloadUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({ id: messageId, messageid: messageId, return_link: true, return_base64: true, generate_mp3: true }),
  });
  const responseType = response.headers.get("content-type") || "";
  if (response.ok && !responseType.includes("json")) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) return null;
    const mimeType = responseType.split(";")[0] || "application/octet-stream";
    const path = `uazapigo/${messageId}.${extensionFor(type, mimeType)}`;
    const { error } = await supabase.storage.from("chat-media").upload(path, bytes, {
      contentType: mimeType,
      upsert: true,
    });
    if (error) {
      console.error("[uazapigo-webhook] binary media storage failed:", error.message);
      return null;
    }
    return supabase.storage.from("chat-media").getPublicUrl(path).data.publicUrl;
  }

  const raw = await response.text();
  let result: any = {};
  try { result = raw ? JSON.parse(raw) : {}; } catch { result = {}; }
  if (!response.ok) {
    console.error(`[uazapigo-webhook] media download failed [${response.status}]: ${raw.slice(0, 500)}`);
    return null;
  }

  const source = result?.data ?? result;
  const base64 = first(source?.base64Data, source?.base64, result?.base64Data, result?.base64);
  const remoteUrl = first(source?.fileURL, source?.fileUrl, source?.url, result?.fileURL, result?.fileUrl, result?.url);
  let bytes: Uint8Array | null = null;
  let mimeType = first(source?.mimetype, source?.mimeType, result?.mimetype, result?.mimeType) || "application/octet-stream";

  if (base64) {
    bytes = decodeBase64(base64);
    const dataMime = base64.match(/^data:([^;]+);base64,/i)?.[1];
    if (dataMime) mimeType = dataMime;
  } else if (remoteUrl) {
    const mediaResponse = await fetch(remoteUrl, { headers: { token } });
    if (mediaResponse.ok) {
      bytes = new Uint8Array(await mediaResponse.arrayBuffer());
      mimeType = mediaResponse.headers.get("content-type")?.split(";")[0] || mimeType;
    } else {
      console.error(`[uazapigo-webhook] returned media URL failed [${mediaResponse.status}]`);
    }
  }

  if (!bytes?.length) return null;
  const path = `uazapigo/${messageId}.${extensionFor(type, mimeType)}`;
  const { error } = await supabase.storage.from("chat-media").upload(path, bytes, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) {
    console.error("[uazapigo-webhook] media storage failed:", error.message);
    return null;
  }
  return supabase.storage.from("chat-media").getPublicUrl(path).data.publicUrl;
}

async function triggerAutomations(supabase: any, conversationId: string) {
  if (await resumeWaitingFlow(supabase, conversationId)) return;
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  await Promise.allSettled(["ai-flow-selector", "ai-auto-reply"].map((fn) => fetch(`${url}/functions/v1/${fn}`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ conversationId }),
  })));
}

async function triggerMetaAdLookup(sourceId: string, conversationId: string) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const response = await fetch(`${url}/functions/v1/meta-ad-lookup`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sourceId, conversationId }),
  });
  if (!response.ok) {
    console.error(`[uazapigo-webhook] Meta lookup failed [${response.status}]: ${(await response.text()).slice(0, 500)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") return json({ status: "ok", provider: "uazapiGO" });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  
  try {
    const payload = await req.json();
    const requestedConfigId = new URL(req.url).searchParams.get("configId");
    const event = String(payload?.event ?? payload?.type ?? "messages").toLowerCase();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (event.includes("messages_update") || event.includes("message_update")) {
      const items = Array.isArray(payload?.data) ? payload.data : [payload?.data ?? payload];
      for (const item of items) {
        const id = first(item?.messageid, item?.messageId, item?.id, item?.key?.id);
        const statusValue = item?.status ?? item?.messageStatus ?? item?.ack;
        const status = normalizeStatus(statusValue);
        if (id && status) await supabase.from("messages").update({ status, provider_status: String(statusValue) }).eq("provider_message_id", id);
      }
      return json({ success: true });
    }

    if (event === "connection" || event.includes("connection")) {
      const token = first(payload?.token, payload?.instance?.token, payload?.data?.token);
      const instanceId = first(payload?.instance, payload?.instanceId, payload?.data?.instance, payload?.data?.instanceId);
      const state = String(payload?.data?.status ?? payload?.status ?? payload?.data?.state ?? "").toLowerCase();
      const { data: configs } = await supabase.from("connection_configs").select("id, config").eq("connection_id", "uazapigo");
      const matched = (configs || []).find((row: any) => row.id === requestedConfigId || (token && row.config?.token === token) || (instanceId && [row.config?.instance_id, row.config?.instance_name].includes(instanceId)));
      if (matched) await supabase.from("connection_configs").update({ is_connected: ["connected", "open"].includes(state), status: ["connected", "open"].includes(state) ? "active" : "error", last_checked_at: new Date().toISOString() }).eq("id", matched.id);
      return json({ success: true });
    }

    const items = Array.isArray(payload?.data) ? payload.data : [payload?.data ?? payload];
    for (const item of items) {
      const message = extractMessage({ ...payload, data: item });
      const attribution = extractAdAttribution({ ...payload, data: item });
      if (!message.phone || message.chatId.includes("@g.us") || message.chatId === "status@broadcast") continue;
      
      const token = first(payload?.token, payload?.instance?.token, item?.token);
      const instanceId = first(payload?.instance, payload?.instanceId, item?.instance, item?.instanceId);
      
      const { data: configs } = await supabase.from("connection_configs").select("id, workspace_id, sector, is_connected, config").eq("connection_id", "uazapigo");
      const connection = (configs || []).find((row: any) => row.id === requestedConfigId || (token && row.config?.token === token) || (instanceId && [row.config?.instance_id, row.config?.instance_name].includes(instanceId)));
      
      if (!connection) { console.error("[uazapigo-webhook] conexão não encontrada"); continue; }
      if (!connection.is_connected) await supabase.from("connection_configs").update({ is_connected: true, status: "active" }).eq("id", connection.id);

      // Copy provider media into our storage. Provider URLs require authentication
      // and cannot be rendered directly by the browser.
      if (message.type !== "text" && message.id) {
        const config = (connection.config || {}) as any;
        const serverUrl = String(config.server_url || Deno.env.get("UAZAPIGO_SERVER_URL") || "").trim();
        const instanceToken = String(config.token || token || "").trim();
        if (serverUrl && instanceToken) {
          const storedUrl = await persistIncomingMedia(supabase, serverUrl, instanceToken, message.id, message.type);
          if (storedUrl) message.mediaUrl = storedUrl;
        }
      }

      let { data: conversation } = await supabase.from("conversations").select("id, provider_chat_id, source_id, ad_title, ctwa_clid").eq("contact_phone", message.phone).eq("connection_config_id", connection.id).order("created_at", { ascending: false }).limit(1).maybeSingle();

      const adFields = {
        ...(attribution.sourceId ? { source_id: attribution.sourceId } : {}),
        ...(attribution.adTitle ? { ad_title: attribution.adTitle } : {}),
        ...(attribution.ctwaClid ? { ctwa_clid: attribution.ctwaClid } : {}),
        ...(attribution.sourceId || attribution.ctwaClid || /facebook|instagram|meta|ad/i.test(attribution.sourceType || "")
          ? { source_type: "ads" }
          : {}),
      };
      
      if (!conversation) {
        const created = await supabase.from("conversations").insert({ contact_name: message.name, contact_phone: message.phone, provider_chat_id: message.chatId || null, status: "new", tags: [], connection_config_id: connection.id, workspace_id: connection.workspace_id, sector: connection.sector || null, ...adFields }).select("id, provider_chat_id, source_id, ad_title, ctwa_clid").single();
        conversation = created.data;
      } else {
        await supabase.from("conversations").update({ updated_at: new Date().toISOString(), status: "active", ...(message.chatId ? { provider_chat_id: message.chatId } : {}), ...adFields }).eq("id", conversation.id);
      }
      
      if (!conversation?.id) continue;

      if (attribution.sourceId && (!conversation.source_id || !conversation.ad_title)) {
        triggerMetaAdLookup(attribution.sourceId, conversation.id).catch((error) =>
          console.error("[uazapigo-webhook] Meta ad lookup error:", error instanceof Error ? error.message : String(error))
        );
      }

      if (message.id) {
        const { data: duplicate } = await supabase.from("messages").select("id").eq("provider_message_id", message.id).maybeSingle();
        if (duplicate) { 
          if (message.fromMe) {
            await supabase.from("messages").update({ status: "sent", provider_status: "sent" }).eq("id", duplicate.id);
          } else if (message.mediaUrl) {
            await supabase.from("messages").update({ media_url: message.mediaUrl }).eq("id", duplicate.id);
          }
          if (!message.fromMe) {
            await triggerAutomations(supabase, conversation.id);
          }
          continue; 
        }
      }
      
      if (message.fromMe && message.content) {
        const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: queued } = await supabase.from("messages").select("id").eq("conversation_id", conversation.id).eq("sender_type", "agent").eq("content", message.content).is("provider_message_id", null).gte("created_at", since).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (queued) { await supabase.from("messages").update({ status: "sent", provider_status: "sent", provider_message_id: message.id }).eq("id", queued.id); continue; }
      }
      
      const { data: insertedMessage, error } = await supabase.from("messages").insert({ 
        conversation_id: conversation.id, 
        content: message.content, 
        sender_type: message.fromMe ? "agent" : "customer", 
        sender_label: message.fromMe ? "whatsapp" : null, 
        message_type: message.type, 
        media_url: message.mediaUrl, 
        status: message.fromMe ? "sent" : "delivered", 
        provider_message_id: message.id 
      }).select("id").single();
      
      if (!error && !message.fromMe) {
        if (insertedMessage?.id) triggerTrainedMessageAnalysis(insertedMessage.id).catch((analysisError) =>
          console.error("[uazapigo-webhook] trained message analysis error:", analysisError)
        );
        await triggerAutomations(supabase, conversation.id);
      }
    }
    return json({ success: true });
  } catch (error) {
    console.error("[uazapigo-webhook]", error);
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
