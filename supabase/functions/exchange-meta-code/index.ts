import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_API = "https://graph.facebook.com/v24.0";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function graphGet(path: string, token: string) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH_API}${path}${sep}access_token=${encodeURIComponent(token)}`);
  const data = await res.json();
  if (!res.ok || data?.error) throw new Error(data?.error?.message || `Graph error on ${path}`);
  return data;
}

async function graphPost(path: string, token: string, body?: Record<string, unknown>) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH_API}${path}${sep}access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok || data?.error) throw new Error(data?.error?.message || `Graph POST error on ${path}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { code, workspaceId, label } = await req.json();

    if (!code) return json({ error: "authorization code is required" }, 400);

    const META_APP_ID = Deno.env.get("META_APP_ID");
    const META_APP_SECRET = Deno.env.get("META_APP_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

    if (!META_APP_ID || !META_APP_SECRET) {
      return json({ error: "META_APP_ID or META_APP_SECRET not configured" }, 500);
    }

    const webhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;

    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData } = await anonClient.auth.getUser();
      userId = claimsData?.user?.id || null;
    }

    const serviceClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ─── STEP 1: Exchange code for access token ───
    console.log("Step 1: Exchanging code for token...");
    const tokenUrl = `${GRAPH_API}/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&redirect_uri=${encodeURIComponent(webhookUrl)}&code=${encodeURIComponent(code)}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      console.error("Token exchange failed:", tokenData);
      return json({
        error: "Falha ao trocar código de autorização",
        details: tokenData?.error?.message || tokenData?.error,
      }, 400);
    }

    const shortLivedToken = tokenData.access_token;
    console.log("Got short-lived token, exchanging for long-lived...");

    // Exchange for long-lived token
    const longLivedData = await graphGet(
      `/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${encodeURIComponent(shortLivedToken)}`,
      shortLivedToken
    );
    const accessToken = longLivedData.access_token;
    const expiresIn = longLivedData.expires_in;
    console.log("Got long-lived token, expires_in:", expiresIn);

    // ─── STEP 2: Debug token to find shared assets ───
    console.log("Step 2: Debugging token...");
    const debugData = await graphGet(
      `/debug_token?input_token=${encodeURIComponent(accessToken)}`,
      `${META_APP_ID}|${META_APP_SECRET}`
    );
    console.log("Debug data granular_scopes:", JSON.stringify(debugData?.data?.granular_scopes));

    // Extract WABA IDs from granular scopes
    const wabaIds = new Set<string>();
    for (const scope of debugData?.data?.granular_scopes || []) {
      if (["whatsapp_business_management", "whatsapp_business_messaging", "whatsapp_business_manage_events"].includes(scope.scope)) {
        for (const id of scope.target_ids || []) {
          if (id) wabaIds.add(String(id));
        }
      }
    }
    const candidateWabaIds = Array.from(wabaIds);
    console.log("Candidate WABA IDs:", candidateWabaIds);

    if (candidateWabaIds.length === 0) {
      return json({
        error: "Nenhum WhatsApp Business Account foi compartilhado. Refaça o processo e compartilhe o ativo.",
      }, 400);
    }

    // ─── STEP 3: Discover business_id ───
    console.log("Step 3: Fetching business info...");
    let businessId: string | null = null;
    try {
      const meData = await graphGet("/me?fields=id,name", accessToken);
      // Try to get business from WABA
      for (const wabaId of candidateWabaIds) {
        try {
          const wabaInfo = await graphGet(`/${wabaId}?fields=id,name,owner_business_info`, accessToken);
          if (wabaInfo?.owner_business_info?.id) {
            businessId = wabaInfo.owner_business_info.id;
            break;
          }
        } catch { /* continue */ }
      }
      if (!businessId) businessId = meData?.id || null;
    } catch (e) {
      console.warn("Could not fetch business_id:", e);
    }

    // ─── STEP 4: Find newest phone number ───
    console.log("Step 4: Finding phone numbers...");
    const allPhones: Array<Record<string, any>> = [];
    for (const wabaId of candidateWabaIds) {
      try {
        const phonesData = await graphGet(
          `/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,name_status,last_onboarded_time`,
          accessToken
        );
        for (const phone of phonesData?.data || []) {
          allPhones.push({ ...phone, waba_id: wabaId });
        }
      } catch (e) {
        console.warn(`Failed to fetch phones for WABA ${wabaId}:`, e);
      }
    }

    if (allPhones.length === 0) {
      return json({
        error: "Nenhum número de telefone encontrado nas contas compartilhadas.",
      }, 400);
    }

    // Sort by last_onboarded_time descending
    allPhones.sort((a, b) => {
      const at = a.last_onboarded_time ? new Date(a.last_onboarded_time).getTime() : 0;
      const bt = b.last_onboarded_time ? new Date(b.last_onboarded_time).getTime() : 0;
      return bt - at;
    });
    const selectedPhone = allPhones[0];
    console.log("Selected phone:", selectedPhone.display_phone_number, "WABA:", selectedPhone.waba_id);

    // ─── STEP 5: Register webhook / subscribe app ───
    console.log("Step 5: Subscribing app to WABA...");
    let webhookStatus = "pending";
    try {
      await graphPost(`/${selectedPhone.waba_id}/subscribed_apps`, accessToken);
      webhookStatus = "active";
      console.log("App subscribed successfully");
    } catch (e) {
      console.error("Failed to subscribe app:", e);
      webhookStatus = "failed";
    }

    // ─── STEP 6: Save to database ───
    console.log("Step 6: Saving to database...");
    const verifyToken = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    const connLabel = label?.trim() || selectedPhone.verified_name || selectedPhone.display_phone_number || "WhatsApp";

    // Check if connection_config already exists for this phone_number_id
    const { data: existingConfigs } = await serviceClient
      .from("connection_configs")
      .select("id, config")
      .eq("connection_id", "whatsapp");

    const existingConfig = existingConfigs?.find((c: any) => {
      const cfg = c.config as Record<string, string>;
      return cfg?.phone_number_id === selectedPhone.id;
    });

    const connectionConfig: Record<string, string> = {
      access_token: accessToken,
      waba_id: selectedPhone.waba_id,
      phone_number_id: selectedPhone.id,
      phone_display: selectedPhone.display_phone_number || "",
      verified_name: selectedPhone.verified_name || "",
      quality_rating: selectedPhone.quality_rating || "",
      name_status: selectedPhone.name_status || "",
      verify_token: verifyToken,
      webhook_url: webhookUrl,
      setup_method: "embedded_signup_v2",
      business_id: businessId || "",
    };

    let connectionConfigId: string;
    const connectionStatus = webhookStatus === "active" ? "active" : "pending_setup";

    if (existingConfig?.id) {
      await serviceClient
        .from("connection_configs")
        .update({
          config: connectionConfig,
          label: connLabel,
          is_connected: true,
          status: connectionStatus,
          updated_at: new Date().toISOString(),
          ...(workspaceId ? { workspace_id: workspaceId } : {}),
        })
        .eq("id", existingConfig.id);
      connectionConfigId = existingConfig.id;
    } else {
      const { data: newConn, error: insertErr } = await serviceClient
        .from("connection_configs")
        .insert({
          connection_id: "whatsapp",
          config: connectionConfig,
          label: connLabel,
          is_connected: true,
          status: connectionStatus,
          ...(workspaceId ? { workspace_id: workspaceId } : {}),
        })
        .select("id")
        .single();

      if (insertErr) {
        console.error("Insert connection_configs error:", insertErr);
        return json({ error: "Falha ao salvar conexão" }, 500);
      }
      connectionConfigId = newConn.id;
    }

    // Save to meta_connections
    if (workspaceId) {
      const { error: metaErr } = await serviceClient.from("meta_connections").upsert(
        {
          workspace_id: workspaceId,
          user_id: userId || "00000000-0000-0000-0000-000000000000",
          connection_config_id: connectionConfigId,
          business_id: businessId,
          waba_id: selectedPhone.waba_id,
          phone_number_id: selectedPhone.id,
          access_token: accessToken,
          token_type: "long_lived",
          expires_in: expiresIn || null,
          connected_phone: selectedPhone.display_phone_number || "",
          verified_name: selectedPhone.verified_name || "",
          quality_rating: selectedPhone.quality_rating || "",
          webhook_status: webhookStatus,
          status: "active",
          raw_debug_info: {
            candidate_waba_ids: candidateWabaIds,
            all_phones: allPhones.map((p) => ({
              id: p.id,
              display: p.display_phone_number,
              waba_id: p.waba_id,
            })),
            debug_scopes: debugData?.data?.granular_scopes,
          },
        },
        { onConflict: "phone_number_id", ignoreDuplicates: false }
      );

      if (metaErr) {
        console.warn("meta_connections upsert warning:", metaErr);
      }
    }

    console.log("✅ Connection saved successfully:", connectionConfigId);

    return json({
      success: true,
      connection_config_id: connectionConfigId,
      business_id: businessId,
      waba_id: selectedPhone.waba_id,
      phone_number_id: selectedPhone.id,
      phone_display: selectedPhone.display_phone_number,
      verified_name: selectedPhone.verified_name,
      webhook_status: webhookStatus,
      status: connectionStatus,
      all_phones: allPhones.map((p) => ({
        id: p.id,
        display: p.display_phone_number,
        verified_name: p.verified_name,
        waba_id: p.waba_id,
      })),
    });
  } catch (error) {
    console.error("exchange-meta-code error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return json({ error: message }, 500);
  }
});
