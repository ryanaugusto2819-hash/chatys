import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      conversationId,
      message,
      type = "text",
      senderAgentId = null,
      senderLabel = null,
      mediaUrl = null,
    } = await req.json();

    if (!conversationId || (message === undefined && !mediaUrl)) {
      return json({ error: "conversationId and message are required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .select("contact_phone, connection_config_id")
      .eq("id", conversationId)
      .single();

    if (convErr || !conv) return json({ error: "Conversation not found" }, 404);

    let serverUrl = "";
    let instanceName = "";
    let apiKey = "";

    if (conv.connection_config_id) {
      const { data: cc } = await supabase
        .from("connection_configs")
        .select("connection_id, config")
        .eq("id", conv.connection_config_id)
        .single();
      if (cc?.connection_id === "evolution") {
        const cfg = (cc.config as any) || {};
        serverUrl = (cfg.server_url || "").replace(/\/$/, "");
        instanceName = cfg.instance_name || "";
        apiKey = cfg.api_key || "";
      }
    }

    if (!serverUrl || !instanceName || !apiKey) {
      // Fallback: any active evolution connection
      const { data: any } = await supabase
        .from("connection_configs")
        .select("config")
        .eq("connection_id", "evolution")
        .eq("is_connected", true)
        .limit(1)
        .maybeSingle();
      if (any) {
        const cfg = (any.config as any) || {};
        serverUrl = serverUrl || (cfg.server_url || "").replace(/\/$/, "");
        instanceName = instanceName || cfg.instance_name || "";
        apiKey = apiKey || cfg.api_key || "";
      }
    }

    if (!serverUrl || !instanceName || !apiKey) {
      return json({ error: "Evolution credentials missing" }, 500);
    }

    const phone = conv.contact_phone.replace(/\D/g, "");

    let endpoint = `${serverUrl}/message/sendText/${encodeURIComponent(instanceName)}`;
    let body: Record<string, unknown> = { number: phone, text: message };

    if (mediaUrl) {
      endpoint = `${serverUrl}/message/sendMedia/${encodeURIComponent(instanceName)}`;
      const mediatype = type === "video" ? "video" : type === "document" ? "document" : type === "audio" ? "audio" : "image";
      body = {
        number: phone,
        mediatype,
        media: mediaUrl,
        caption: message || "",
      };
    }

    const apiRes = await fetch(endpoint, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const apiData = await apiRes.json().catch(() => ({}));
    const providerMsgId = apiData?.key?.id || apiData?.messageId || null;

    const allowed = ["text", "image", "document", "audio", "video"];
    const normalizedType = allowed.includes(type) ? type : "text";

    const savedMessage = {
      conversation_id: conversationId,
      content: message ?? "",
      sender_type: "agent",
      message_type: normalizedType,
      media_url: mediaUrl,
      status: apiRes.ok ? "sent" : "failed",
      provider_message_id: providerMsgId,
      sender_agent_id: senderAgentId,
      sender_label: senderLabel,
    };

    const { data: inserted } = await supabase.from("messages").insert(savedMessage).select().single();

    if (!apiRes.ok) {
      return json({
        success: false,
        error: apiData?.response?.message || apiData?.error || `HTTP ${apiRes.status}`,
        savedMessage: inserted,
      }, 502);
    }

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString(), status: "active" })
      .eq("id", conversationId);

    return json({ success: true, savedMessage: inserted, providerResponse: apiData });
  } catch (err) {
    console.error("evolution-send error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
