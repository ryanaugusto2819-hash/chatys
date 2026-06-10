import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { conversationId, amount, currency, note } = await req.json();
    if (!conversationId || amount === undefined || amount === null) {
      return new Response(JSON.stringify({ success: false, error: "conversationId and amount are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: conv, error: cErr } = await supabase
      .from("conversations")
      .select("id, contact_name, contact_phone, ctwa_clid, source_id, ad_title, workspace_id, created_at")
      .eq("id", conversationId)
      .maybeSingle();

    if (cErr || !conv) {
      return new Response(JSON.stringify({ success: false, error: "Conversation not found", detail: cErr?.message }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settings } = await supabase
      .from("workspace_settings")
      .select("ads_order_webhook_url")
      .eq("workspace_id", conv.workspace_id)
      .maybeSingle();

    const webhookUrl = String((settings as any)?.ads_order_webhook_url || "").trim();
    if (!webhookUrl) {
      return new Response(JSON.stringify({
        success: false,
        code: "missing_ads_order_webhook_url",
        error: "Webhook de pedidos não configurado. Vá em Configurações → Workspace.",
        diagnostics: {
          workspace_id: conv.workspace_id,
          setting: "ads_order_webhook_url",
        },
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsedWebhookUrl: URL;
    try {
      parsedWebhookUrl = new URL(webhookUrl);
      if (!["http:", "https:"].includes(parsedWebhookUrl.protocol)) throw new Error("invalid protocol");
    } catch (_) {
      return new Response(JSON.stringify({
        success: false,
        code: "invalid_ads_order_webhook_url",
        error: "Webhook de pedidos inválido. Revise a URL em Configurações → Workspace.",
        diagnostics: { workspace_id: conv.workspace_id },
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const campaignName = conv.ad_title ? String(conv.ad_title).split("›")[0].trim() : null;

    // Flat payload format expected by external systems (e.g. webhookSales)
    const payload = {
      campaign: campaignName,
      creative: conv.ad_title || null,
      country: "BR",
      revenue: Number(amount),
      currency: currency || "BRL",
      date: new Date().toISOString().slice(0, 10),
      phone: conv.contact_phone,
      contact_name: conv.contact_name,
      ctwa_clid: conv.ctwa_clid || null,
      source_id: conv.source_id || null,
      ad_title: conv.ad_title || null,
      note: note || null,
      conversation_id: conv.id,
      conversation_started_at: conv.created_at,
      event: "ad_order.created",
      timestamp: new Date().toISOString(),
    };

    let status = 0;
    let body = "";
    try {
      const res = await fetch(parsedWebhookUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      status = res.status;
      body = await res.text();
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: "Falha ao chamar webhook", detail: String(err) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark sale registered (stops AI per project rules)
    await supabase.from("conversations").update({ sale_registered_at: new Date().toISOString() }).eq("id", conv.id);

    // Best-effort log to webhook_logs
    try {
      await supabase.from("webhook_logs").insert({
        conversation_id: conv.id,
        url: webhookUrl,
        method: "POST",
        request_body: payload,
        response_status: status,
        response_body: body.slice(0, 2000),
      });
    } catch (_) { /* ignore */ }

    const ok = status >= 200 && status < 300;
    return new Response(JSON.stringify({ success: ok, status, response: body.slice(0, 500) }), {
      status: ok ? 200 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
