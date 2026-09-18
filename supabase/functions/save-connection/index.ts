import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizeLabel = (label?: string) => label?.trim() || "";
const generateVerifyToken = () => crypto.randomUUID().replace(/-/g, "").slice(0, 24);
const getWebhookUrl = (connectionId: string) =>
  connectionId === "whatsapp"
    ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`
    : `${Deno.env.get("SUPABASE_URL")}/functions/v1/zapi-webhook`;

async function graphRequest(path: string, accessToken: string, init?: RequestInit) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${GRAPH_API}${path}${separator}access_token=${encodeURIComponent(accessToken)}`, init);
  const data = await response.json();

  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || `Graph API error on ${path}`);
  }

  return data;
}

async function getSubscribedApps(wabaId: string, accessToken: string, metaAppId?: string | null) {
  const data = await graphRequest(`/${wabaId}/subscribed_apps`, accessToken);
  const subscribedApps = Array.isArray(data?.data) ? data.data : [];

  return {
    subscribedApps,
    appSubscribed: metaAppId
      ? subscribedApps.some((app: Record<string, unknown>) => String(app.id || "") === metaAppId)
      : subscribedApps.length > 0,
  };
}

async function ensureAppSubscription(wabaId: string, accessToken: string, metaAppId?: string | null) {
  const before = await getSubscribedApps(wabaId, accessToken, metaAppId);
  if (before.appSubscribed) {
    return before;
  }

  await graphRequest(`/${wabaId}/subscribed_apps`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  return getSubscribedApps(wabaId, accessToken, metaAppId);
}

async function validateWhatsAppConfig(rawConfig: Record<string, string>) {
  const accessToken = rawConfig.access_token?.trim();
  const phoneNumberId = rawConfig.phone_number_id?.trim();
  const metaAppId = Deno.env.get("META_APP_ID");
  const webhookUrl = getWebhookUrl("whatsapp");

  if (!accessToken) {
    throw new Error("Access Token é obrigatório.");
  }

  if (!phoneNumberId) {
    throw new Error("Phone Number ID é obrigatório.");
  }

  let phoneData: Record<string, unknown> | null = null;
  try {
    phoneData = await graphRequest(
      `/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,status`,
      accessToken
    );
  } catch (e) {
    console.error("Graph API validation failed for phone_number_id:", phoneNumberId, e);
    // Return error status instead of crashing
    return {
      status: "error",
      config: {
        ...rawConfig,
        access_token: accessToken,
        phone_number_id: phoneNumberId,
        verify_token: rawConfig.verify_token?.trim() || generateVerifyToken(),
        webhook_url: webhookUrl,
        setup_method: rawConfig.setup_method || "manual",
      },
      diagnostics: {
        error: e instanceof Error ? e.message : String(e),
        phone_number_id: phoneNumberId,
        webhook_url: webhookUrl,
      },
    };
  }

  const wabaId = rawConfig.waba_id?.trim() || "";
  let appSubscribed: boolean | null = null;
  let subscribedApps: unknown[] = [];

  if (wabaId) {
    const subscriptionResult = await ensureAppSubscription(wabaId, accessToken, metaAppId);
    appSubscribed = subscriptionResult.appSubscribed;
    subscribedApps = subscriptionResult.subscribedApps;
  }

  const configuredWebhook = rawConfig.webhook_url?.trim() || "";
  const webhookMatches = configuredWebhook ? configuredWebhook === webhookUrl : null;
  const verifyToken = rawConfig.verify_token?.trim() || generateVerifyToken();
  const requiresSetup = appSubscribed === false;

  return {
    status: requiresSetup ? "pending_setup" : "active",
    config: {
      ...rawConfig,
      access_token: accessToken,
      phone_number_id: phoneNumberId,
      verify_token: verifyToken,
      waba_id: wabaId,
      phone_display: phoneData?.display_phone_number || rawConfig.phone_display || "",
      verified_name: phoneData?.verified_name || rawConfig.verified_name || "",
      quality_rating: phoneData?.quality_rating || rawConfig.quality_rating || "",
      name_status: rawConfig.name_status || "",
      phone_status: phoneData?.status || rawConfig.phone_status || "",
      webhook_url: webhookUrl,
      setup_method: rawConfig.setup_method || "manual",
    },
    diagnostics: {
      webhook_url: webhookUrl,
      configured_webhook_url: configuredWebhook || null,
      webhook_url_matches: webhookMatches,
      app_subscribed: appSubscribed,
      subscribed_apps_count: subscribedApps.length,
      phone_display: phoneData?.display_phone_number || null,
      verified_name: phoneData?.verified_name || null,
      quality_rating: phoneData?.quality_rating || null,
      phone_status: phoneData?.status || null,
      waba_id: wabaId || null,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, id, connectionId, config, label } = body;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "delete") {
      if (!id) {
        return jsonResponse({ error: "id is required for delete" }, 400);
      }

      let deletedConversations = 0;

      try {
        // Delete conversations (and all dependent rows) in small server-side batches
        // to avoid statement timeouts on connections with many conversations.
        for (let i = 0; i < 500; i++) {
          const { data: removed, error: batchErr } = await serviceClient.rpc(
            "delete_connection_conversations_batch",
            { p_connection_id: id, p_limit: 100 }
          );
          if (batchErr) {
            throw new Error(`Failed cleaning conversations: ${batchErr.message}`);
          }
          const n = Number(removed ?? 0);
          deletedConversations += n;
          if (n === 0) break;
        }


        // Niche connections referencing this config
        const { error: ncErr } = await serviceClient
          .from("niche_connections")
          .delete()
          .eq("connection_config_id", id);
        if (ncErr) throw new Error(`Failed cleaning niche_connections: ${ncErr.message}`);

        // The connection config itself
        const { error } = await serviceClient.from("connection_configs").delete().eq("id", id);
        if (error) throw new Error(`Failed deleting connection: ${error.message}`);
      } catch (cleanupErr) {
        const msg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
        console.error("[delete] Cleanup failed:", msg);
        return jsonResponse({ error: msg }, 500);
      }

      console.log(`[delete] Connection ${id} deleted with ${deletedConversations} conversations.`);
      return jsonResponse({ success: true, deletedConversations });
    }

    if (action === "update") {
      if (!id) {
        return jsonResponse({ error: "id is required for update" }, 400);
      }

      const { data: existing, error: existingError } = await serviceClient
        .from("connection_configs")
        .select("connection_id, config")
        .eq("id", id)
        .single();

      if (existingError || !existing) {
        return jsonResponse({ error: "Connection not found" }, 404);
      }

      let updateConfig = config ?? existing.config;
      let status = undefined;
      let diagnostics: Record<string, unknown> | undefined;

      if (existing.connection_id === "whatsapp") {
        const validation = await validateWhatsAppConfig(updateConfig as Record<string, string>);
        updateConfig = validation.config;
        status = validation.status;
        diagnostics = validation.diagnostics;
      }

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        config: updateConfig,
      };

      if (label !== undefined) updateData.label = normalizeLabel(label);
      if (status) updateData.status = status;

      const { error } = await serviceClient.from("connection_configs").update(updateData).eq("id", id);

      if (error) {
        console.error("Update error:", error);
        return jsonResponse({ error: "Failed to update" }, 500);
      }

      return jsonResponse({ success: true, status, diagnostics });
    }

    if (!connectionId) {
      return jsonResponse({ error: "connectionId is required" }, 400);
    }

    if (!config) {
      return jsonResponse({ error: "config is required" }, 400);
    }

    let connectionConfig = config as Record<string, string>;
    let status = "unknown";
    let diagnostics: Record<string, unknown> | undefined;

    if (connectionId === "whatsapp") {
      const validation = await validateWhatsAppConfig(connectionConfig);
      connectionConfig = validation.config as Record<string, string>;
      status = validation.status;
      diagnostics = validation.diagnostics;
    } else if (connectionId === "extension") {
      status = "active";
    } else if (connectionId === "uazapigo") {
      const serverUrl = String(Deno.env.get("UAZAPIGO_SERVER_URL") || connectionConfig.server_url || "").replace(/\/+$/, "");
      const adminToken = String(Deno.env.get("UAZAPIGO_ADMIN_TOKEN") || "").trim();
      const instanceName = String(connectionConfig.instance_name || normalizeLabel(label)).trim();
      let token = String(connectionConfig.token || "").trim();
      if (!serverUrl || !adminToken) return jsonResponse({ error: "Servidor ou Admin Token da uazapiGO não configurado" }, 500);
      if (!instanceName) return jsonResponse({ error: "Nome da instância é obrigatório" }, 400);

      if (!token) {
        const initResponse = await fetch(`${serverUrl}/instance/init`, {
          method: "POST",
          headers: { "Content-Type": "application/json", admintoken: adminToken },
          body: JSON.stringify({ name: instanceName }),
        }).catch(() => null);
        const initResult = initResponse ? await initResponse.json().catch(() => ({})) : {};
        token = String(initResult?.token ?? initResult?.instance?.token ?? initResult?.data?.token ?? "").trim();
        if (!initResponse?.ok || !token) {
          const detail = initResult?.error?.message || initResult?.error || initResult?.message || "A uazapiGO não retornou o token da instância";
          return jsonResponse({ error: `Não foi possível criar a instância: ${detail}`, diagnostics: { provider_status: initResponse?.status || 0 } }, 400);
        }
      }

      const response = await fetch(`${serverUrl}/instance/status`, { headers: { token } }).catch(() => null);
      const result = response ? await response.json().catch(() => ({})) : {};
      const state = String(result?.status ?? result?.state ?? result?.instance?.status ?? result?.instance?.state ?? "unknown").toLowerCase();
      const connected = Boolean(response?.ok && ["connected", "open"].includes(state));
      status = connected ? "active" : "error";
      connectionConfig = {
        ...connectionConfig,
        server_url: serverUrl,
        token,
        instance_name: instanceName,
        webhook_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/uazapigo-webhook`,
      };
      diagnostics = { state, connected };
    }

    const { data, error: insertError } = await serviceClient
      .from("connection_configs")
      .insert({
        connection_id: connectionId,
        config: connectionConfig,
        label: normalizeLabel(label),
        is_connected: connectionId === "uazapigo" ? status === "active" : true,
        status,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return jsonResponse({ error: "Failed to create connection" }, 500);
    }

    if (connectionId === "uazapigo") {
      const serverUrl = String(connectionConfig.server_url || "").replace(/\/+$/, "");
      const token = String(connectionConfig.token || "");
      const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/uazapigo-webhook?configId=${encodeURIComponent(data.id)}`;
      try {
        const webhookResponse = await fetch(`${serverUrl}/webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token },
          body: JSON.stringify({
            enabled: true,
            url: webhookUrl,
            events: ["connection", "messages", "messages_update"],
            addUrlEvents: false,
            addUrlTypesMessages: false,
          }),
        });
        const webhookResult = await webhookResponse.json().catch(() => ({}));
        if (!webhookResponse.ok || webhookResult?.error) {
          diagnostics = { ...(diagnostics || {}), webhook_configured: false, webhook_error: webhookResult?.error || webhookResult?.message || `HTTP ${webhookResponse.status}` };
        } else {
          diagnostics = { ...(diagnostics || {}), webhook_configured: true };
          await serviceClient.from("connection_configs").update({ config: { ...connectionConfig, webhook_url: webhookUrl } }).eq("id", data.id);
        }
      } catch (webhookError) {
        diagnostics = { ...(diagnostics || {}), webhook_configured: false, webhook_error: webhookError instanceof Error ? webhookError.message : String(webhookError) };
      }
    }

    return jsonResponse({ success: true, id: data.id, status, diagnostics });
  } catch (error) {
    console.error("Save connection error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});