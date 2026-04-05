import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

    // Find conversations where last message was 3+ hours ago and not yet analyzed
    // Also must have at least some messages (not empty)
    const { data: candidates, error: queryError } = await supabase
      .from("conversations")
      .select("id, updated_at")
      .lt("updated_at", threeHoursAgo)
      .not("id", "in", `(SELECT conversation_id FROM manager_analyses)`)
      .limit(10);

    // Fallback: if the NOT IN subquery doesn't work via PostgREST, do it manually
    let toAnalyze = candidates || [];

    if (!candidates || queryError) {
      // Manual approach
      const { data: allConvos } = await supabase
        .from("conversations")
        .select("id, updated_at")
        .lt("updated_at", threeHoursAgo)
        .order("updated_at", { ascending: false })
        .limit(50);

      const { data: analyzed } = await supabase
        .from("manager_analyses")
        .select("conversation_id");

      const analyzedIds = new Set((analyzed || []).map((a: any) => a.conversation_id));
      toAnalyze = (allConvos || []).filter((c: any) => !analyzedIds.has(c.id)).slice(0, 10);
    }

    const results = [];
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    for (const conv of toAnalyze) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/ai-manager`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ conversation_id: conv.id }),
        });
        const data = await res.json();
        results.push({ conversation_id: conv.id, status: "ok", data });
      } catch (err: unknown) {
        results.push({ conversation_id: conv.id, status: "error", error: (err as Error).message });
      }
      // Small delay between analyses to avoid rate limits
      await new Promise(r => setTimeout(r, 2000));
    }

    return new Response(JSON.stringify({ analyzed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    console.error("ai-manager-cron error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
