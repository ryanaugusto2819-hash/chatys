import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId, message, type = "text", senderAgentId = null, senderLabel = null, mediaUrl = null } = await req.json();

    if (!conversationId || (message === undefined && !mediaUrl)) {
      return new Response(
        JSON.stringify({ error: "conversationId and message are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get conversation phone + connection_config_id
    const { data: conversation, error: convError } = await serviceClient
      .from("conversations")
      .select("contact_phone, connection_config_id")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Resolve Z-API credentials from connection_configs
    let instanceId: string | null = null;
    let token: string | null = null;
    let clientToken = "";

    if (conversation.connection_config_id) {
      const { data: connConfig } = await serviceClient
        .from("connection_configs")
        .select("config, connection_id")
        .eq("id", conversation.connection_config_id)
        .single();

      const cfgEarly = (connConfig?.config as Record<string, unknown>) || {};
      if (cfgEarly.send_via_extension === "1") {
        // Conexão configurada para enviar pela extensão do Chrome: delega o envio
        console.log("[zapi-send] send_via_extension ativo — delegando para extension-send");
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

      if (connConfig?.connection_id === "zapi") {
        const cfg = connConfig.config as Record<string, unknown>;
        instanceId = (cfg?.instance_id as string) || null;
        token = (cfg?.token as string) || null;
        clientToken = (cfg?.client_token as string) || "";
      }
    }

    // Fallback: try any active Z-API connection
    if (!instanceId || !token) {
      const { data: zapiConfig } = await serviceClient
        .from("connection_configs")
        .select("config")
        .eq("connection_id", "zapi")
        .eq("is_connected", true)
        .limit(1)
        .maybeSingle();

      if (zapiConfig) {
        const cfg = zapiConfig.config as Record<string, unknown>;
        instanceId = instanceId || (cfg?.instance_id as string) || null;
        token = token || (cfg?.token as string) || null;
        clientToken = clientToken || (cfg?.client_token as string) || "";
      }
    }

    // Final fallback: env vars
    instanceId = instanceId || Deno.env.get("ZAPI_INSTANCE_ID") || null;
    token = token || Deno.env.get("ZAPI_TOKEN") || null;
    clientToken = clientToken || Deno.env.get("ZAPI_CLIENT_TOKEN") || "";

    if (!instanceId || !token) {
      return new Response(
        JSON.stringify({ error: "Z-API credentials are missing" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const phone = conversation.contact_phone.replace(/\D/g, "");

    // Choose Z-API endpoint based on type
    let zapiEndpoint = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
    let zapiBody: Record<string, unknown> = { phone, message };

    if (mediaUrl && type === "image") {
      zapiEndpoint = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-image`;
      zapiBody = { phone, image: mediaUrl, caption: message || "" };
    } else if (mediaUrl && type === "video") {
      zapiEndpoint = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-video`;
      zapiBody = { phone, video: mediaUrl, caption: message || "" };
    } else if (mediaUrl && type === "audio") {
      zapiEndpoint = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-audio`;
      zapiBody = { phone, audio: mediaUrl };
    } else if (mediaUrl && type === "document") {
      const docName = message || "Documento";
      zapiEndpoint = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-document/${encodeURIComponent(docName)}`;
      zapiBody = { phone, document: mediaUrl };
    }

    const zapiResponse = await fetch(zapiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": clientToken,
      },
      body: JSON.stringify(zapiBody),
    });

    const zapiResult = await zapiResponse.json().catch(() => ({}));
    const providerMessageId = zapiResult?.messageId || zapiResult?.zaapId || null;
    const rawErr = zapiResult?.error || (!zapiResponse.ok ? (zapiResult?.message || `HTTP ${zapiResponse.status}`) : null);
    const providerError = rawErr
      ? JSON.stringify({
          code: zapiResponse.status,
          title: "Z-API",
          message: typeof rawErr === "string" ? rawErr : (rawErr?.message || JSON.stringify(rawErr)),
          error_data: { details: typeof zapiResult === "string" ? zapiResult : JSON.stringify(zapiResult).slice(0, 400) },
        }).slice(0, 800)
      : null;

    if (!zapiResponse.ok || providerError) {
      console.error("Z-API send error:", zapiResult);

      const { data: failedMsg } = await serviceClient
        .from("messages")
        .insert({
          conversation_id: conversationId,
          content: message || "",
          sender_type: "agent",
          sender_agent_id: senderAgentId,
          message_type: type,
          status: "failed",
          provider_status: "failed",
          provider_error: providerError,
          sender_label: senderLabel || (senderAgentId ? "humano" : null),
          media_url: mediaUrl,
        })
        .select()
        .single();

      return new Response(
        JSON.stringify({ error: "Failed to send message via Z-API", details: zapiResult, savedMessage: failedMsg }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: savedMsg, error: msgError } = await serviceClient
      .from("messages")
      .insert({
        conversation_id: conversationId,
        content: message || "",
        sender_type: "agent",
        sender_agent_id: senderAgentId,
        message_type: type,
        status: providerMessageId ? "pending" : "sent",
        provider_message_id: providerMessageId,
        provider_status: providerMessageId ? "accepted" : null,
        sender_label: senderLabel || (senderAgentId ? "humano" : null),
        media_url: mediaUrl,
      })
      .select()
      .single();

    if (msgError) {
      console.error("Error saving message:", msgError);
    }

    await serviceClient
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    return new Response(
      JSON.stringify({
        success: true,
        zapiMessageId: providerMessageId,
        savedMessage: savedMsg,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Z-API send error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
