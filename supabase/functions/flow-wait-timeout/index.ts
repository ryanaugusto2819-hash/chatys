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

    // Safety net for provider webhooks that were interrupted after persisting the
    // customer's message but before resuming the waiting execution.
    const { data: waiting, error: waitingError } = await service
      .from("flow_executions")
      .select("id, conversation_id, waiting_since")
      .eq("status", "waiting_for_response")
      .not("response_resume_node_id", "is", null)
      .order("waiting_since", { ascending: false })
      .limit(50);
    if (waitingError) throw waitingError;

    if (waiting?.length) {
      const conversationIds = [...new Set(waiting.map((item: any) => item.conversation_id))];
      const oldestWait = waiting.reduce(
        (oldest: string, item: any) => item.waiting_since < oldest ? item.waiting_since : oldest,
        waiting[0].waiting_since,
      );
      const { data: replies, error: repliesError } = await service
        .from("messages")
        .select("conversation_id, created_at")
        .in("conversation_id", conversationIds)
        .eq("sender_type", "customer")
        .gt("created_at", oldestWait)
        .order("created_at", { ascending: true });
      if (repliesError) throw repliesError;

      const latestReplyByConversation = new Map<string, string>();
      for (const reply of replies || []) {
        latestReplyByConversation.set(reply.conversation_id, reply.created_at);
      }

      for (const item of waiting) {
        if (results.length >= 50) break;
        const replyAt = latestReplyByConversation.get(item.conversation_id);
        if (!replyAt || replyAt <= item.waiting_since) continue;

        const { data: claimed, error: claimError } = await service.rpc("claim_waiting_flow", {
          p_conversation_id: item.conversation_id,
          p_reason: "response",
          p_execution_id: item.id,
        });
        if (claimError) {
          results.push({ executionId: item.id, reason: "response", status: "claim_failed", error: claimError.message });
          continue;
        }
        const row = claimed?.[0];
        if (!row?.resume_node_id) {
          results.push({ executionId: item.id, reason: "response", status: "already_claimed" });
          continue;
        }
        const response = await resumeClaimedExecution(service, url, key, row, "response");
        results.push({ executionId: item.id, reason: "response", status: response.ok ? "resumed" : "resume_failed", httpStatus: response.status });
      }
    }

    const remaining = 50 - results.length;
    if (remaining <= 0) return json({ success: true, processed: results.length, results });

    const { data: expired, error: expiredError } = await service
      .from("flow_executions")
      .select("id, conversation_id")
      .eq("status", "waiting_for_response")
      .lte("wait_timeout_at", new Date().toISOString())
      .order("wait_timeout_at", { ascending: true })
      .limit(remaining);
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