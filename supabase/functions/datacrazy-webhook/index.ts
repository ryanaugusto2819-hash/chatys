import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const BodySchema = z.object({
  amount: z.coerce.number().min(10).max(10000),
  phone: z.union([z.string(), z.number()]).transform((value) => String(value).replace(/\D/g, "")),
}).refine((value) => value.phone.length >= 8 && value.phone.length <= 20, {
  path: ["phone"],
  message: "Telefone inválido",
});

type ConversationMatch = {
  id: string;
  workspace_id: string;
  contact_name: string;
  contact_phone: string;
};

type ExistingCharge = {
  id: string;
  external_id: string;
  request_number: string | null;
  transaction_id: string | null;
  status: string;
  amount: number;
  reference: string | null;
  barcode_url: string | null;
};

const chargeResponse = (charge: ExistingCharge, duplicate = false) => ({
  success: true,
  duplicate,
  amount: Number(charge.amount),
  currency: "MXN",
  status: charge.status,
  barcode_url: charge.barcode_url,
  reference: charge.reference,
  charge_id: charge.id,
  external_id: charge.external_id,
  request_number: charge.request_number,
  transaction_id: charge.transaction_id,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const rawPayload: unknown = await req.json().catch(() => null);
    console.log("[datacrazy-webhook] Payload received:", JSON.stringify(rawPayload));

    const parsed = BodySchema.safeParse(rawPayload);
    if (!parsed.success) {
      return json({
        success: false,
        error: "Invalid payload. Send amount between 10 and 10000 MXN and a valid phone.",
        fields: parsed.error.flatten().fieldErrors,
      }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const clientId = Deno.env.get("XPAG_CLIENT_ID");
    const clientSecret = Deno.env.get("XPAG_CLIENT_SECRET");
    const webhookKey = Deno.env.get("XPAG_WEBHOOK_KEY");
    if (!supabaseUrl || !serviceKey) return json({ success: false, error: "Backend not configured" }, 500);
    if (!clientId || !clientSecret || !webhookKey) return json({ success: false, error: "XPag credentials not configured" }, 503);

    const service = createClient(supabaseUrl, serviceKey);
    const { amount, phone } = parsed.data;
    const { data: matches, error: findError } = await service.rpc("find_latest_conversation_by_phone", {
      p_phone: phone,
    });
    if (findError) return json({ success: false, error: "Failed to locate lead", details: findError.message }, 500);

    const conversation = (matches?.[0] ?? null) as ConversationMatch | null;
    if (!conversation) return json({ success: false, error: "Lead conversation not found", phone }, 404);

    const duplicateSince = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: recentCharge, error: recentError } = await service
      .from("oxxo_charges")
      .select("id, external_id, request_number, transaction_id, status, amount, reference, barcode_url")
      .eq("conversation_id", conversation.id)
      .eq("amount", amount)
      .in("status", ["creating", "pending", "confirmed"])
      .gte("created_at", duplicateSince)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentError) return json({ success: false, error: "Failed checking duplicate charge", details: recentError.message }, 500);
    if (recentCharge?.barcode_url && recentCharge.reference) {
      console.log("[datacrazy-webhook] Reused recent charge:", recentCharge.id);
      return json(chargeResponse(recentCharge as ExistingCharge, true));
    }

    const externalId = `DATACRAZY-OXXO-${crypto.randomUUID()}`;
    const { data: charge, error: insertError } = await service.from("oxxo_charges").insert({
      workspace_id: conversation.workspace_id,
      conversation_id: conversation.id,
      external_id: externalId,
      amount,
      payer_name: conversation.contact_name || null,
      status: "creating",
    }).select("id").single();
    if (insertError || !charge) {
      return json({ success: false, error: "Failed to start OXXO charge", details: insertError?.message }, 500);
    }

    const apiUrl = (Deno.env.get("XPAG_API_URL") || "https://api.xpag.global").replace(/\/+$/, "");
    const webhookUrl = `${supabaseUrl}/functions/v1/xpag-webhook?key=${encodeURIComponent(webhookKey)}`;
    let response: Response;
    let responseText = "";
    try {
      response = await fetch(`${apiUrl}/cashin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Id": clientId,
          "X-Client-Secret": clientSecret,
        },
        body: JSON.stringify({
          currency: "MXN",
          method: "OXXO",
          amount,
          payerData: conversation.contact_name ? { name: conversation.contact_name } : {},
          external_id: externalId,
          webhook_url: webhookUrl,
          generateCheckout: false,
        }),
        signal: AbortSignal.timeout(25000),
      });
      responseText = await response.text();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await service.from("oxxo_charges").update({ status: "failed", error_message: message }).eq("id", charge.id);
      return json({ success: false, error: "Failed to connect to XPag", details: message }, 502);
    }

    let providerData: Record<string, unknown> = {};
    try {
      providerData = responseText ? JSON.parse(responseText) : {};
    } catch {
      providerData = { raw: responseText.slice(0, 4000) };
    }

    if (!response.ok || providerData.ok === false) {
      const code = String(providerData.code ?? providerData.error_code ?? "xpag_error");
      const message = String(providerData.message ?? providerData.error ?? `XPag returned HTTP ${response.status}`);
      await service.from("oxxo_charges").update({
        status: "failed",
        error_code: code,
        error_message: message,
        provider_response: providerData,
      }).eq("id", charge.id);
      return json({ success: false, error: message, code, provider_status: response.status }, response.status >= 400 ? response.status : 502);
    }

    const payeeData = (providerData.payee_data ?? {}) as Record<string, unknown>;
    const requestNumber = String(providerData.request_number ?? "");
    const transactionId = String(providerData.transaction_id ?? "");
    const reference = String(payeeData.reference ?? "");
    const barcodeUrl = String(payeeData.barcode ?? "");
    if (!requestNumber || !transactionId || !reference || !barcodeUrl) {
      await service.from("oxxo_charges").update({
        status: "failed",
        error_code: "invalid_provider_response",
        error_message: "XPag response missing voucher data",
        provider_response: providerData,
      }).eq("id", charge.id);
      return json({ success: false, error: "XPag did not return complete voucher data" }, 502);
    }

    const { data: updated, error: updateError } = await service.from("oxxo_charges").update({
      status: String(providerData.status ?? "pending") === "confirmed" ? "confirmed" : "pending",
      fee: Number(providerData.fee ?? 0),
      request_number: requestNumber,
      transaction_id: transactionId,
      reference,
      barcode_url: barcodeUrl,
      provider_response: providerData,
    }).eq("id", charge.id)
      .select("id, external_id, request_number, transaction_id, status, amount, reference, barcode_url")
      .single();
    if (updateError || !updated) {
      return json({ success: false, error: "Voucher created but could not be saved", details: updateError?.message }, 500);
    }

    console.log("[datacrazy-webhook] OXXO voucher created:", updated.id);
    return json(chargeResponse(updated as ExistingCharge));
  } catch (error) {
    console.error("[datacrazy-webhook] Unexpected error:", error instanceof Error ? error.message : String(error));
    return json({ success: false, error: "Unexpected error generating OXXO voucher" }, 500);
  }
});