const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function tryFetchAd(sourceId: string, accessToken: string) {
  const url = `https://graph.facebook.com/v21.0/${sourceId}?fields=name,campaign{name},adset{name},status,creative{title,body}&access_token=${accessToken}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sourceId, conversationId } = await req.json();

    if (!sourceId) {
      return new Response(
        JSON.stringify({ success: false, error: "sourceId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenKeys = [
      "META_ADS_ACCESS_TOKEN",
      "META_ADS_ACCESS_TOKEN_2",
      "META_ADS_ACCESS_TOKEN_3",
      "META_ADS_ACCESS_TOKEN_4",
      "META_ADS_ACCESS_TOKEN_5",
      "META_ADS_ACCESS_TOKEN_6",
      "META_ADS_ACCESS_TOKEN_7",
    ];
    const tokens: string[] = [];
    for (const key of tokenKeys) {
      const val = Deno.env.get(key);
      if (val) tokens.push(val);
    }

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No Meta Ads access tokens configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let adData: any = null;
    for (let i = 0; i < tokens.length; i++) {
      console.log(`Trying token ${i + 1} of ${tokens.length}...`);
      adData = await tryFetchAd(sourceId, tokens[i]);
      if (adData?.name || adData?.campaign) {
        console.log(`Token ${i + 1} found the ad.`);
        break;
      }
      adData = null;
    }

    if (!adData) {
      console.error(`No token could resolve ad for sourceId: ${sourceId}`);
      return new Response(
        JSON.stringify({ success: false, error: "Ad not found with any configured token" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adName = adData.name || null;
    const campaignName = adData.campaign?.name || null;
    const adsetName = adData.adset?.name || null;
    const parts = [campaignName, adsetName, adName].filter(Boolean);
    const adTitle = parts.length > 0 ? parts.join(" › ") : null;

    if (conversationId && adTitle) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const updateRes = await fetch(
        `${supabaseUrl}/rest/v1/conversations?id=eq.${conversationId}`,
        {
          method: "PATCH",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ ad_title: adTitle }),
        }
      );
      if (!updateRes.ok) {
        console.error(`Failed to update conversation: ${await updateRes.text()}`);
      } else {
        console.log(`Updated conversation ${conversationId} with ad_title: ${adTitle}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, adName, campaignName, adsetName, adTitle, raw: adData }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("meta-ad-lookup error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
