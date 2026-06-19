import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const adTitle = conv.ad_title ? String(conv.ad_title) : "";
    const campaignName = adTitle ? adTitle.split("›")[0].trim() : null;
    // Creative = último segmento após o último "›" (ex.: "h1", "h2"); fallback para o título inteiro
    const creativeName = adTitle.includes("›")
      ? adTitle.split("›").pop()!.trim()
      : (adTitle || null);

    // Payload completo (mantém os campos esperados pelo webhookSales + metadados do lead)
    const payload = {
      // campos requeridos pelo webhookSales externo
      campaign: campaignName,
      creative: creativeName,
      country: "BR",
      revenue: Number(amount),
      date: new Date().toISOString().slice(0, 10),
      currency: currency || "BRL",
      // metadados do lead (compatibilidade com payload anterior)
      conversation_id: conv.id,
      contact_name: conv.contact_name,
      contact_phone: conv.contact_phone,
      phone: conv.contact_phone,
      ad_title: conv.ad_title,
      ctwa_clid: conv.ctwa_clid,
      source_id: conv.source_id,
      workspace_id: conv.workspace_id,
      note: note || null,
      amount: Number(amount),
      created_at: new Date().toISOString(),
    };

    let status = 0;
    let body = "";
    let fetchError: string | null = null;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(parsedWebhookUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      status = res.status;
      body = await res.text();
    } catch (err) {
      fetchError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    } finally {
      clearTimeout(timeoutId);
    }

    const ok = !fetchError && status >= 200 && status < 300;

    // Mark sale registered only on success
    if (ok) {
      await supabase.from("conversations").update({ sale_registered_at: new Date().toISOString() }).eq("id", conv.id);
    }

    // Best-effort log to webhook_logs
    try {
      await supabase.from("webhook_logs").insert({
        conversation_id: conv.id,
        contact_name: conv.contact_name || null,
        phone: conv.contact_phone || "unknown",
        status_key: "ads_order_webhook",
        payload: { url: webhookUrl, method: "POST", request_body: payload },
        result: { status, response_body: (fetchError ? `FETCH_ERROR: ${fetchError}` : body).slice(0, 2000) },
        success: ok,
        mapping_found: true,
        error: ok ? null : (fetchError || `HTTP ${status}`),
      });
    } catch (_) { /* ignore */ }

    // Always return 200 so frontend gets the diagnostic instead of a generic fetch error
    return new Response(JSON.stringify({
      success: ok,
      status,
      response: body.slice(0, 500),
      error: ok ? undefined : (fetchError ? `Falha ao chamar webhook externo (${fetchError})` : `Webhook externo retornou status ${status}`),
      payload_sent: payload,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
