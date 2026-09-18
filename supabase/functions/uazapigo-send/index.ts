import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.25.76";

const BodySchema = z.object({
  conversationId: z.string().uuid(),
  message: z.string().max(10000).optional().default(""),
  type: z.enum(["text", "image", "audio", "video", "document"]).optional().default("text"),
  mediaUrl: z.string().url().nullable().optional(),
  senderAgentId: z.string().uuid().nullable().optional(),
  senderLabel: z.string().max(80).nullable().optional(),
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const cleanUrl = (value: unknown) => String(value || "").trim().replace(/\/+$/, "");

async function downloadableMediaUrl(supabase: any, mediaUrl: string | null | undefined) {
  if (!mediaUrl) return null;
  try {
    const url = new URL(mediaUrl);
    const markers = ["/storage/v1/object/public/chat-media/", "/storage/v1/object/sign/chat-media/"];
    const marker = markers.find((item) => url.pathname.includes(item));
    if (!marker) return mediaUrl;
    const filePath = decodeURIComponent(url.pathname.split(marker)[1] || "");
    if (!filePath) return mediaUrl;
    const { data, error } = await supabase.storage.from("chat-media").createSignedUrl(filePath, 60 * 60 * 24 * 7);
    return error || !data?.signedUrl ? mediaUrl : data.signedUrl;
  } catch {
    return mediaUrl;
  }
}

function providerMessageId(data: any): string | null {
  const value = data?.messageid ?? data?.messageId ?? data?.id ?? data?.key?.id ?? data?.data?.messageid ?? data?.data?.id;
  return value ? String(value) : null;
}

function normalizeRecipient(value: unknown): string {
  const recipient = String(value || "").trim();
  if (/@(?:s\.whatsapp\.net|lid|g\.us|newsletter)$/.test(recipient)) return recipient;
  return recipient.replace(/\D/g, "");
}

async function resolveRecipient(serverUrl: string, token: string, phone: string, storedChatId: unknown) {
  const stored = normalizeRecipient(storedChatId);
  if (stored) return stored;

  try {
    const response = await fetch(`${serverUrl}/chat/find`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ operator: "OR", limit: 10, wa_chatid: `~${phone}` }),
    });
    const raw = await response.text();
    if (!response.ok) {
      console.warn(`[uazapigo-send] chat lookup failed [${response.status}]: ${raw.slice(0, 500)}`);
      return phone;
    }
    const body = raw ? JSON.parse(raw) : {};
    const chats = Array.isArray(body?.chats) ? body.chats : [];
    const match = chats.find((chat: any) => String(chat?.wa_chatid || "").replace(/\D/g, "").includes(phone));
    return normalizeRecipient(match?.wa_chatid) || phone;
  } catch (error) {
    console.warn("[uazapigo-send] chat lookup error:", error instanceof Error ? error.message : String(error));
    return phone;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { conversationId, message, type, mediaUrl, senderAgentId, senderLabel } = parsed.data;
    if (!message.trim() && !mediaUrl) return json({ error: "Mensagem ou mídia é obrigatória" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("contact_phone, provider_chat_id, connection_config_id")
      .eq("id", conversationId)
      .single();
    if (conversationError || !conversation) return json({ error: "Conversa não encontrada" }, 404);

    const { data: connection } = await supabase
      .from("connection_configs")
      .select("connection_id, config")
      .eq("id", conversation.connection_config_id)
      .maybeSingle();
    if (connection?.connection_id !== "uazapigo") return json({ error: "A conversa não usa uma conexão uazapiGO" }, 409);
    const config = (connection.config || {}) as Record<string, unknown>;

    if (config.send_via_extension === "1") {
      const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/extension-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: JSON.stringify(parsed.data),
      });
      return new Response(await response.text(), { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const serverUrl = cleanUrl(config.server_url);
    const token = String(config.token || "").trim();
    if (!serverUrl || !token) return json({ error: "URL ou token da uazapiGO não configurado" }, 500);

    const phone = String(conversation.contact_phone || "").replace(/\D/g, "");
    const recipient = await resolveRecipient(serverUrl, token, phone, conversation.provider_chat_id);
    if (!recipient) return json({ error: "Destinatário da conversa não encontrado" }, 422);
    if (recipient !== conversation.provider_chat_id) {
      await supabase.from("conversations").update({ provider_chat_id: recipient }).eq("id", conversationId);
    }
    const signedMediaUrl = await downloadableMediaUrl(supabase, mediaUrl);
    const endpoint = signedMediaUrl ? "/send/media" : "/send/text";
    const payload: Record<string, unknown> = signedMediaUrl
      ? {
          number: recipient,
          type: type === "audio" ? "myaudio" : type,
          file: signedMediaUrl,
          text: message || undefined,
          caption: message || undefined,
          docName: type === "document" ? (message || "Documento") : undefined,
        }
      : { number: recipient, text: message };

    const providerResponse = await fetch(`${serverUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify(payload),
    });
    const responseText = await providerResponse.text();
    let result: any = {};
    try { result = responseText ? JSON.parse(responseText) : {}; } catch { result = { raw: responseText.slice(0, 800) }; }
    const messageId = providerMessageId(result);
    const providerReportedError = result?.error || result?.success === false;
    const succeeded = providerResponse.ok && !providerReportedError;
    const errorDetail = succeeded ? null : String(result?.error?.message || result?.error || result?.message || `HTTP ${providerResponse.status}`);
    const providerError = succeeded ? null : JSON.stringify({
      code: providerResponse.status,
      title: "uazapiGO",
      message: errorDetail,
      error_data: { details: JSON.stringify(result).slice(0, 500) },
    }).slice(0, 900);

    const { data: savedMessage, error: saveError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      content: message,
      sender_type: "agent",
      sender_agent_id: senderAgentId || null,
      sender_label: senderLabel || (senderAgentId ? "humano" : null),
      message_type: type,
      media_url: signedMediaUrl || mediaUrl || null,
      status: succeeded ? (messageId ? "pending" : "sent") : "failed",
      provider_message_id: messageId,
      provider_status: succeeded ? "accepted" : String(providerResponse.status),
      provider_error: providerError,
    }).select().single();
    if (saveError) console.error("[uazapigo-send] message save failed:", saveError.message);

    if (!succeeded) return json({ success: false, error: errorDetail, providerStatus: providerResponse.status, providerResponse: result, savedMessage }, 200);
    await supabase.from("conversations").update({ updated_at: new Date().toISOString(), status: "active" }).eq("id", conversationId);
    return json({ success: true, providerMessageId: messageId, providerResponse: result, savedMessage });
  } catch (error) {
    console.error("[uazapigo-send]", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});