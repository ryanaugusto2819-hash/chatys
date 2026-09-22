export async function triggerTrainedMessageAnalysis(sourceMessageId: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey || !sourceMessageId) return;

  const response = await fetch(`${url}/functions/v1/ai-trained-messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sourceMessageId }),
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.error(`[trained-message] analysis failed [${response.status}]: ${details.slice(0, 500)}`);
  }
}