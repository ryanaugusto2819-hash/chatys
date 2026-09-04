const DEFAULT_GATEWAY =
  "https://glceihfavfvebaaxgsnq.supabase.co/functions/v1/extension-gateway";
const EXTENSION_VERSION = "1.0.8";

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
  let versionMismatch = false;
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: "PING" });
    if (ping?.version === EXTENSION_VERSION) return;
    versionMismatch = Boolean(ping);
  } catch {}
  // Um comunicador antigo não pode ser removido por reinjeção. Faz uma única
  // atualização após trocar a versão para descarregar os listeners antigos.
  if (versionMismatch) {
    await chrome.tabs.reload(tabId);
    await waitTabReady(tabId);
    await new Promise((r) => setTimeout(r, 2500));
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    await new Promise((r) => setTimeout(r, 1000));
    const ping = await chrome.tabs.sendMessage(tabId, { type: "PING" });
    if (ping?.version !== EXTENSION_VERSION) {
      throw new Error("A aba do WhatsApp ainda está usando uma versão antiga da extensão");
    }
  } catch (error) {
    throw new Error(String(error?.message || error));
  }
}

const onlyDigits = (v) => String(v || "").replace(/\D/g, "");

const activeChatKey = (tabId) => `activeChat:${tabId}`;

async function getLastOpenedPhone(tabId) {
  const key = activeChatKey(tabId);
  const stored = await chrome.storage.local.get(key);
  return onlyDigits(stored[key]);
}

async function rememberOpenedPhone(tabId, phone) {
  await chrome.storage.local.set({ [activeChatKey(tabId)]: onlyDigits(phone) });
}

async function forgetOpenedPhone(tabId) {
  await chrome.storage.local.remove(activeChatKey(tabId));
}

async function prepareChat(tabId, phone) {
  const target = onlyDigits(phone);
  if (!target) throw new Error("Número do contato inválido");
  const ping = await chrome.tabs.sendMessage(tabId, { type: "PING" }).catch(() => null);
  if (onlyDigits(ping?.activePhone) === target) {
    return { ready: true, explicitNavigationRequired: false };
  }
  try {
    const started = await chrome.tabs.sendMessage(tabId, { type: "PREPARE_CHAT", phone: target });
    if (!started?.accepted) {
      return { ready: false, explicitNavigationRequired: false };
    }
    const start = Date.now();
    while (Date.now() - start < 30000) {
      await new Promise((r) => setTimeout(r, 400));
      const state = await chrome.tabs.sendMessage(tabId, { type: "PREPARE_STATUS" });
      if (state?.status === "success" && onlyDigits(state.phone) === target) {
        await rememberOpenedPhone(tabId, target);
        return { ready: true, explicitNavigationRequired: false };
      }
      if (state?.status === "failed") {
        return {
          ready: false,
          explicitNavigationRequired: /NAV_REQUIRED/.test(state.error || ""),
        };
      }
    }
    throw new Error("Tempo esgotado ao abrir a conversa no WhatsApp Web");
  } catch (error) {
    const message = String(error?.message || error);
    // O WhatsApp pode fechar o canal ao trocar de conversa, embora a troca
    // tenha sido concluída. Confirma o editor antes de considerar uma falha.
    if (/message channel closed|receiving end does not exist|context invalidated|asynchronous response/i.test(message)) {
      await new Promise((r) => setTimeout(r, 1200));
      await ensureContentScript(tabId);
      const afterNavigation = await chrome.tabs
        .sendMessage(tabId, { type: "PING" })
        .catch(() => null);
      if (afterNavigation?.composerReady) {
        await rememberOpenedPhone(tabId, target);
        return { ready: true, explicitNavigationRequired: false };
      }
      // Navegar pelo background não mantém um canal de mensagem aberto e evita
      // que o Chrome transforme a troca de conversa em falha do comando.
      return { ready: false, explicitNavigationRequired: true };
    }
    throw error;
  }
}

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
  if (!command?.id) throw new Error("Comando sem identificador");
  let started;
  try {
    started = await chrome.tabs.sendMessage(tabId, { type: "EXECUTE", command });
  } catch {
    await ensureContentScript(tabId);
    const existing = await chrome.tabs.sendMessage(tabId, {
      type: "COMMAND_STATUS",
      commandId: command.id,
    });
    if (existing?.status === "missing") {
      started = await chrome.tabs.sendMessage(tabId, { type: "EXECUTE", command });
    } else {
      started = { accepted: true };
    }
  }
  if (!started?.accepted) throw new Error(started?.error || "WhatsApp não aceitou o comando");

  const start = Date.now();
  while (Date.now() - start < 60000) {
    await new Promise((r) => setTimeout(r, 400));
    let state;
    try {
      state = await chrome.tabs.sendMessage(tabId, {
        type: "COMMAND_STATUS",
        commandId: command.id,
      });
    } catch {
      await ensureContentScript(tabId);
      continue;
    }
    if (state?.status === "success") {
      return { success: true, result: state.result || null };
    }
    if (state?.status === "failed") {
      return { success: false, error: state.error || "Falha ao executar" };
    }
  }
  throw new Error("Tempo esgotado aguardando WhatsApp Web");
}

async function runCommand(command) {
  const tab = await getWhatsAppTab();
  if (!tab) throw new Error("WhatsApp Web não está aberto nesta máquina");
  const phone = command?.payload?.phone;

  await ensureContentScript(tab.id);
  const prepared = await prepareChat(tab.id, phone);
  if (!prepared.ready && prepared.explicitNavigationRequired) {
    await openChatTab(tab.id, phone);
    await ensureContentScript(tab.id);
  }
  if (!prepared.ready && !prepared.explicitNavigationRequired) {
    throw new Error("Não foi possível confirmar a conversa no WhatsApp Web");
  }

  let response = await sendToTab(tab.id, command);

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
  if (phone) await rememberOpenedPhone(tab.id, phone);
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

chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.alarms.create("poll", { periodInMinutes: 0.1 });
  if (details.reason === "update") {
    const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
    await Promise.all(
      tabs
        .filter((tab) => typeof tab.id === "number")
        .map(async (tab) => {
          await forgetOpenedPhone(tab.id);
          await chrome.tabs.reload(tab.id).catch(() => {});
        }),
    );
  }
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("poll", { periodInMinutes: 0.1 });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "poll") tick();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  forgetOpenedPhone(tabId).catch(() => {});
});

// Faster loop while the service worker is alive
setInterval(tick, 3000);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GET_VERSION") {
    sendResponse({ version: EXTENSION_VERSION });
    return false;
  }
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
  if (msg.type === "ACTIVE_CHAT_CHANGED" && _sender.tab?.id) {
    // O WhatsApp pode trocar o contexto da página logo após este clique.
    // Responda antes da troca e limpe o estado sem manter o canal aberto.
    forgetOpenedPhone(_sender.tab.id).catch(() => {});
    sendResponse({ success: true });
    return false;
  }
});
