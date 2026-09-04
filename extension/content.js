(function () {
  const VERSION = "2.0.0";
  const DEFAULT_GATEWAY =
    "https://glceihfavfvebaaxgsnq.supabase.co/functions/v1/extension-gateway";
  const PENDING_KEY = "chatys_pending_command_v2";

  if (globalThis.__chatysDirectWorkerVersion === VERSION) return;
  globalThis.__chatysDirectWorkerVersion = VERSION;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const digits = (value) => String(value || "").replace(/\D/g, "");
  let busy = false;

  async function setDiagnostic(lastError = "") {
    await chrome.storage.local.set({
      activeVersion: VERSION,
      lastPoll: Date.now(),
      lastError,
    });
  }

  async function callGateway(body) {
    const stored = await chrome.storage.local.get(["gatewayUrl", "token"]);
    const token = String(stored.token || "").trim();
    if (!token) throw new Error("Chave da extensão não configurada");
    const response = await fetch(stored.gatewayUrl || DEFAULT_GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-extension-token": token,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `CRM respondeu ${response.status}`);
    return data;
  }

  async function waitFor(find, timeout = 30000, interval = 400) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      const value = find();
      if (value) return value;
      await sleep(interval);
    }
    return null;
  }

  function findComposer() {
    const footer = document.querySelector("footer");
    const scoped = footer?.querySelectorAll('div[contenteditable="true"][role="textbox"]');
    if (scoped?.length) return scoped[scoped.length - 1];
    const boxes = document.querySelectorAll('div[contenteditable="true"][data-tab]');
    return boxes[boxes.length - 1] || null;
  }

  function setText(element, text) {
    element.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, text);
    element.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }),
    );
  }

  function pressEnter(element) {
    const options = {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    };
    element.dispatchEvent(new KeyboardEvent("keydown", options));
    element.dispatchEvent(new KeyboardEvent("keypress", options));
    element.dispatchEvent(new KeyboardEvent("keyup", options));
  }

  function currentUrlPhone() {
    try {
      return digits(new URL(location.href).searchParams.get("phone"));
    } catch {
      return "";
    }
  }

  async function ensureConversation(command) {
    const phone = digits(command?.payload?.phone);
    if (!phone) throw new Error("Número do contato inválido");
    const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
    if (pending?.id === command.id || currentUrlPhone() === phone) {
      const composer = await waitFor(findComposer, 45000);
      if (!composer) throw new Error("A conversa não abriu no WhatsApp Web");
      return composer;
    }

    localStorage.setItem(PENDING_KEY, JSON.stringify(command));
    location.assign(`https://web.whatsapp.com/send?phone=${phone}&type=phone_number&app_absent=0`);
    return null;
  }

  async function sendText(command, composer) {
    const text = String(command.payload?.text || "");
    if (!text) throw new Error("Mensagem vazia");
    setText(composer, text);
    await sleep(300);
    const button =
      document.querySelector('button[aria-label*="Enviar"], button[aria-label*="Send"]') ||
      document.querySelector('span[data-icon="send"]')?.closest('div[role="button"], button');
    if (button) button.click();
    else pressEnter(composer);
    await sleep(700);
    return { sentAt: new Date().toISOString(), extensionVersion: VERSION };
  }

  async function sendMedia(command, composer) {
    const mediaUrl = String(command.payload?.mediaUrl || "");
    if (!mediaUrl) throw new Error("Arquivo sem endereço para download");
    const response = await fetch(mediaUrl);
    if (!response.ok) throw new Error(`Não consegui baixar o arquivo (${response.status})`);
    const blob = await response.blob();
    const extension = (blob.type.split("/")[1] || "bin").split(";")[0];
    const file = new File(
      [blob],
      `${command.payload?.mediaType || "arquivo"}.${extension}`,
      { type: blob.type || "application/octet-stream" },
    );
    const transfer = new DataTransfer();
    transfer.items.add(file);
    composer.focus();
    composer.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }),
    );
    const preview = await waitFor(
      () => document.querySelector('div[contenteditable="true"][data-tab="10"]'),
      20000,
    );
    if (!preview) throw new Error("A pré-visualização do arquivo não abriu");
    const caption = String(command.payload?.text || "");
    if (caption) setText(preview, caption);
    await sleep(500);
    const button =
      document.querySelector('div[role="button"][aria-label*="Enviar"]') ||
      document.querySelector('span[data-icon="send"]')?.closest('div[role="button"], button');
    if (button) button.click();
    else pressEnter(preview);
    await sleep(1500);
    return { sentAt: new Date().toISOString(), extensionVersion: VERSION };
  }

  async function execute(command) {
    const resultKey = `chatys_cmd_v2_${command.id}`;
    const previous = JSON.parse(localStorage.getItem(resultKey) || "null");
    if (previous?.status === "done") return previous.result;

    const composer = await ensureConversation(command);
    if (!composer) return null;

    localStorage.setItem(resultKey, JSON.stringify({ status: "running", at: Date.now() }));
    let result;
    switch (command.type) {
      case "send_text":
        result = await sendText(command, composer);
        break;
      case "send_media":
        result = await sendMedia(command, composer);
        break;
      case "mark_read":
        result = { readAt: new Date().toISOString(), extensionVersion: VERSION };
        break;
      case "typing": {
        composer.focus();
        const duration = Number(command.payload?.durationMs || 2500);
        await sleep(Math.min(Math.max(duration, 500), 10000));
        result = { typedFor: duration, extensionVersion: VERSION };
        break;
      }
      default:
        throw new Error(`Ação desconhecida: ${command.type}`);
    }
    localStorage.setItem(resultKey, JSON.stringify({ status: "done", result }));
    localStorage.removeItem(PENDING_KEY);
    return result;
  }

  async function processCommand(command) {
    try {
      const result = await execute(command);
      if (result === null) return false;
      await callGateway({ action: "ack", commandId: command.id, success: true, result });
      await setDiagnostic("");
      return true;
    } catch (error) {
      const message = String(error?.message || error);
      localStorage.removeItem(PENDING_KEY);
      await callGateway({
        action: "ack",
        commandId: command.id,
        success: false,
        error: `[Extensão ${VERSION}] ${message}`,
      }).catch(() => {});
      await setDiagnostic(message);
      return true;
    }
  }

  async function cycle() {
    if (busy) return;
    busy = true;
    try {
      const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
      if (pending?.id) {
        const finished = await processCommand(pending);
        if (!finished) return;
      }
      const data = await callGateway({ action: "poll", clientVersion: VERSION });
      await setDiagnostic("");
      for (const command of data.commands || []) {
        const finished = await processCommand(command);
        if (!finished) return;
      }
    } catch (error) {
      await setDiagnostic(String(error?.message || error));
    } finally {
      busy = false;
    }
  }

  cycle();
  setInterval(cycle, 3000);
})();