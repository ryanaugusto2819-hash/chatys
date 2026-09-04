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

const cleanUrl = (url: string | null | undefined) => (url || "").replace(/\/+$/, "");

const extractInstanceName = (item: any): string =>
  item?.instance?.instanceName ||
  item?.instance?.instance_name ||
  item?.instanceName ||
  item?.instance_name ||
  item?.name ||
  "";

const extractInstanceApiKey = (item: any): string => {
  const hash = item?.hash;
  if (typeof hash === "string") return hash;
  return (
    hash?.apikey ||
    hash?.apiKey ||
    item?.apikey ||
    item?.apiKey ||
    item?.instance?.apikey ||
    item?.instance?.apiKey ||
    ""
  );
};

async function resolveEvolutionInstanceKey(serverUrl: string, globalApiKey: string, instanceName: string) {
  if (!serverUrl || !globalApiKey || !instanceName) return "";
  try {
    const res = await fetch(`${serverUrl}/instance/fetchInstances`, {
      method: "GET",
      headers: { apikey: globalApiKey, "Content-Type": "application/json" },
    });
    if (!res.ok) return "";
    const data = await res.json().catch(() => null);
    const list = Array.isArray(data) ? data : Array.isArray(data?.instances) ? data.instances : [];
    const found = list.find(
      (item: any) => extractInstanceName(item).toLowerCase() === instanceName.toLowerCase()
    );
    return extractInstanceApiKey(found);
  } catch (err) {
    console.error("[evolution-send] failed to resolve instance key:", err instanceof Error ? err.message : String(err));
    return "";
  }
}

async function callEvolution(endpoint: string, apiKey: string, body: Record<string, unknown>) {
  const headers = { apikey: apiKey, "Content-Type": "application/json" };
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function ensureDownloadableMediaUrl(supabase: ReturnType<typeof createClient>, mediaUrl: string | null) {
  if (!mediaUrl) return null;

  const publicMarker = "/storage/v1/object/public/chat-media/";
  try {
    const url = new URL(mediaUrl);
    const markerIndex = url.pathname.indexOf(publicMarker);
    if (markerIndex === -1) return mediaUrl;

    const filePath = decodeURIComponent(url.pathname.slice(markerIndex + publicMarker.length));
    if (!filePath) return mediaUrl;

    const { data, error } = await supabase.storage
      .from("chat-media")
      .createSignedUrl(filePath, 60 * 60 * 24 * 7);

    if (error || !data?.signedUrl) {
      console.error("[evolution-send] failed to sign media URL:", error?.message || "unknown");
      return mediaUrl;
    }

    return data.signedUrl;
  } catch {
    return mediaUrl;
  }
}

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
      const cfgEarly = (cc?.config as any) || {};
      if (cfgEarly.send_via_extension === "1") {
        // Conexão configurada para enviar pela extensão do Chrome: delega o envio
        console.log("[evolution-send] send_via_extension ativo — delegando para extension-send");
        const extRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/extension-send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ conversationId, message, mediaUrl, type, senderAgentId, senderLabel }),
        });
        const extText = await extRes.text();
        return new Response(extText, {
          status: extRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (cc?.connection_id === "evolution") {
        const cfg = (cc.config as any) || {};
        serverUrl = cleanUrl(cfg.server_url);
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
        serverUrl = serverUrl || cleanUrl(cfg.server_url);
        instanceName = instanceName || cfg.instance_name || "";
        if (!apiKey && !instanceName) apiKey = cfg.api_key || "";
      }
    }

    // Fallback to global env credentials (covers auto-registered instances without per-row keys)
    const globalServerUrl = cleanUrl(Deno.env.get("EVOLUTION_API_URL"));
    const globalApiKey = Deno.env.get("EVOLUTION_API_KEY") || "";
    if (!serverUrl) serverUrl = globalServerUrl;
    if (!apiKey) apiKey = await resolveEvolutionInstanceKey(serverUrl, globalApiKey, instanceName);
    if (!apiKey) apiKey = globalApiKey;

    if (!serverUrl || !instanceName || !apiKey) {
      return json({ error: "Evolution credentials missing" }, 500);
    }

    const phone = conv.contact_phone.replace(/\D/g, "");

    let endpoint = `${serverUrl}/message/sendText/${encodeURIComponent(instanceName)}`;
    let body: Record<string, unknown> = { number: phone, text: message };

    const downloadableMediaUrl = await ensureDownloadableMediaUrl(supabase, mediaUrl);

    if (downloadableMediaUrl) {
      endpoint = `${serverUrl}/message/sendMedia/${encodeURIComponent(instanceName)}`;
      const mediatype = type === "video" ? "video" : type === "document" ? "document" : type === "audio" ? "audio" : "image";
      body = {
        number: phone,
        mediatype,
        media: downloadableMediaUrl,
        caption: message || "",
      };
    }

    let { res: apiRes, data: apiData } = await callEvolution(endpoint, apiKey, body);

    // Auto-registered instances may reject the global key for send operations.
    // Resolve the per-instance key from Evolution and retry once without exposing credentials.
    if (apiRes.status === 401 && globalApiKey) {
      const instanceApiKey = await resolveEvolutionInstanceKey(serverUrl, globalApiKey, instanceName);
      if (instanceApiKey && instanceApiKey !== apiKey) {
        const retry = await callEvolution(endpoint, instanceApiKey, body);
        apiRes = retry.res;
        apiData = retry.data;
      }
      if (apiRes.status === 401 && apiKey !== globalApiKey) {
        const retry = await callEvolution(endpoint, globalApiKey, body);
        apiRes = retry.res;
        apiData = retry.data;
      }
    }
    const providerMsgId = apiData?.key?.id || apiData?.messageId || null;

    const allowed = ["text", "image", "document", "audio", "video"];
    const normalizedType = allowed.includes(type) ? type : "text";

    const errorDetail = apiRes.ok
      ? null
      : (apiData?.response?.message || apiData?.message || apiData?.error || `HTTP ${apiRes.status}`);
    const errorPayload = apiRes.ok
      ? null
      : JSON.stringify({
          code: apiRes.status,
          title: "Evolution API",
          message: Array.isArray(errorDetail) ? errorDetail.join(" • ") : String(errorDetail),
          error_data: { details: typeof apiData === "string" ? apiData : JSON.stringify(apiData).slice(0, 500) },
        });

    const savedMessage = {
      conversation_id: conversationId,
      content: message ?? "",
      sender_type: "agent",
      message_type: normalizedType,
      media_url: downloadableMediaUrl || mediaUrl,
      status: apiRes.ok ? (providerMsgId ? "pending" : "sent") : "failed",
      provider_message_id: providerMsgId,
      provider_status: apiRes.ok ? "accepted" : String(apiRes.status),
      provider_error: errorPayload,
      sender_agent_id: senderAgentId,
      sender_label: senderLabel,
    };

    const { data: inserted } = await supabase.from("messages").insert(savedMessage).select().single();

    if (!apiRes.ok) {
      // Return 200 so the frontend can read the structured error instead of crashing on a 502.
      return json({
        success: false,
        error: Array.isArray(errorDetail) ? errorDetail.join(" • ") : String(errorDetail),
        providerStatus: apiRes.status,
        providerResponse: apiData,
        savedMessage: inserted,
      }, 200);
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
