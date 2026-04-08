import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function tryFetchAd(sourceId: string, accessToken: string) {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${sourceId}?fields=name,campaign{name},adset{name},status,creative{title,body}&access_token=${accessToken}`
  );
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

    // Collect all available tokens
    const tokens: string[] = [];
    const t1 = Deno.env.get("META_ADS_ACCESS_TOKEN");
    const t2 = Deno.env.get("META_ADS_ACCESS_TOKEN_2");
    const t3 = Deno.env.get("META_ADS_ACCESS_TOKEN_3");
    const t4 = Deno.env.get("META_ADS_ACCESS_TOKEN_4");
    if (t1) tokens.push(t1);
    if (t2) tokens.push(t2);
    if (t3) tokens.push(t3);
    if (t4) tokens.push(t4);

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No Meta Ads access tokens configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try each token until one returns data
    let adData = null;
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
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await supabase
        .from("conversations")
        .update({ ad_title: adTitle })
        .eq("id", conversationId);
      console.log(`Updated conversation ${conversationId} with ad_title: ${adTitle}`);
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
