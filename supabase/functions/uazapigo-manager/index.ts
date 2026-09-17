import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.25.76";

const BodySchema = z.object({
  configId: z.string().uuid(),
  action: z.enum(["status", "connect", "disconnect", "delete", "set_webhook"]),
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Não autorizado" }, 401);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await userClient.auth.getClaims(authHeader.slice(7));
    if (!claims?.claims) return json({ error: "Não autorizado" }, 401);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: connection } = await service.from("connection_configs").select("id, connection_id, config").eq("id", parsed.data.configId).single();
    if (connection?.connection_id !== "uazapigo") return json({ error: "Conexão uazapiGO não encontrada" }, 404);
    const config = (connection.config || {}) as Record<string, unknown>;
    const serverUrl = String(config.server_url || "").replace(/\/+$/, "");
    const token = String(config.token || "");
    if (!serverUrl || !token) return json({ error: "URL ou token não configurado" }, 400);

    const actionPaths: Record<string, { path: string; method: string }> = {
      status: { path: "/instance/status", method: "GET" },
      connect: { path: "/instance/connect", method: "POST" },
      disconnect: { path: "/instance/disconnect", method: "POST" },
      delete: { path: "/instance", method: "DELETE" },
      set_webhook: { path: "/webhook/set", method: "POST" },
    };
    const target = actionPaths[parsed.data.action];
    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/uazapigo-webhook?configId=${encodeURIComponent(connection.id)}`;
    const response = await fetch(`${serverUrl}${target.path}`, {
      method: target.method,
      headers: { "Content-Type": "application/json", token },
      body: target.method === "GET" || target.method === "DELETE" ? undefined : JSON.stringify(
        parsed.data.action === "set_webhook"
          ? { url: webhookUrl, events: ["connection", "messages", "messages_update"], addUrlEvents: false, addUrlTypesMessages: false }
          : {},
      ),
    });
    const text = await response.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 800) }; }
    if (!response.ok || data?.error) return json({ error: data?.error || data?.message || `HTTP ${response.status}`, details: data }, response.status || 502);

    const state = String(data?.status ?? data?.state ?? data?.instance?.status ?? data?.instance?.state ?? "").toLowerCase();
    if (parsed.data.action === "status") {
      const connected = state === "connected" || state === "open";
      await service.from("connection_configs").update({ is_connected: connected, status: connected ? "active" : "error", last_checked_at: new Date().toISOString() }).eq("id", connection.id);
    }
    if (parsed.data.action === "set_webhook") {
      await service.from("connection_configs").update({ config: { ...config, webhook_url: webhookUrl }, updated_at: new Date().toISOString() }).eq("id", connection.id);
    }
    if (parsed.data.action === "disconnect") {
      await service.from("connection_configs").update({ is_connected: false, status: "error", last_checked_at: new Date().toISOString() }).eq("id", connection.id);
    }
    return json({ success: true, state, qrcode: data?.qrcode ?? data?.qrCode ?? data?.instance?.qrcode ?? null, data });
  } catch (error) {
    console.error("[uazapigo-manager]", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});