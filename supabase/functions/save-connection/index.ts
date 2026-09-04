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

      // Helper: delete in chunks to avoid query size limits
      const CHUNK = 200;
      const chunked = <T,>(arr: T[]): T[][] => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += CHUNK) out.push(arr.slice(i, i + CHUNK));
        return out;
      };

      // 1. Get all conversation IDs linked to this connection (paginated to bypass 1000 row default)
      const convoIds: string[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data: page, error: pageErr } = await serviceClient
          .from("conversations")
          .select("id")
          .eq("connection_config_id", id)
          .range(from, from + PAGE - 1);
        if (pageErr) {
          console.error("Error paginating conversations:", pageErr);
          return jsonResponse({ error: `Failed to load conversations: ${pageErr.message}` }, 500);
        }
        if (!page || page.length === 0) break;
        convoIds.push(...page.map((c: { id: string }) => c.id));
        if (page.length < PAGE) break;
        from += PAGE;
      }

      console.log(`[delete] Connection ${id} has ${convoIds.length} conversations to remove.`);

      const tryDelete = async (table: string, column: string, ids: string[]) => {
        for (const batch of chunked(ids)) {
          const { error: delErr } = await serviceClient.from(table).delete().in(column, batch);
          if (delErr) {
            console.error(`[delete] Error deleting from ${table}.${column}:`, delErr.message);
            throw new Error(`Failed cleaning ${table}: ${delErr.message}`);
          }
        }
      };

      try {
        if (convoIds.length > 0) {
          // Get flow_execution IDs first (flow_step_logs depends on them)
          const execIds: string[] = [];
          for (const batch of chunked(convoIds)) {
            const { data: execs } = await serviceClient
              .from("flow_executions")
              .select("id")
              .in("conversation_id", batch);
            if (execs) execIds.push(...execs.map((e: { id: string }) => e.id));
          }
          if (execIds.length > 0) {
            await tryDelete("flow_step_logs", "execution_id", execIds);
          }

          // Delete all conversation-dependent rows in batches
          await tryDelete("flow_executions", "conversation_id", convoIds);
          await tryDelete("messages", "conversation_id", convoIds);
          await tryDelete("agent_assignment_history", "conversation_id", convoIds);
          await tryDelete("follow_up_executions", "conversation_id", convoIds);
          await tryDelete("manager_analyses", "conversation_id", convoIds);
          await tryDelete("ai_usage_logs", "conversation_id", convoIds);
          await tryDelete("conversion_events", "conversation_id", convoIds);
          await tryDelete("conversion_leads", "conversation_id", convoIds);
          await tryDelete("orders", "conversation_id", convoIds);
          await tryDelete("pending_ai_replies", "conversation_id", convoIds);
          await tryDelete("sales_orders", "conversation_id", convoIds);
          await tryDelete("webhook_logs", "conversation_id", convoIds);

          // Finally remove the conversations
          await tryDelete("conversations", "id", convoIds);
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

      console.log(`[delete] Connection ${id} deleted with ${convoIds.length} conversations.`);
      return jsonResponse({ success: true, deletedConversations: convoIds.length });
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
    }

    const { data, error: insertError } = await serviceClient
      .from("connection_configs")
      .insert({
        connection_id: connectionId,
        config: connectionConfig,
        label: normalizeLabel(label),
        is_connected: true,
        status,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return jsonResponse({ error: "Failed to create connection" }, 500);
    }

    return jsonResponse({ success: true, id: data.id, status, diagnostics });
  } catch (error) {
    console.error("Save connection error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});