const $ = (id) => document.getElementById(id);

chrome.storage.local.get(["token", "gatewayUrl", "lastPoll", "lastError"], (s) => {
  $("token").value = s.token || "";
  $("gateway").value = s.gatewayUrl || "";
  render(s);
});

function render(s) {
  const last = s.lastPoll ? new Date(s.lastPoll).toLocaleTimeString("pt-BR") : "nunca";
  $("status").textContent = `Último contato com o CRM: ${last}${s.lastError ? `\nErro: ${s.lastError}` : ""}`;
}

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    token: $("token").value.trim(),
    gatewayUrl: $("gateway").value.trim(),
  });
  chrome.runtime.sendMessage({ type: "TEST_CONNECTION" }, (res) => {
    if (res && res.success) {
      $("status").textContent = `Conectado como: ${res.data?.device?.name || "aparelho"}`;
      chrome.runtime.sendMessage({ type: "POLL_NOW" });
    } else {
      $("status").textContent = `Falha: ${res?.error || "sem resposta"}`;
    }
  });
});
