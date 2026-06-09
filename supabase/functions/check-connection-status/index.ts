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

const getWebhookUrl = (connectionId: string) =>
  connectionId === "whatsapp"
    ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`
    : `${Deno.env.get("SUPABASE_URL")}/functions/v1/zapi-webhook`;

async function graphRequest(path: string, accessToken: string) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${GRAPH_API}${path}${separator}access_token=${encodeURIComponent(accessToken)}`);
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { configId } = await req.json();

    if (!configId) {
      return jsonResponse({ error: "configId is required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: conn, error } = await supabase
      .from("connection_configs")
      .select("*")
      .eq("id", configId)
      .single();

    if (error || !conn) {
      return jsonResponse({ error: "Connection not found" }, 404);
    }

    const config = conn.config as Record<string, string>;
    let status = "unknown";
    let details: Record<string, unknown> = {};

    if (conn.connection_id === "whatsapp") {
      const token = config.access_token || Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
      const phoneId = config.phone_number_id || "";
      const metaAppId = Deno.env.get("META_APP_ID");
      const expectedWebhookUrl = getWebhookUrl("whatsapp");

      if (!token || !phoneId) {
        status = "error";
        details = { error: "Missing phone_number_id or access_token" };
      } else {
        try {
          const phoneData = await graphRequest(
            `/${phoneId}?fields=id,display_phone_number,verified_name,quality_rating,status,messaging_limit_tier`,
            token
          );

          const wabaId = config.waba_id || "";
          const configuredWebhookUrl = config.webhook_url || "";
          const webhookUrlMatches = configuredWebhookUrl ? configuredWebhookUrl === expectedWebhookUrl : null;
          let appSubscribed: boolean | null = null;
          let subscribedAppsCount = 0;
          let wabaStatus: string | null = null;

          if (wabaId) {
            const subscribedApps = await getSubscribedApps(wabaId, token, metaAppId);
            appSubscribed = subscribedApps.appSubscribed;
            subscribedAppsCount = subscribedApps.subscribedApps.length;

            // Check WABA-level restrictions
            try {
              const wabaData = await graphRequest(
                `/${wabaId}?fields=id,account_review_status,message_template_namespace`,
                token
              );
              wabaStatus = wabaData?.account_review_status || null;
            } catch { /* ignore WABA check errors */ }
          }

          // Detect blocked/flagged phone statuses from Meta
          const phoneStatus = (phoneData?.status || "").toUpperCase();
          const blockedStatuses = ["FLAGGED", "RESTRICTED", "RATE_LIMITED", "BANNED", "BLOCKED", "DISABLED", "OFFLINE"];
          const isPhoneBlocked = blockedStatuses.includes(phoneStatus);
          const qualityRating = (phoneData?.quality_rating || "").toUpperCase();
          const isLowQuality = qualityRating === "RED";
          const isWabaRestricted = wabaStatus && ["REJECTED", "DISABLED", "FLAGGED", "RESTRICTED"].includes(wabaStatus.toUpperCase());

          if (isPhoneBlocked || isWabaRestricted) {
            status = "blocked";
          } else if (appSubscribed === false) {
            status = "pending_setup";
          } else if (isLowQuality) {
            status = "warning";
          } else {
            status = "active";
          }

          console.log(`[check-connection-status] ${config.phone_display || phoneId}: phone_status=${phoneData?.status}, quality=${phoneData?.quality_rating}, waba_status=${wabaStatus}, final_status=${status}`);

          details = {
            verified_name: phoneData?.verified_name,
            quality_rating: phoneData?.quality_rating,
            phone: phoneData?.display_phone_number,
            phone_status: phoneData?.status,
            messaging_limit: phoneData?.messaging_limit_tier || null,
            waba_id: wabaId || null,
            waba_status: wabaStatus,
            expected_webhook_url: expectedWebhookUrl,
            configured_webhook_url: configuredWebhookUrl || null,
            webhook_url_matches: webhookUrlMatches,
            app_subscribed: appSubscribed,
            subscribed_apps_count: subscribedAppsCount,
          };
        } catch (e) {
          status = "error";
          details = { error: e instanceof Error ? e.message : String(e) };
        }
      }
    } else if (conn.connection_id === "evolution") {
      const serverUrl = (config.server_url || "").replace(/\/$/, "");
      const instanceName = config.instance_name || "";
      const apiKey = config.api_key || "";

      if (!serverUrl || !instanceName || !apiKey) {
        status = "error";
        details = { error: "Missing server_url, instance_name or api_key" };
      } else {
        try {
          const res = await fetch(`${serverUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
            headers: { apikey: apiKey },
          });
          const data = await res.json();
          const state = data?.instance?.state || data?.state || "unknown";
          if (state === "open") {
            status = "active";
            details = { state, instance: instanceName, server_url: serverUrl };
          } else {
            status = "error";
            details = { error: `Instance state: ${state}`, state, instance: instanceName };
          }
        } catch (e) {
          status = "error";
          details = { error: e instanceof Error ? e.message : String(e) };
        }
      }
    } else if (conn.connection_id === "zapi") {
      const instanceId = config.instance_id;
      const token = config.token || Deno.env.get("ZAPI_TOKEN");
      const clientToken = config.client_token || Deno.env.get("ZAPI_CLIENT_TOKEN");

      if (instanceId && token) {
        try {
          const headers: Record<string, string> = {};
          if (clientToken) headers["Client-Token"] = clientToken;

          const res = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/status`, { headers });
          const data = await res.json();
          if (data.connected === true) {
            status = "active";
            details = { phone: data.smartPhoneConnected, session: data.session };
          } else {
            status = "error";
            details = { error: data.error || data.message || "Disconnected" };
          }
        } catch (e) {
          status = "error";
          details = { error: String(e) };
        }
      } else {
        status = "error";
        details = { error: "Missing instance_id or token" };
      }
    }

    await supabase
      .from("connection_configs")
      .update({ status, last_checked_at: new Date().toISOString() })
      .eq("id", configId);

    return jsonResponse({ status, details });
  } catch (err) {
    console.error("check-connection-status error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});