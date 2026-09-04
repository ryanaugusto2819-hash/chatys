// Executa comandos vindos do CRM dentro do WhatsApp Web
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const digits = (v) => String(v || "").replace(/\D/g, "");
let activePhone = "";

function findComposer() {
  const boxes = document.querySelectorAll('div[contenteditable="true"][data-tab]');
  return boxes[boxes.length - 1] || null;
}

async function waitFor(fn, timeout = 25000, interval = 400) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = fn();
    if (value) return value;
    await sleep(interval);
  }
  return null;
}

async function openChat(phone) {
  if (!digits(phone)) throw new Error("Número do contato inválido");
  // A navegação é concluída pelo background. O WhatsApp remove o parâmetro
  // `phone` da URL depois de abrir o chat, então a URL não pode ser usada
  // para validar a conversa neste ponto.
  const composer = await waitFor(findComposer, 30000);
  if (!composer) throw new Error("Não foi possível abrir a conversa deste número");
  return composer;
}

function findChatSearch() {
  const selectors = [
    '#side div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"][data-tab="3"]',
    'div[contenteditable="true"][aria-label*="Pesquisar"]',
    'div[contenteditable="true"][aria-label*="Search"]',
  ];
  return selectors.map((selector) => document.querySelector(selector)).find(Boolean) || null;
}

async function selectChatWithoutReload(phone) {
  const target = digits(phone);
  if (!target) throw new Error("Número do contato inválido");
  if (activePhone === target && findComposer()) return { ready: true, alreadyOpen: true };

  const search = await waitFor(findChatSearch, 8000);
  if (!search) return { ready: false, error: "NAV_REQUIRED" };

  setText(search, target);
  const result = await waitFor(() => {
    const rows = [...document.querySelectorAll('#pane-side [role="row"], #pane-side [role="listitem"]')];
    return rows.find((row) => {
      const rowDigits = digits(row.textContent);
      return rowDigits.includes(target) || rowDigits.endsWith(target.slice(-9));
    }) || (rows.length === 1 ? rows[0] : null);
  }, 12000);

  if (!result) {
    setText(search, "");
    return { ready: false, error: "NAV_REQUIRED" };
  }

  result.click();
  const composer = await waitFor(findComposer, 15000);
  setText(search, "");
  if (!composer) return { ready: false, error: "NAV_REQUIRED" };
  activePhone = target;
  return { ready: true, alreadyOpen: false };
}

function setText(el, text) {
  el.focus();
  document.execCommand("selectAll", false, null);
  document.execCommand("insertText", false, text);
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
}

function pressEnter(el) {
  const opts = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
  el.dispatchEvent(new KeyboardEvent("keydown", opts));
  el.dispatchEvent(new KeyboardEvent("keypress", opts));
  el.dispatchEvent(new KeyboardEvent("keyup", opts));
}

async function sendText(phone, text) {
  const composer = await openChat(phone);
  if (!text) throw new Error("Mensagem vazia");
  setText(composer, text);
  await sleep(250);
  const sendBtn =
    document.querySelector('button[aria-label*="Enviar"], button[aria-label*="Send"]') ||
    document.querySelector('span[data-icon="send"]')?.closest('div[role="button"], button');
  if (sendBtn) sendBtn.click();
  else pressEnter(composer);
  await sleep(600);
  return { sentAt: new Date().toISOString() };
}

async function sendMedia(phone, mediaUrl, caption, mediaType) {
  const composer = await openChat(phone);
  const res = await fetch(mediaUrl);
  if (!res.ok) throw new Error(`Não consegui baixar o arquivo (${res.status})`);
  const blob = await res.blob();
  const ext = (blob.type.split("/")[1] || "bin").split(";")[0];
  const file = new File([blob], `${mediaType || "arquivo"}.${ext}`, { type: blob.type });

  const dt = new DataTransfer();
  dt.items.add(file);
  composer.focus();
  composer.dispatchEvent(
    new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
  );

  const previewBox = await waitFor(
    () => document.querySelector('div[contenteditable="true"][data-tab="10"]') || findComposer(),
    20000,
  );
  if (!previewBox) throw new Error("A pré-visualização do arquivo não abriu");
  await sleep(1200);
  if (caption) {
    setText(previewBox, caption);
    await sleep(300);
  }
  const sendBtn =
    document.querySelector('div[role="button"][aria-label*="Enviar"]') ||
    document.querySelector('span[data-icon="send"]')?.closest('div[role="button"], button');
  if (sendBtn) sendBtn.click();
  else pressEnter(previewBox);
  await sleep(1500);
  return { sentAt: new Date().toISOString() };
}

async function markRead(phone) {
  await openChat(phone);
  return { readAt: new Date().toISOString() };
}

async function typing(phone, durationMs) {
  const composer = await openChat(phone);
  composer.focus();
  const end = Date.now() + (durationMs || 2500);
  while (Date.now() < end) {
    composer.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    await sleep(400);
  }
  return { typedFor: durationMs || 2500 };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "PING") {
    sendResponse({ ok: true, activePhone });
    return false;
  }
  if (msg.type === "PREPARE_CHAT") {
    selectChatWithoutReload(msg.phone)
      .then((result) => sendResponse({ success: result.ready, ...result }))
      .catch((err) => sendResponse({ success: false, error: String(err.message || err) }));
    return true;
  }
  if (msg.type !== "EXECUTE") return;
  const { type, payload, id } = msg.command;
  const dedupeKey = id ? `chatys_cmd_${id}` : null;
  (async () => {
    // Evita reenvio quando o canal cai (reload) e o background tenta de novo
    if (dedupeKey) {
      try {
        const prev = localStorage.getItem(dedupeKey);
        if (prev) return JSON.parse(prev);
        localStorage.setItem(dedupeKey, JSON.stringify({ dedupe: true }));
      } catch {}
    }
    let result;
    switch (type) {
      case "send_text":
        result = await sendText(payload.phone, payload.text);
        break;
      case "send_media":
        result = await sendMedia(payload.phone, payload.mediaUrl, payload.text, payload.mediaType);
        break;
      case "mark_read":
        result = await markRead(payload.phone);
        break;
      case "typing":
        result = await typing(payload.phone, payload.durationMs);
        break;
      default:
        throw new Error(`Comando desconhecido: ${type}`);
    }
    if (dedupeKey) {
      try {
        localStorage.setItem(dedupeKey, JSON.stringify(result || {}));
      } catch {}
    }
    return result;
  })()
    .then((result) => sendResponse({ success: true, result }))
    .catch((err) => {
      if (dedupeKey) {
        try {
          localStorage.removeItem(dedupeKey);
        } catch {}
      }
      sendResponse({ success: false, error: String(err.message || err) });
    });
  return true;
});


// Se a pessoa trocar a conversa manualmente, invalida o último número
// lembrado para impedir que a próxima mensagem seja enviada ao contato errado.
document.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof Element && target.closest("#pane-side")) {
    activePhone = "";
    chrome.runtime.sendMessage({ type: "ACTIVE_CHAT_CHANGED" }).catch(() => {});
  }
}, true);
