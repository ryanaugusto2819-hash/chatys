import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

async function resumeClaimedExecution(
  service: any,
  url: string,
  key: string,
  row: any,
  reason: "response" | "timeout",
) {
  const response = await fetch(`${url}/functions/v1/execute-flow`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      flowId: row.flow_id,
      conversationId: row.conversation_id,
      executionId: row.execution_id,
      resumeFromNodeId: row.resume_node_id,
      resumeReason: reason,
      senderLabel: reason === "response" ? "resposta-cliente-recuperada" : "prazo-esgotado",
    }),
  });

  if (!response.ok) {
    const responseBody = (await response.text()).slice(0, 1000);
    const { error: restoreError } = await service
      .from("flow_executions")
      .update({ status: "waiting_for_response", resumed_at: null, resume_reason: null })
      .eq("id", row.execution_id)
      .eq("status", "running");
    console.error("[flow-wait-timeout] resume failed", {
      executionId: row.execution_id,
      conversationId: row.conversation_id,
      reason,
      status: response.status,
      responseBody,
      restoreError: restoreError?.message || null,
    });
  }

  return response;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const service = createClient(url, key);
    const results = [];

    const { data: expired, error: expiredError } = await service
      .from("flow_executions")
      .select("id, conversation_id")
      .eq("status", "waiting_for_response")
      .lte("wait_timeout_at", new Date().toISOString())
      .order("wait_timeout_at", { ascending: true })
      .limit(50);
    if (expiredError) throw expiredError;

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
      const response = await resumeClaimedExecution(service, url, key, row, "timeout");
      results.push({ executionId: item.id, reason: "timeout", status: response.ok ? "resumed" : "resume_failed", httpStatus: response.status });
    }

    return json({ success: true, processed: results.length, results });
  } catch (error) {
    console.error("[flow-wait-timeout]", error);
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});