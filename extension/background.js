const EXTENSION_VERSION = "2.0.0";

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ installedVersion: EXTENSION_VERSION });
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  await Promise.all(
    tabs
      .filter((tab) => typeof tab.id === "number")
      .map((tab) => chrome.tabs.reload(tab.id).catch(() => {})),
  );
});