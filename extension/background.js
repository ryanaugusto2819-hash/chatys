const DEFAULT_GATEWAY =
  "https://glceihfavfvebaaxgsnq.supabase.co/functions/v1/extension-gateway";

async function getConfig() {
  const { gatewayUrl, token } = await chrome.storage.local.get(["gatewayUrl", "token"]);
  return { gatewayUrl: gatewayUrl || DEFAULT_GATEWAY, token: token || "" };
}

async function callGateway(body) {
  const { gatewayUrl, token } = await getConfig();
  if (!token) throw new Error("Token não configurado");
  const res = await fetch(gatewayUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-extension-token": token },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function getWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  return tabs[0] || null;
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const onlyDigits = (v) => String(v || "").replace(/\D/g, "");

async function waitTabReady(tabId, timeout = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return tab;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("WhatsApp Web demorou demais para carregar");
}

async function openChatTab(tabId, phone) {
  const target = onlyDigits(phone);
  if (!target) return;
  const tab = await chrome.tabs.get(tabId);
  let currentPhone = "";
  try {
    currentPhone = onlyDigits(new URL(tab.url).searchParams.get("phone"));
  } catch {}
  if (currentPhone === target) return;
  await chrome.tabs.update(tabId, {
    url: `https://web.whatsapp.com/send?phone=${target}&type=phone_number&app_absent=0`,
  });
  await waitTabReady(tabId);
  // WhatsApp Web precisa de um tempo extra para montar a conversa
  await new Promise((r) => setTimeout(r, 4000));
}

async function sendToTab(tabId, command) {
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Tempo esgotado aguardando WhatsApp Web")),
      60000,
    );
    chrome.tabs.sendMessage(tabId, { type: "EXECUTE", command }, (resp) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || "Erro de comunicação com a aba"));
        return;
      }
      resolve(resp);
    });
  });
}

async function runCommand(command) {
  const tab = await getWhatsAppTab();
  if (!tab) throw new Error("WhatsApp Web não está aberto nesta máquina");
  const phone = command?.payload?.phone;

  await openChatTab(tab.id, phone);
  await ensureContentScript(tab.id);

  let response;
  try {
    response = await sendToTab(tab.id, command);
  } catch (err) {
    // Canal fechou (navegação/reload): recarrega o script e tenta de novo
    await waitTabReady(tab.id);
    await new Promise((r) => setTimeout(r, 2000));
    await ensureContentScript(tab.id);
    response = await sendToTab(tab.id, command);
  }

  if (response && !response.success && /NAV_REQUIRED/.test(response.error || "")) {
    await chrome.tabs.update(tab.id, {
      url: `https://web.whatsapp.com/send?phone=${onlyDigits(phone)}&type=phone_number&app_absent=0`,
    });
    await waitTabReady(tab.id);
    await new Promise((r) => setTimeout(r, 4000));
    await ensureContentScript(tab.id);
    response = await sendToTab(tab.id, command);
  }

  if (!response) throw new Error("Sem resposta da aba do WhatsApp Web");
  if (!response.success) {
    const msg = response.error || "Falha ao executar";
    throw new Error(msg === "NAV_REQUIRED" ? "Não foi possível abrir a conversa deste número" : msg);
  }
  return response;
}

let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const data = await callGateway({ action: "poll" });
    await chrome.storage.local.set({ lastPoll: Date.now(), lastError: "" });
    for (const command of data.commands || []) {
      try {
        const result = await runCommand(command);
        await callGateway({
          action: "ack",
          commandId: command.id,
          success: true,
          result: result.result || null,
          providerMessageId: result.providerMessageId || null,
        });
      } catch (err) {
        await callGateway({
          action: "ack",
          commandId: command.id,
          success: false,
          error: String(err.message || err),
        });
      }
    }
  } catch (err) {
    await chrome.storage.local.set({ lastError: String(err.message || err) });
  } finally {
    running = false;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("poll", { periodInMinutes: 0.1 });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("poll", { periodInMinutes: 0.1 });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "poll") tick();
});

// Faster loop while the service worker is alive
setInterval(tick, 3000);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "TEST_CONNECTION") {
    callGateway({ action: "hello", phone: msg.phone || null })
      .then((d) => sendResponse({ success: true, data: d }))
      .catch((e) => sendResponse({ success: false, error: String(e.message || e) }));
    return true;
  }
  if (msg.type === "INBOUND") {
    callGateway({ action: "inbound", ...msg.payload })
      .then((d) => sendResponse({ success: true, data: d }))
      .catch((e) => sendResponse({ success: false, error: String(e.message || e) }));
    return true;
  }
  if (msg.type === "POLL_NOW") {
    tick().then(() => sendResponse({ success: true }));
    return true;
  }
});
