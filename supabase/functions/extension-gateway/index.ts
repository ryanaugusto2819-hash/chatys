import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-extension-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const onlyDigits = (v: string) => (v || "").replace(/\D/g, "");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const token =
      req.headers.get("x-extension-token") ||
      new URL(req.url).searchParams.get("token") ||
      "";

    if (!token) return json({ error: "missing token" }, 401);

    const { data: device } = await supabase
      .from("extension_devices")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (!device) return json({ error: "invalid token" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = body.action || "poll";

    // Always refresh presence
    await supabase
      .from("extension_devices")
      .update({
        status: "online",
        last_seen_at: new Date().toISOString(),
        ...(body.phone ? { phone_number: onlyDigits(String(body.phone)) } : {}),
      })
      .eq("id", device.id);

    if (action === "hello") {
      return json({ ok: true, device: { id: device.id, name: device.name } });
    }

    if (action === "poll") {
      const { data: commands, error: commandsError } = await supabase
        .from("extension_commands")
        .select("*")
        .eq("device_id", device.id)
        .in("status", ["pending", "delivered"])
        .order("created_at", { ascending: true })
        .limit(1);

      if (commandsError) throw commandsError;

      const list = commands || [];
      const pendingIds = list.filter((c: any) => c.status === "pending").map((c: any) => c.id);
      if (pendingIds.length > 0) {
        await supabase
          .from("extension_commands")
          .update({ status: "delivered", delivered_at: new Date().toISOString() })
          .in("id", pendingIds);
      }

      return json({
        ok: true,
        commands: list.map((c: any) => ({
          id: c.id,
          type: c.command_type,
          payload: c.payload,
        })),
      });
    }

    if (action === "ack") {
      const { commandId, success, result, error, providerMessageId } = body;
      if (!commandId) return json({ error: "commandId required" }, 400);

      const { data: cmd } = await supabase
        .from("extension_commands")
        .select("*")
        .eq("id", commandId)
        .eq("device_id", device.id)
        .maybeSingle();

      if (!cmd) return json({ error: "command not found" }, 404);

      await supabase
        .from("extension_commands")
        .update({
          status: success ? "done" : "failed",
          result: result ?? null,
          error: success ? null : String(error || "erro desconhecido"),
          completed_at: new Date().toISOString(),
        })
        .eq("id", cmd.id);

      if (cmd.message_id) {
        await supabase
          .from("messages")
          .update({
            status: success ? "sent" : "failed",
            provider_status: success ? "sent" : "failed",
            provider_error: success ? null : String(error || "Falha na extensão"),
            ...(providerMessageId ? { provider_message_id: String(providerMessageId) } : {}),
          })
          .eq("id", cmd.message_id);
      }

      return json({ ok: true });
    }

    if (action === "inbound") {
      const phone = onlyDigits(String(body.from || ""));
      if (!phone) return json({ error: "from required" }, 400);
      if (String(body.from || "").includes("@g.us")) return json({ ok: true, ignored: "group" });

      // Find the connection tied to this device (if any)
      const { data: conn } = await supabase
        .from("connection_configs")
        .select("id")
        .eq("connection_id", "extension")
        .contains("config", { device_id: device.id })
        .maybeSingle();

      let { data: conversation } = await supabase
        .from("conversations")
        .select("id")
        .eq("contact_phone", phone)
        .eq("workspace_id", device.workspace_id)
        .maybeSingle();

      if (!conversation) {
        const { data: created, error: convErr } = await supabase
          .from("conversations")
          .insert({
            contact_phone: phone,
            contact_name: body.name || phone,
            workspace_id: device.workspace_id,
            connection_config_id: conn?.id ?? null,
            status: "open",
          })
          .select("id")
          .single();
        if (convErr) throw convErr;
        conversation = created;
      }

      if (body.providerMessageId) {
        const { data: dup } = await supabase
          .from("messages")
          .select("id")
          .eq("provider_message_id", String(body.providerMessageId))
          .maybeSingle();
        if (dup) return json({ ok: true, duplicated: true });
      }

      const { data: msg, error: msgErr } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversation!.id,
          content: body.text || "",
          message_type: body.messageType || "text",
          media_url: body.mediaUrl || null,
          sender_type: "customer",
          status: "received",
          provider_message_id: body.providerMessageId ? String(body.providerMessageId) : null,
        })
        .select("id")
        .single();

      if (msgErr) throw msgErr;

      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversation!.id);

      return json({ ok: true, messageId: msg.id, conversationId: conversation!.id });
    }

    return json({ error: `unknown action: ${action}` }, 400);
  } catch (e) {
    console.error("extension-gateway error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
