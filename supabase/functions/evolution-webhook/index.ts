import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return json({ status: "ok", provider: "evolution-webhook" });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ success: false, error: "Invalid JSON body" }, 400);
  }

  try {
    const event: string =
      payload?.event ?? payload?.type ?? payload?.eventName ?? "unknown";
    const instanceName: string | null =
      payload?.instance ?? payload?.instanceName ?? payload?.instance_name ?? null;

    const data = payload?.data ?? payload?.message ?? payload;
    const key = data?.key ?? {};
    const msg = data?.message ?? {};

    const remoteJid: string | null =
      key?.remoteJid ?? data?.remoteJid ?? data?.from ?? null;
    const pushName: string | null =
      data?.pushName ?? data?.pushname ?? data?.notifyName ?? null;
    const messageText: string | null =
      msg?.conversation ??
      msg?.extendedTextMessage?.text ??
      msg?.imageMessage?.caption ??
      msg?.videoMessage?.caption ??
      msg?.documentMessage?.caption ??
      data?.text ??
      data?.body ??
      null;

    const { error } = await supabase.from("evolution_webhook_events").insert({
      event,
      instance_name: instanceName,
      remote_jid: remoteJid,
      push_name: pushName,
      message_text: messageText,
      raw_payload: payload,
    });

    if (error) {
      console.error("insert error:", error);
      return json({ success: false, error: error.message }, 500);
    }

    return json({ success: true });
  } catch (err) {
    console.error("evolution-webhook error:", err);
    return json({ success: false, error: String(err) }, 500);
  }
});
