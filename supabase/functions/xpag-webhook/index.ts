import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const WebhookSchema = z.object({
  type: z.literal("cashin"),
  status: z.string().min(1).max(40),
  amount: z.coerce.number().positive(),
  fee: z.coerce.number().nonnegative().optional(),
  request_number: z.string().min(1).max(255),
  transaction_id: z.string().min(1).max(255),
  external_id: z.string().min(1).max(255),
  e2e: z.string().max(255).optional(),
  provider: z.string().max(80).optional(),
}).passthrough();

const safeEqual = (a: string, b: string) => {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let result = 0;
  for (let i = 0; i < aBytes.length; i += 1) result |= aBytes[i] ^ bBytes[i];
  return result === 0;
};

type ChargeRecord = { id: string; status: string; conversation_id: string; workspace_id: string };

const applyPaidTag = async (service: any, charge: ChargeRecord) => {
  const { data: conversation, error: conversationError } = await service
    .from("conversations")
    .select("contact_phone")
    .eq("id", charge.conversation_id)
    .maybeSingle();
  if (conversationError || !conversation?.contact_phone) throw new Error(conversationError?.message || "Conversa da cobrança não encontrada");

  const { data: tags, error: tagsError } = await service
    .from("tags")
    .select("id, name")
    .eq("workspace_id", charge.workspace_id)
    .in("name", ["OXXO", "PAGO"]);
  if (tagsError) throw new Error(tagsError.message);

  const oxxoTagId = tags?.find((tag) => tag.name.toUpperCase() === "OXXO")?.id;
  let paidTagId = tags?.find((tag) => tag.name.toUpperCase() === "PAGO")?.id;
  if (!paidTagId) {
    const { data: createdTag, error: createTagError } = await service
      .from("tags")
      .insert({ workspace_id: charge.workspace_id, name: "PAGO", color: "#22c55e" })
      .select("id")
      .single();
    if (createTagError || !createdTag) throw new Error(createTagError?.message || "Falha ao criar etiqueta PAGO");
    paidTagId = createdTag.id;
  }

  if (oxxoTagId) {
    const { error: removeError } = await service.from("contact_tags").delete()
      .eq("workspace_id", charge.workspace_id)
      .eq("contact_phone", conversation.contact_phone)
      .eq("tag_id", oxxoTagId);
    if (removeError) throw new Error(removeError.message);
  }

  const { error: paidError } = await service.from("contact_tags").upsert({
    workspace_id: charge.workspace_id,
    contact_phone: conversation.contact_phone,
    tag_id: paidTagId,
  }, { onConflict: "contact_phone,tag_id", ignoreDuplicates: true });
  if (paidError) throw new Error(paidError.message);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Método não permitido" }, 405);

  const expectedKey = Deno.env.get("XPAG_WEBHOOK_KEY") ?? "";
  const receivedKey = new URL(req.url).searchParams.get("key") ?? "";
  if (!expectedKey || !safeEqual(receivedKey, expectedKey)) return json({ success: false, error: "Webhook não autorizado" }, 401);

  try {
    const parsed = WebhookSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ success: false, error: "Payload inválido", fields: parsed.error.flatten().fieldErrors }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ success: false, error: "Backend não configurado" }, 500);
    const service = createClient(supabaseUrl, serviceKey);
    const payload = parsed.data;

    let charge: ChargeRecord | null = null;
    for (const [column, value] of [
      ["external_id", payload.external_id],
      ["transaction_id", payload.transaction_id],
      ["request_number", payload.request_number],
    ] as const) {
      const { data, error } = await service.from("oxxo_charges").select("id, status, conversation_id, workspace_id").eq(column, value).maybeSingle();
      if (error) return json({ success: false, error: "Falha ao localizar cobrança", details: error.message }, 500);
      if (data) { charge = data; break; }
    }
    if (!charge) return json({ success: false, error: "Cobrança não encontrada" }, 404);
    if (payload.status !== "confirmed") return json({ success: true, ignored: true, status: payload.status });

    if (charge.status === "confirmed") {
      await applyPaidTag(service, charge);
      return json({ success: true, duplicate: true, tag: "PAGO" });
    }

    const { error: updateError } = await service.from("oxxo_charges").update({
      status: "confirmed",
      amount: payload.amount,
      fee: payload.fee ?? null,
      request_number: payload.request_number,
      transaction_id: payload.transaction_id,
      provider: payload.provider || "XPag",
      confirmed_at: new Date().toISOString(),
      provider_response: payload,
      error_code: null,
      error_message: null,
    }).eq("id", charge.id);
    if (updateError) return json({ success: false, error: "Falha ao confirmar cobrança", details: updateError.message }, 500);
    await applyPaidTag(service, charge);

    return json({ success: true, confirmed: true, tag: "PAGO" });
  } catch (error) {
    return json({ success: false, error: "Erro inesperado no webhook", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});
