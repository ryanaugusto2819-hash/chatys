import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Active connections + all Evolution ones (so a reconnected instance is
    // detected again after having been flagged as disconnected)
    const { data: connections, error } = await supabase
      .from("connection_configs")
      .select("id, connection_id, config, is_connected")
      .or("is_connected.eq.true,connection_id.eq.evolution");

    if (error) throw error;
    if (!connections || connections.length === 0) {
      return new Response(JSON.stringify({ message: "No active connections" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Record<string, unknown>[] = [];

    for (const conn of connections) {
      try {
        // Call check-connection-status for each
        const res = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/check-connection-status`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ configId: conn.id }),
          }
        );
        const data = await res.json();
        results.push({ id: conn.id, connection_id: conn.connection_id, ...data });
      } catch (e) {
        results.push({ id: conn.id, connection_id: conn.connection_id, error: String(e) });
      }
    }

    console.log(`[check-all-connections] Checked ${results.length} connections:`, JSON.stringify(results));

    return new Response(JSON.stringify({ checked: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("check-all-connections error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
