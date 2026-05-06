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

const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`;
const generateVerifyToken = () => crypto.randomUUID().replace(/-/g, "").slice(0, 24);

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

function extractCandidateWabaIds(debugData: Record<string, any>) {
  const ids = new Set<string>();
  const granularScopes = debugData?.data?.granular_scopes || [];

  for (const scope of granularScopes) {
    if (
      ["whatsapp_business_management", "whatsapp_business_messaging", "whatsapp_business_manage_events"].includes(scope.scope)
    ) {
      for (const targetId of scope.target_ids || []) {
        if (targetId) ids.add(String(targetId));
      }
    }
  }

  return Array.from(ids);
}

async function discoverNewestPhone(accessToken: string, candidateWabaIds: string[]) {
  const phones: Array<Record<string, any>> = [];

  for (const wabaId of candidateWabaIds) {
    try {
      const phoneData = await graphRequest(
        `/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,name_status,webhook_configuration,last_onboarded_time`,
        accessToken
      );

      for (const phone of phoneData?.data || []) {
        phones.push({ ...phone, waba_id: wabaId });
      }
    } catch (error) {
      console.error(`Failed to load phone numbers for WABA ${wabaId}:`, error);
    }
  }

  phones.sort((a, b) => {
    const aTime = a.last_onboarded_time ? new Date(a.last_onboarded_time).getTime() : 0;
    const bTime = b.last_onboarded_time ? new Date(b.last_onboarded_time).getTime() : 0;
    return bTime - aTime;
  });

  return phones[0] || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    const META_APP_ID = Deno.env.get("META_APP_ID");
    const META_APP_SECRET = Deno.env.get("META_APP_SECRET");

    if (!META_APP_ID || !META_APP_SECRET) {
      return jsonResponse({ error: "META_APP_ID or META_APP_SECRET not configured" }, 500);
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "get_app_id") {
      const META_CONFIG_ID = Deno.env.get("META_CONFIG_ID") || null;
      return jsonResponse({ app_id: META_APP_ID, webhook_url: webhookUrl, config_id: META_CONFIG_ID });
    }

    if (action === "exchange_token") {
      const { accessToken, label } = body;

      if (!accessToken) {
        return jsonResponse({ error: "accessToken is required" }, 400);
      }

      const tokenData = await graphRequest(
        `/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${encodeURIComponent(accessToken)}`,
        accessToken
      );
      const longLivedToken = tokenData.access_token;

      const debugData = await graphRequest(
        `/debug_token?input_token=${encodeURIComponent(longLivedToken)}`,
        `${META_APP_ID}|${META_APP_SECRET}`
      );
      console.log("Debug token data:", JSON.stringify(debugData));

      const candidateWabaIds = extractCandidateWabaIds(debugData);
      const selectedPhone = await discoverNewestPhone(longLivedToken, candidateWabaIds);

      if (!selectedPhone?.id || !selectedPhone?.waba_id) {
        return jsonResponse(
          {
            error:
              "Não foi possível identificar o número compartilhado com o app. Refaça a conexão e confirme o compartilhamento do ativo do WhatsApp Business.",
          },
          400
        );
      }

      const subscription = await ensureAppSubscription(selectedPhone.waba_id, longLivedToken, META_APP_ID);
      const configuredWebhookUrl = selectedPhone?.webhook_configuration?.application || "";
      const verifyToken = generateVerifyToken();
      const connectionConfig: Record<string, string> = {
        access_token: longLivedToken,
        waba_id: selectedPhone.waba_id,
        phone_number_id: selectedPhone.id,
        phone_display: selectedPhone.display_phone_number || "",
        verified_name: selectedPhone.verified_name || "",
        quality_rating: selectedPhone.quality_rating || "",
        name_status: selectedPhone.name_status || "",
        verify_token: verifyToken,
        webhook_url: webhookUrl,
        setup_method: "embedded_signup",
      };

      const status = configuredWebhookUrl === webhookUrl && subscription.appSubscribed ? "active" : "pending_setup";

      const { data: existingConnections } = await serviceClient
        .from("connection_configs")
        .select("id, config")
        .eq("connection_id", "whatsapp");

      const existing = existingConnections?.find((connection: Record<string, any>) => {
        const existingConfig = connection.config as Record<string, string>;
        return existingConfig?.phone_number_id === selectedPhone.id;
      });

      let savedId: string;

      if (existing?.id) {
        const { error: updateError } = await serviceClient
          .from("connection_configs")
          .update({
            config: connectionConfig,
            label: label?.trim() || selectedPhone.display_phone_number || "WhatsApp",
            is_connected: true,
            status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (updateError) {
          console.error("Update error:", updateError);
          return jsonResponse({ error: "Failed to update connection" }, 500);
        }

        savedId = existing.id;
      } else {
        const { data, error: insertError } = await serviceClient
          .from("connection_configs")
          .insert({
            connection_id: "whatsapp",
            config: connectionConfig,
            label: label?.trim() || selectedPhone.display_phone_number || "WhatsApp",
            is_connected: true,
            status,
          })
          .select("id")
          .single();

        if (insertError) {
          console.error("Insert error:", insertError);
          return jsonResponse({ error: "Failed to save connection" }, 500);
        }

        savedId = data.id;
      }

      return jsonResponse({
        success: true,
        id: savedId,
        waba_id: selectedPhone.waba_id,
        phone_number_id: selectedPhone.id,
        phone_display: selectedPhone.display_phone_number,
        verify_token: verifyToken,
        webhook_url: webhookUrl,
        status,
        diagnostics: {
          candidate_waba_ids: candidateWabaIds,
          configured_webhook_url: configuredWebhookUrl,
          webhook_url_matches: configuredWebhookUrl === webhookUrl,
          app_subscribed: subscription.appSubscribed,
          subscribed_apps_count: subscription.subscribedApps.length,
        },
      });
    }

    return jsonResponse({ error: "Invalid action" }, 400);
  } catch (error) {
    console.error("Meta embedded signup error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});