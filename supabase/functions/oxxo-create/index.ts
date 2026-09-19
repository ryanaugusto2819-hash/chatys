import { createClient, corsHeaders } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const BodySchema = z.object({
  conversationId: z.string().uuid(),
  amount: z.coerce.number().min(10).max(10000),
  payerName: z.string().trim().max(150).optional().default(""),
  payerEmail: z.union([z.string().trim().email().max(255), z.literal("")]).optional().default(""),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Método não permitido" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ success: false, error: "Não autorizado" }, 401);

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json({ success: false, error: "Dados da cobrança inválidos", fields: parsed.error.flatten().fieldErrors }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const clientId = Deno.env.get("XPAG_CLIENT_ID");
    const clientSecret = Deno.env.get("XPAG_CLIENT_SECRET");
    const webhookKey = Deno.env.get("XPAG_WEBHOOK_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ success: false, error: "Backend não configurado" }, 500);
    if (!clientId || !clientSecret || !webhookKey) return json({ success: false, error: "Credenciais XPag ainda não configuradas" }, 503);

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.slice(7);
    const { data: claimsData, error: authError } = await userClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;
    if (authError || typeof userId !== "string") return json({ success: false, error: "Sessão inválida" }, 401);

    const service = createClient(supabaseUrl, serviceKey);
    const { conversationId, amount, payerName, payerEmail } = parsed.data;
    const { data: conversation, error: conversationError } = await service
      .from("conversations")
      .select("id, contact_name, workspace_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (conversationError || !conversation?.workspace_id) return json({ success: false, error: "Conversa não encontrada" }, 404);

    const { data: membership } = await service
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", conversation.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) return json({ success: false, error: "Sem acesso a esta conversa" }, 403);

    const externalId = `OXXO-${crypto.randomUUID()}`;
    const { data: charge, error: insertError } = await service.from("oxxo_charges").insert({
      workspace_id: conversation.workspace_id,
      conversation_id: conversation.id,
      created_by: userId,
      external_id: externalId,
      amount,
      payer_name: payerName || conversation.contact_name || null,
      payer_email: payerEmail || null,
      status: "creating",
    }).select("id").single();
    if (insertError || !charge) return json({ success: false, error: "Não foi possível iniciar a cobrança", details: insertError?.message }, 500);

    const webhookUrl = `${supabaseUrl}/functions/v1/xpag-webhook?key=${encodeURIComponent(webhookKey)}`;
    const payload = {
      currency: "MXN",
      method: "OXXO",
      amount,
      payerData: {
        ...(payerName ? { name: payerName } : {}),
        ...(payerEmail ? { email: payerEmail } : {}),
      },
      external_id: externalId,
      webhook_url: webhookUrl,
      generateCheckout: false,
    };

    let response: Response;
    let responseText = "";
    try {
      response = await fetch("https://api.xpag.global/cashin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Id": clientId,
          "X-Client-Secret": clientSecret,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(25000),
      });
      responseText = await response.text();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await service.from("oxxo_charges").update({ status: "failed", error_message: message }).eq("id", charge.id);
      return json({ success: false, error: "Falha ao conectar com a XPag", details: message }, 502);
    }

    let providerData: Record<string, unknown> = {};
    try { providerData = responseText ? JSON.parse(responseText) : {}; } catch { providerData = { raw: responseText.slice(0, 4000) }; }

    if (!response.ok || providerData.ok === false) {
      const code = String(providerData.code ?? providerData.error_code ?? "xpag_error");
      const message = String(providerData.message ?? providerData.error ?? `XPag retornou HTTP ${response.status}`);
      await service.from("oxxo_charges").update({
        status: "failed",
        error_code: code,
        error_message: message,
        provider_response: providerData,
      }).eq("id", charge.id);
      return json({ success: false, error: message, code, providerStatus: response.status }, response.status >= 400 ? response.status : 502);
    }

    const payeeData = (providerData.payee_data ?? {}) as Record<string, unknown>;
    const requestNumber = String(providerData.request_number ?? "");
    const transactionId = String(providerData.transaction_id ?? "");
    const reference = String(payeeData.reference ?? "");
    const barcodeUrl = String(payeeData.barcode ?? "");
    if (!requestNumber || !transactionId || !reference) {
      await service.from("oxxo_charges").update({ status: "failed", error_code: "invalid_provider_response", error_message: "Resposta da XPag sem os dados do voucher", provider_response: providerData }).eq("id", charge.id);
      return json({ success: false, error: "A XPag não retornou os dados completos do voucher" }, 502);
    }

    const { data: updated, error: updateError } = await service.from("oxxo_charges").update({
      status: String(providerData.status ?? "pending") === "confirmed" ? "confirmed" : "pending",
      fee: Number(providerData.fee ?? 0),
      request_number: requestNumber,
      transaction_id: transactionId,
      reference,
      barcode_url: barcodeUrl || null,
      provider_response: providerData,
    }).eq("id", charge.id).select("*").single();
    if (updateError) return json({ success: false, error: "Voucher criado, mas não foi possível salvá-lo", details: updateError.message }, 500);

    return json({ success: true, charge: updated });
  } catch (error) {
    return json({ success: false, error: "Erro inesperado ao gerar cobrança", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});
