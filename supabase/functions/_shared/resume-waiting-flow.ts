export async function resumeWaitingFlow(supabase: any, conversationId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("claim_waiting_flow", {
    p_conversation_id: conversationId,
    p_reason: "response",
    p_execution_id: null,
  });
  if (error) {
    console.error("[resume-waiting-flow] claim failed", {
      conversationId,
      code: error.code || null,
      message: error.message || String(error),
    });
    throw error;
  }
  const claimed = data?.[0];
  if (!claimed?.execution_id || !claimed?.resume_node_id) {
    console.info("[resume-waiting-flow] no waiting execution", { conversationId });
    return false;
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const response = await fetch(`${url}/functions/v1/execute-flow`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      flowId: claimed.flow_id,
      conversationId: claimed.conversation_id,
      executionId: claimed.execution_id,
      resumeFromNodeId: claimed.resume_node_id,
      resumeReason: "response",
      senderLabel: "resposta-cliente",
    }),
  });
  if (!response.ok) {
    const responseBody = (await response.text()).slice(0, 1000);
    const { error: restoreError } = await supabase
      .from("flow_executions")
      .update({ status: "waiting_for_response", resumed_at: null, resume_reason: null })
      .eq("id", claimed.execution_id)
      .eq("status", "running");
    console.error("[resume-waiting-flow] execution resume failed", {
      conversationId,
      executionId: claimed.execution_id,
      flowId: claimed.flow_id,
      resumeNodeId: claimed.resume_node_id,
      status: response.status,
      responseBody,
      restoreError: restoreError?.message || null,
    });
    throw new Error(`Falha ao retomar fluxo: HTTP ${response.status}`);
  }
  console.info("[resume-waiting-flow] execution resumed", {
    conversationId,
    executionId: claimed.execution_id,
    flowId: claimed.flow_id,
    resumeNodeId: claimed.resume_node_id,
  });
  return true;
}