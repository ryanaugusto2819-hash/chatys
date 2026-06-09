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
    const event: string = payload?.event ?? payload?.type ?? "";
    const instanceName: string =
      payload?.instance ?? payload?.instanceName ?? payload?.instance_name ?? null;

    // 1. Save raw event
    await supabase.from("evolution_webhook_events").insert({
      instance_name: instanceName,
      event,
      raw_payload: payload,
    });

    // 2. If it's a message event, save to whatsapp_messages
    const data = payload?.data ?? payload?.message ?? payload;
    const normalizedEvent = String(event).toLowerCase();
    const isMessageEvent =
      normalizedEvent.includes("message") || normalizedEvent === "messages.upsert";

    if (isMessageEvent && data) {
      const key = data?.key ?? {};
      const msg = data?.message ?? {};
      const remoteJid: string | null = key?.remoteJid ?? data?.remoteJid ?? null;
      const fromMe: boolean = Boolean(key?.fromMe ?? data?.fromMe ?? false);
      const pushName: string | null = data?.pushName ?? data?.pushname ?? null;
      const messageText: string | null =
        msg?.conversation ??
        msg?.extendedTextMessage?.text ??
        msg?.imageMessage?.caption ??
        msg?.videoMessage?.caption ??
        data?.text ??
        null;

      // Only persist incoming (not from me) messages, but keep the rule loose:
      // requirement says "mensagem recebida" — store when not from me.
      if (!fromMe) {
        await supabase.from("whatsapp_messages").insert({
          instance_name: instanceName,
          event,
          remote_jid: remoteJid,
          push_name: pushName,
          message_text: messageText,
          from_me: fromMe,
          raw_payload: payload,
        });
      }
    }

    return json({ success: true });
  } catch (err) {
    console.error("evolution-webhook error:", err);
    return json({ success: false, error: String(err) }, 500);
  }
});
