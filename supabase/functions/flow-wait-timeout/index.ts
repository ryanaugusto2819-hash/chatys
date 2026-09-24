import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const service = createClient(url, key);
    const { data: expired, error } = await service
      .from("flow_executions")
      .select("id, conversation_id")
      .eq("status", "waiting_for_response")
      .lte("wait_timeout_at", new Date().toISOString())
      .order("wait_timeout_at", { ascending: true })
      .limit(50);
    if (error) throw error;

    const results = [];
    for (const item of expired || []) {
      const { data: claimed, error: claimError } = await service.rpc("claim_waiting_flow", {
        p_conversation_id: item.conversation_id,
        p_reason: "timeout",
        p_execution_id: item.id,
      });
      if (claimError) {
        results.push({ executionId: item.id, status: "claim_failed", error: claimError.message });
        continue;
      }
      const row = claimed?.[0];
      if (!row?.resume_node_id) {
        results.push({ executionId: item.id, status: "already_claimed" });
        continue;
      }
      const response = await fetch(`${url}/functions/v1/execute-flow`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          flowId: row.flow_id,
          conversationId: row.conversation_id,
          executionId: row.execution_id,
          resumeFromNodeId: row.resume_node_id,
          resumeReason: "timeout",
          senderLabel: "prazo-esgotado",
        }),
      });
      results.push({ executionId: item.id, status: response.ok ? "resumed" : "resume_failed", httpStatus: response.status });
    }

    return json({ success: true, processed: results.length, results });
  } catch (error) {
    console.error("[flow-wait-timeout]", error);
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});