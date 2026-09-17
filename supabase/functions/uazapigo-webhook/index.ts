import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const first = (...values: unknown[]) => values.find((value) => typeof value === "string" && value.trim()) as string | undefined;

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
  const chatId = first(data?.chatid, data?.chatId, message?.chatid, message?.chatId, data?.key?.remoteJid, data?.remoteJid) || "";
  const phone = String(first(data?.sender, message?.sender, data?.phone, message?.phone, chatId) || "").split("@")[0].replace(/\D/g, "");
  const typeRaw = String(first(data?.messageType, data?.type, message?.messageType, message?.type) || "text").toLowerCase();
  const fileUrl = first(data?.fileURL, data?.fileUrl, data?.mediaUrl, data?.url, message?.fileURL, message?.fileUrl, message?.mediaUrl, message?.url) || null;
  const text = first(data?.text, data?.body, data?.caption, message?.text, message?.body, message?.caption) || "";
  const type = /image|photo/.test(typeRaw) ? "image" : /video/.test(typeRaw) ? "video" : /audio|ptt|voice/.test(typeRaw) ? "audio" : /document|file/.test(typeRaw) ? "document" : "text";
  return {
    data,
    phone,
    chatId,
    fromMe: data?.fromMe === true || message?.fromMe === true,
    id: first(data?.messageid, data?.messageId, data?.id, message?.messageid, message?.messageId, message?.id, data?.key?.id) || null,
    name: first(data?.senderName, data?.pushName, data?.chatName, message?.senderName, message?.pushName) || phone,
    type,
    content: text || (type === "image" ? "[Imagem]" : type === "video" ? "[Vídeo]" : type === "document" ? "[Documento]" : type === "audio" ? "" : "[Mensagem]"),
    mediaUrl: fileUrl,
  };
}

async function triggerAutomations(conversationId: string) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  await Promise.allSettled(["ai-flow-selector", "ai-auto-reply"].map((fn) => fetch(`${url}/functions/v1/${fn}`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ conversationId }),
  })));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") return json({ status: "ok", provider: "uazapiGO" });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const payload = await req.json();
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
      const matched = (configs || []).find((row: any) => (token && row.config?.token === token) || (instanceId && [row.config?.instance_id, row.config?.instance_name].includes(instanceId)));
      if (matched) await supabase.from("connection_configs").update({ is_connected: ["connected", "open"].includes(state), status: ["connected", "open"].includes(state) ? "active" : "error", last_checked_at: new Date().toISOString() }).eq("id", matched.id);
      return json({ success: true });
    }

    const items = Array.isArray(payload?.data) ? payload.data : [payload?.data ?? payload];
    for (const item of items) {
      const message = extractMessage({ ...payload, data: item });
      if (!message.phone || message.chatId.includes("@g.us") || message.chatId === "status@broadcast") continue;
      const token = first(payload?.token, payload?.instance?.token, item?.token);
      const instanceId = first(payload?.instance, payload?.instanceId, item?.instance, item?.instanceId);
      const { data: configs } = await supabase.from("connection_configs").select("id, workspace_id, sector, is_connected, config").eq("connection_id", "uazapigo");
      const connection = (configs || []).find((row: any) => (token && row.config?.token === token) || (instanceId && [row.config?.instance_id, row.config?.instance_name].includes(instanceId)));
      if (!connection) { console.error("[uazapigo-webhook] conexão não encontrada"); continue; }
      if (!connection.is_connected) await supabase.from("connection_configs").update({ is_connected: true, status: "active" }).eq("id", connection.id);

      let { data: conversation } = await supabase.from("conversations").select("id").eq("contact_phone", message.phone).eq("connection_config_id", connection.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!conversation) {
        const created = await supabase.from("conversations").insert({ contact_name: message.name, contact_phone: message.phone, status: "new", tags: [], connection_config_id: connection.id, workspace_id: connection.workspace_id, sector: connection.sector || null }).select("id").single();
        conversation = created.data;
      } else {
        await supabase.from("conversations").update({ updated_at: new Date().toISOString(), status: "active" }).eq("id", conversation.id);
      }
      if (!conversation?.id) continue;

      if (message.id) {
        const { data: duplicate } = await supabase.from("messages").select("id").eq("provider_message_id", message.id).maybeSingle();
        if (duplicate) { if (message.fromMe) await supabase.from("messages").update({ status: "sent", provider_status: "sent" }).eq("id", duplicate.id); continue; }
      }
      if (message.fromMe && message.content) {
        const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: queued } = await supabase.from("messages").select("id").eq("conversation_id", conversation.id).eq("sender_type", "agent").eq("content", message.content).is("provider_message_id", null).gte("created_at", since).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (queued) { await supabase.from("messages").update({ status: "sent", provider_status: "sent", provider_message_id: message.id }).eq("id", queued.id); continue; }
      }
      const { error } = await supabase.from("messages").insert({ conversation_id: conversation.id, content: message.content, sender_type: message.fromMe ? "agent" : "customer", sender_label: message.fromMe ? "whatsapp" : null, message_type: message.type, media_url: message.mediaUrl, status: message.fromMe ? "sent" : "delivered", provider_message_id: message.id });
      if (!error && !message.fromMe) await triggerAutomations(conversation.id);
    }
    return json({ success: true });
  } catch (error) {
    console.error("[uazapigo-webhook]", error);
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});