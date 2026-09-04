import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const {
      conversationId,
      message,
      mediaUrl,
      type,
      senderAgentId,
      senderLabel,
      deviceId: forcedDeviceId,
      action,
    } = await req.json();

    if (!conversationId) return json({ error: "conversationId obrigatório" }, 400);

    const { data: conversation, error: convErr } = await supabase
      .from("conversations")
      .select("id, contact_phone, workspace_id, connection_config_id")
      .eq("id", conversationId)
      .single();

    if (convErr || !conversation) return json({ error: "Conversa não encontrada" }, 404);

    // Resolve which device should execute the command
    let deviceId: string | null = forcedDeviceId || null;

    if (!deviceId && conversation.connection_config_id) {
      const { data: conn } = await supabase
        .from("connection_configs")
        .select("connection_id, config")
        .eq("id", conversation.connection_config_id)
        .maybeSingle();
      const cfg = (conn?.config || {}) as Record<string, string>;
      if (conn?.connection_id === "extension" && cfg.device_id) deviceId = cfg.device_id;
    }

    if (!deviceId) {
      const { data: devices } = await supabase
        .from("extension_devices")
        .select("id, status, last_seen_at")
        .eq("workspace_id", conversation.workspace_id)
        .order("last_seen_at", { ascending: false, nullsFirst: false })
        .limit(1);
      deviceId = devices?.[0]?.id ?? null;
    }

    if (!deviceId) {
      return json(
        { error: "Nenhum computador com a extensão está vinculado a esta conversa." },
        400,
      );
    }

    const { data: device } = await supabase
      .from("extension_devices")
      .select("*")
      .eq("id", deviceId)
      .maybeSingle();

    if (!device) return json({ error: "Aparelho da extensão não encontrado" }, 404);

    const online =
      device.last_seen_at && Date.now() - new Date(device.last_seen_at).getTime() < 60_000;

    // Non-message actions (typing / read receipts) don't create a message row
    if (action === "mark_read" || action === "typing") {
      const { data: cmd, error: cmdErr } = await supabase
        .from("extension_commands")
        .insert({
          workspace_id: conversation.workspace_id,
          device_id: device.id,
          conversation_id: conversation.id,
          command_type: action,
          payload: { phone: conversation.contact_phone, durationMs: 2500 },
        })
        .select()
        .single();
      if (cmdErr) throw cmdErr;
      return json({ success: true, commandId: cmd.id, online });
    }

    const messageType = mediaUrl ? type || "image" : "text";

    const { data: savedMessage, error: msgErr } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversation.id,
        content: message || "",
        message_type: messageType,
        media_url: mediaUrl || null,
        sender_type: "agent",
        sender_agent_id: senderAgentId || null,
        sender_label: senderLabel || "humano",
        status: "pending",
        provider_status: "queued",
      })
      .select()
      .single();

    if (msgErr) throw msgErr;

    const { data: cmd, error: cmdErr } = await supabase
      .from("extension_commands")
      .insert({
        workspace_id: conversation.workspace_id,
        device_id: device.id,
        conversation_id: conversation.id,
        message_id: savedMessage.id,
        command_type: mediaUrl ? "send_media" : "send_text",
        payload: {
          phone: conversation.contact_phone,
          text: message || "",
          mediaUrl: mediaUrl || null,
          mediaType: messageType,
        },
      })
      .select()
      .single();

    if (cmdErr) throw cmdErr;

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

    return json({
      success: true,
      savedMessage,
      commandId: cmd.id,
      online,
      warning: online ? null : "A extensão deste computador está offline no momento.",
    });
  } catch (e) {
    console.error("extension-send error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
