import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const EVO_URL = (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/+$/, "");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";

// Considera "zumbi" quando não há evento há mais de X minutos
const STALE_MINUTES = 30;
// Só reinicia se houve tráfego global recente (evita reinício quando ninguém enviou)
const GLOBAL_ACTIVITY_MINUTES = 30;

async function evo(serverUrl: string, apikey: string, path: string, method = "GET") {
  const res = await fetch(`${serverUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", apikey },
  });
  const txt = await res.text();
  let data: any = txt;
  try { data = JSON.parse(txt); } catch {}
  return { ok: res.ok, status: res.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1) Só age se houve atividade global recente em qualquer instância
    const { data: recentGlobal } = await supabase
      .from("evolution_webhook_events")
      .select("id")
      .gte("created_at", new Date(Date.now() - GLOBAL_ACTIVITY_MINUTES * 60 * 1000).toISOString())
      .limit(1);

    if (!recentGlobal || recentGlobal.length === 0) {
      return json({ skipped: true, reason: "no_global_activity" });
    }

    // 2) Pega todas as conexões evolution ativas
    const { data: conns } = await supabase
      .from("connection_configs")
      .select("id, label, config, status, is_connected")
      .eq("connection_id", "evolution")
      .eq("is_connected", true);

    if (!conns || conns.length === 0) return json({ checked: 0, restarted: [] });

    const staleCutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();
    const results: any[] = [];

    for (const c of conns) {
      const cfg = (c.config || {}) as Record<string, string>;
      const instance = cfg.instance_name;
      const serverUrl = (cfg.server_url || EVO_URL).replace(/\/+$/, "");
      const apikey = cfg.api_key || EVO_KEY;
      if (!instance || !serverUrl || !apikey) {
        results.push({ id: c.id, label: c.label, skipped: "missing_config" });
        continue;
      }

      const { data: recent } = await supabase
        .from("evolution_webhook_events")
        .select("id")
        .eq("instance_name", instance)
        .gte("created_at", staleCutoff)
        .limit(1);

      if (recent && recent.length > 0) {
        results.push({ id: c.id, label: c.label, instance, ok: true });
        continue;
      }

      // Confirma que Evolution acha que está "open"
      const st = await evo(serverUrl, apikey, `/instance/connectionState/${instance}`, "GET");
      const state = st.data?.instance?.state || st.data?.state || "unknown";
      if (state !== "open") {
        results.push({ id: c.id, label: c.label, instance, skipped: "not_open", state });
        continue;
      }

      // Zumbi confirmado — reinicia
      let r = await evo(serverUrl, apikey, `/instance/restart/${instance}`, "PUT");
      if (!r.ok) r = await evo(serverUrl, apikey, `/instance/restart/${instance}`, "POST");

      results.push({
        id: c.id,
        label: c.label,
        instance,
        restarted: r.ok,
        restart_status: r.status,
        detail: r.ok ? null : r.data,
      });
    }

    return json({ checked: conns.length, results });
  } catch (err) {
    console.error("evolution-auto-restart error:", err);
    return json({ error: String(err) }, 500);
  }
});
