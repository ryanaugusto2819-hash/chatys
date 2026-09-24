export async function resumeWaitingFlow(supabase: any, conversationId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("claim_waiting_flow", {
    p_conversation_id: conversationId,
    p_reason: "response",
    p_execution_id: null,
  });
  if (error) throw error;
  const claimed = data?.[0];
  if (!claimed?.execution_id || !claimed?.resume_node_id) return false;

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
  if (!response.ok) throw new Error(`Falha ao retomar fluxo: HTTP ${response.status}`);
  return true;
}