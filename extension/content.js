// Executa comandos vindos do CRM dentro do WhatsApp Web
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const digits = (v) => String(v || "").replace(/\D/g, "");

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
  const target = digits(phone);
  const current = new URL(location.href);
  // A navegação é feita pelo background (senão a página recarrega e o canal fecha)
  if (digits(current.searchParams.get("phone")) !== target) {
    throw new Error("NAV_REQUIRED");
  }
  const composer = await waitFor(findComposer, 30000);
  if (!composer) throw new Error("Não foi possível abrir a conversa deste número");
  return composer;
}

function setText(el, text) {
  el.focus();
  document.execCommand("selectAll", false, null);
  document.execCommand("insertText", false, text);
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
  pressEnter(composer);
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
    sendResponse({ ok: true });
    return false;
  }
  if (msg.type !== "EXECUTE") return;
  const { type, payload } = msg.command;
  (async () => {
    switch (type) {
      case "send_text":
        return sendText(payload.phone, payload.text);
      case "send_media":
        return sendMedia(payload.phone, payload.mediaUrl, payload.text, payload.mediaType);
      case "mark_read":
        return markRead(payload.phone);
      case "typing":
        return typing(payload.phone, payload.durationMs);
      default:
        throw new Error(`Comando desconhecido: ${type}`);
    }
  })()
    .then((result) => sendResponse({ success: true, result }))
    .catch((err) => sendResponse({ success: false, error: String(err.message || err) }));
  return true;
});
