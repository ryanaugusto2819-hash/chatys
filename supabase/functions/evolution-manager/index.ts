import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const EVO_URL = (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/+$/, "");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
const WEBHOOK_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/evolution-webhook`;

async function evo(path: string, method = "GET", body?: any) {
  const res = await fetch(`${EVO_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", apikey: EVO_KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let data: any = txt;
  try { data = JSON.parse(txt); } catch {}
  return { ok: res.ok, status: res.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!EVO_URL || !EVO_KEY) {
    return json({ error: "Evolution server not configured (EVOLUTION_API_URL/EVOLUTION_API_KEY)" }, 500);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const token = authHeader.replace("Bearer ", "");
  const supaUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: claims } = await supaUser.auth.getClaims(token);
  if (!claims?.claims) return json({ error: "Unauthorized" }, 401);

  let body: any = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch {}
  }
  const action = body.action || new URL(req.url).searchParams.get("action");
  const instanceName: string = body.instanceName || "";
  const workspaceId: string | null = body.workspaceId || null;

  try {
    switch (action) {
      case "list": {
        const r = await evo(`/instance/fetchInstances`, "GET");
        if (!r.ok) return json({ error: "Failed to fetch instances", detail: r.data }, r.status);
        return json({ instances: r.data });
      }

      case "create": {
        if (!instanceName) return json({ error: "instanceName required" }, 400);
        const r = await evo(`/instance/create`, "POST", {
          instanceName,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
          // Pull full chat history once the device pairs
          syncFullHistory: true,
          alwaysOnline: false,
          webhook: {
            url: WEBHOOK_URL,
            byEvents: false,
            base64: true,
            events: [
              "MESSAGES_UPSERT",
              "MESSAGES_UPDATE",
              "MESSAGES_SET",
              "CHATS_SET",
              "CONNECTION_UPDATE",
              "QRCODE_UPDATED",
              "SEND_MESSAGE",
            ],
          },
        });
        if (!r.ok) return json({ error: "Failed to create", detail: r.data }, r.status);

        // Best-effort webhook set (in case create payload didn't take it)
        await evo(`/webhook/set/${instanceName}`, "POST", {
          webhook: {
            enabled: true,
            url: WEBHOOK_URL,
            byEvents: false,
            base64: true,
            events: [
              "MESSAGES_UPSERT",
              "MESSAGES_UPDATE",
              "MESSAGES_SET",
              "CHATS_SET",
              "CONNECTION_UPDATE",
              "QRCODE_UPDATED",
              "SEND_MESSAGE",
            ],
          },
        }).catch(() => {});

        const apiKey = r.data?.hash?.apikey || r.data?.hash || EVO_KEY;
        const qrcode = r.data?.qrcode?.base64 || r.data?.qrcode?.code || null;

        // Persist as connection_config (so existing send/webhook pipeline works)
        const { data: inserted, error: insErr } = await supabase
          .from("connection_configs")
          .insert({
            connection_id: "evolution",
            label: instanceName,
            config: {
              server_url: EVO_URL,
              instance_name: instanceName,
              api_key: typeof apiKey === "string" ? apiKey : EVO_KEY,
              phone_number: null,
            },
            is_connected: false,
            status: "qr_required",
            workspace_id: workspaceId,
          })
          .select()
          .single();

        if (insErr) console.error("save connection error:", insErr);

        return json({ success: true, instance: r.data, qrcode, connection: inserted });
      }

      case "qr": {
        if (!instanceName) return json({ error: "instanceName required" }, 400);
        const r = await evo(`/instance/connect/${instanceName}`, "GET");
        if (!r.ok) return json({ error: "Failed to get QR", detail: r.data }, r.status);
        const qrcode = r.data?.base64 || r.data?.qrcode?.base64 || r.data?.code || null;
        return json({ qrcode, raw: r.data });
      }

      case "status": {
        if (!instanceName) return json({ error: "instanceName required" }, 400);
        const r = await evo(`/instance/connectionState/${instanceName}`, "GET");
        if (!r.ok) return json({ error: "Failed to get status", detail: r.data }, r.status);
        const state = r.data?.instance?.state || r.data?.state || "unknown";

        // Sync to connection_configs
        await supabase
          .from("connection_configs")
          .update({
            is_connected: state === "open",
            status: state,
            last_checked_at: new Date().toISOString(),
          })
          .eq("connection_id", "evolution")
          .eq("config->>instance_name", instanceName);

        return json({ state, raw: r.data });
      }

      case "delete": {
        if (!instanceName) return json({ error: "instanceName required" }, 400);
        // Try logout first (ignore errors), then delete
        await evo(`/instance/logout/${instanceName}`, "DELETE").catch(() => {});
        const r = await evo(`/instance/delete/${instanceName}`, "DELETE");

        // Remove local record regardless of remote outcome
        await supabase
          .from("connection_configs")
          .delete()
          .eq("connection_id", "evolution")
          .eq("config->>instance_name", instanceName);

        // Treat "doesn't exist" on Evolution as success (local row already removed)
        const bodyStr = typeof r.data === "string" ? r.data : JSON.stringify(r.data || {});
        const notFound =
          r.status === 404 ||
          r.status === 400 ||
          /does not exist|not found/i.test(bodyStr);

        if (r.ok || notFound) {
          return json({ success: true, alreadyGone: !r.ok });
        }
        return json({ error: "Failed to delete on Evolution (local removed)", detail: r.data }, r.status);
      }



      case "set_webhook": {
        if (!instanceName) return json({ error: "instanceName required" }, 400);
        const r = await evo(`/webhook/set/${instanceName}`, "POST", {
          webhook: {
            enabled: true,
            url: WEBHOOK_URL,
            byEvents: false,
            base64: true,
            events: [
              "MESSAGES_UPSERT",
              "MESSAGES_UPDATE",
              "CONNECTION_UPDATE",
              "QRCODE_UPDATED",
              "SEND_MESSAGE",
            ],
          },
        });
        if (!r.ok) return json({ error: "Failed to set webhook", detail: r.data }, r.status);
        return json({ success: true, raw: r.data });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    console.error("evolution-manager error:", err);
    return json({ error: String(err) }, 500);
  }
});
