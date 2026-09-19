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

    let charge: { id: string; status: string } | null = null;
    for (const [column, value] of [
      ["external_id", payload.external_id],
      ["transaction_id", payload.transaction_id],
      ["request_number", payload.request_number],
    ] as const) {
      const { data, error } = await service.from("oxxo_charges").select("id, status").eq(column, value).maybeSingle();
      if (error) return json({ success: false, error: "Falha ao localizar cobrança", details: error.message }, 500);
      if (data) { charge = data; break; }
    }
    if (!charge) return json({ success: false, error: "Cobrança não encontrada" }, 404);
    if (charge.status === "confirmed") return json({ success: true, duplicate: true });
    if (payload.status !== "confirmed") return json({ success: true, ignored: true, status: payload.status });

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

    return json({ success: true, confirmed: true });
  } catch (error) {
    return json({ success: false, error: "Erro inesperado no webhook", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});
