import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizePhone(phone: string): string {
  return (phone || "").replace(/\D/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { conversationId, pixelRefId, eventName = "Purchase", value, currency = "BRL" } = await req.json();

    if (!conversationId || !pixelRefId || value === undefined || value === null) {
      return new Response(JSON.stringify({
        success: false,
        error: "conversationId, pixelRefId and value are required",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load conversation
    const { data: conv, error: cErr } = await supabase
      .from("conversations")
      .select("id, contact_name, contact_phone, ctwa_clid, source_id, ad_title, workspace_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (cErr || !conv) {
      return new Response(JSON.stringify({ success: false, error: "Conversation not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!conv.ctwa_clid) {
      return new Response(JSON.stringify({
        success: false,
        code: "missing_ctwa_clid",
        error: "Este lead não tem CTWA ID (não veio de anúncio Click-to-WhatsApp). Evento não enviado.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load pixel
    const { data: pixel, error: pErr } = await supabase
      .from("meta_capi_pixels")
      .select("id, pixel_id, access_token, test_event_code, is_active, workspace_id")
      .eq("id", pixelRefId)
      .maybeSingle();

    if (pErr || !pixel) {
      return new Response(JSON.stringify({ success: false, error: "Pixel not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!pixel.is_active) {
      return new Response(JSON.stringify({ success: false, error: "Pixel is inactive" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (pixel.workspace_id !== conv.workspace_id) {
      return new Response(JSON.stringify({ success: false, error: "Pixel does not belong to this workspace" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build user_data with hashed PII
    const phone = normalizePhone(conv.contact_phone || "");
    const fullName = (conv.contact_name || "").trim();
    const [firstName, ...rest] = fullName.split(/\s+/);
    const lastName = rest.join(" ");

    const user_data: Record<string, any> = {
      ctwa_clid: conv.ctwa_clid,
    };
    if (phone) user_data.ph = [await sha256Hex(phone)];
    if (firstName) user_data.fn = [await sha256Hex(firstName)];
    if (lastName) user_data.ln = [await sha256Hex(lastName)];

    const event_id = `purchase_${conv.id}`;
    const event_time = Math.floor(Date.now() / 1000);

    const custom_data: Record<string, any> = {
      currency,
      value: Number(value),
    };

    const eventPayload: Record<string, any> = {
      event_name: eventName,
      event_time,
      event_id,
      action_source: "business_messaging",
      messaging_channel: "whatsapp",
      user_data,
      custom_data,
    };

    const body: Record<string, any> = { data: [eventPayload] };
    if (pixel.test_event_code) body.test_event_code = pixel.test_event_code;

    const url = `https://graph.facebook.com/v21.0/${pixel.pixel_id}/events?access_token=${encodeURIComponent(pixel.access_token)}`;

    let status = 0;
    let responseBody = "";
    let fetchError: string | null = null;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      status = res.status;
      responseBody = await res.text();
    } catch (err) {
      fetchError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }

    const ok = !fetchError && status >= 200 && status < 300;

    // Log
    try {
      await supabase.from("meta_capi_events").insert({
        workspace_id: conv.workspace_id,
        pixel_id_ref: pixel.id,
        pixel_id: pixel.pixel_id,
        conversation_id: conv.id,
        event_name: eventName,
        event_id,
        value: Number(value),
        currency,
        ctwa_clid: conv.ctwa_clid,
        request_payload: body,
        response_status: status,
        response_body: (fetchError ? `FETCH_ERROR: ${fetchError}` : responseBody).slice(0, 4000),
        success: ok,
        error: ok ? null : (fetchError || `HTTP ${status}`),
      });
    } catch (_) { /* ignore */ }

    return new Response(JSON.stringify({
      success: ok,
      status,
      event_id,
      response: responseBody.slice(0, 500),
      error: ok ? undefined : (fetchError || `Meta retornou HTTP ${status}: ${responseBody.slice(0, 200)}`),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
