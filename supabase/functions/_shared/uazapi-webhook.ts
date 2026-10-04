// uazapiGO's default POST /webhook replaces the primary destination. Always
// use the advanced add action so an existing integration keeps receiving events.
export async function ensureUazapiWebhook(serverUrl: string, token: string, webhookUrl: string) {
  const headers = { "Content-Type": "application/json", token };
  const currentResponse = await fetch(`${serverUrl}/webhook`, { headers });
  const currentText = await currentResponse.text();
  let current: unknown;
  try { current = JSON.parse(currentText); } catch { current = currentText; }
  if (!currentResponse.ok || !Array.isArray(current)) {
    throw new Error(`Consulta dos webhooks falhou (HTTP ${currentResponse.status}): ${typeof current === "string" ? current.slice(0, 300) : JSON.stringify(current).slice(0, 300)}`);
  }

  const ours = current.find((entry: unknown) =>
    typeof entry === "object" && entry !== null && "url" in entry && entry.url === webhookUrl && "enabled" in entry && entry.enabled === true
  );
  if (ours) return { alreadyConfigured: true };

  const response = await fetch(`${serverUrl}/webhook`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "add", enabled: true, url: webhookUrl,
      events: ["connection", "messages", "messages_update"],
      addUrlEvents: false, addUrlTypesMessages: false,
    }),
  });
  const text = await response.text();
  let result: unknown;
  try { result = JSON.parse(text); } catch { result = text; }
  if (!response.ok || (typeof result === "object" && result !== null && "error" in result && result.error)) {
    throw new Error(`Configuração do webhook falhou (HTTP ${response.status}): ${typeof result === "string" ? result.slice(0, 300) : JSON.stringify(result).slice(0, 300)}`);
  }
  return { alreadyConfigured: false };
}