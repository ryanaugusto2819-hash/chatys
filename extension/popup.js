const DEFAULT_GATEWAY =
  "https://glceihfavfvebaaxgsnq.supabase.co/functions/v1/extension-gateway";
const $ = (id) => document.getElementById(id);

function render(state) {
  const last = state.lastPoll ? new Date(state.lastPoll).toLocaleTimeString("pt-BR") : "nunca";
  const active = state.activeVersion
    ? `Comunicador ativo: ${state.activeVersion}`
    : "Abra ou recarregue o WhatsApp Web";
  $("status").textContent = `${active}\nÚltimo contato com o CRM: ${last}${
    state.lastError ? `\nErro: ${state.lastError}` : ""
  }`;
}

chrome.storage.local.get(
  ["token", "gatewayUrl", "lastPoll", "lastError", "activeVersion"],
  (state) => {
    $("token").value = state.token || "";
    $("gateway").value = state.gatewayUrl || "";
    $("version").textContent = `Versão ${chrome.runtime.getManifest().version}`;
    render(state);
  },
);

$("save").addEventListener("click", async () => {
  const token = $("token").value.trim();
  const gatewayUrl = $("gateway").value.trim();
  await chrome.storage.local.set({ token, gatewayUrl, lastError: "" });
  try {
    const response = await fetch(gatewayUrl || DEFAULT_GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-extension-token": token },
      body: JSON.stringify({ action: "hello", clientVersion: chrome.runtime.getManifest().version }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `CRM respondeu ${response.status}`);
    $("status").textContent = `Conectado como: ${data.device?.name || "computador"}\nRecarregue o WhatsApp Web uma vez.`;
  } catch (error) {
    $("status").textContent = `Falha: ${String(error?.message || error)}`;
  }
});