// ============================================================
// Aurelius Browser Control — background.js
// WebSocket client + tab command dispatcher for Zen Browser
// ============================================================

const DEFAULT_WS_URL = "ws://localhost:3001/browser/ws";

/**
 * Ensure the URL always uses ws:// not wss://.
 * Zen Browser's HTTPS-Only Mode can silently upgrade ws:// → wss://.
 * We force plain ws:// for localhost since the backend has no TLS.
 */
function forceWsProtocol(url) {
  if (url.startsWith("wss://localhost") || url.startsWith("wss://127.0.0.1")) {
    const fixed = url.replace(/^wss:\/\//, "ws://");
    console.warn(`[Aurelius] Corrected wss:// → ws:// : ${fixed}`);
    return fixed;
  }
  return url;
}
const RECONNECT_BASE_DELAY_MS = 3_000;
const RECONNECT_MAX_DELAY_MS = 30_000;
const TAB_LOAD_TIMEOUT_MS = 15_000;

let ws = null;
let reconnectTimer = null;
let reconnectDelay = RECONNECT_BASE_DELAY_MS;
let isConnected = false;
let wsUrl = DEFAULT_WS_URL;

// ── Load persisted WS URL ────────────────────────────────────
async function loadWsUrl() {
  try {
    const result = await browser.storage.local.get("wsUrl");
    if (result.wsUrl) wsUrl = forceWsProtocol(result.wsUrl);
  } catch {
    // fall back to default
  }
}

// ── Badge helper ─────────────────────────────────────────────
function updateBadge(connected) {
  browser.browserAction.setBadgeText({ text: connected ? "ON" : "" });
  browser.browserAction.setBadgeBackgroundColor({
    color: connected ? "#22c55e" : "#ef4444",
  });
}

// ── Send result / error back to backend ──────────────────────
function sendResult(id, data) {
  console.log(`[Aurelius] ── SEND RESULT ───────────────────────────`);
  console.log(`[Aurelius]   id          : ${id}`);
  console.log(`[Aurelius]   data type   : ${typeof data}`);
  console.log(`[Aurelius]   data preview: ${String(data).slice(0, 120)}`);
  console.log(
    `[Aurelius]   ws state    : ${ws ? ws.readyState : "null"} (1=OPEN)`,
  );

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error(
      `[Aurelius] ✖ Cannot send result — WebSocket is not open (state: ${ws ? ws.readyState : "null"})`,
    );
    return;
  }

  const payload = JSON.stringify({ id, success: true, data });
  console.log(`[Aurelius]   payload     : ${payload.slice(0, 200)}`);
  ws.send(payload);
  console.log(`[Aurelius] ✔ Result sent successfully`);
}

function sendError(id, message) {
  console.log(`[Aurelius] ── SEND ERROR ────────────────────────────`);
  console.log(`[Aurelius]   id      : ${id}`);
  console.log(`[Aurelius]   message : ${message}`);
  console.log(`[Aurelius]   ws state: ${ws ? ws.readyState : "null"} (1=OPEN)`);

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error(
      `[Aurelius] ✖ Cannot send error — WebSocket is not open (state: ${ws ? ws.readyState : "null"})`,
    );
    return;
  }

  const payload = JSON.stringify({ id, success: false, error: message });
  console.log(`[Aurelius]   payload : ${payload.slice(0, 200)}`);
  ws.send(payload);
  console.log(`[Aurelius] ✔ Error sent successfully`);
}

// ── Wait for a tab to finish loading ─────────────────────────
function waitForTabLoad(tabId, timeout = TAB_LOAD_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      resolve(); // don't block forever — resolve even if still loading
    }, timeout);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 250); // brief wait for page JS to settle
      }
    }

    browser.tabs.onUpdated.addListener(listener);
  });
}

// ── Get the currently active tab ─────────────────────────────
async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error("No active tab found");
  return tab;
}

// ── Forward DOM commands to content.js ───────────────────────
// If the content script is not yet injected (e.g. freshly opened tab),
// we inject content.js on-demand and retry once.
async function sendToContent(tabId, action, params = {}) {
  async function trySend() {
    return browser.tabs.sendMessage(tabId, { action, params });
  }

  let response;
  try {
    response = await trySend();
  } catch {
    // Content script not ready — inject on demand and retry
    try {
      await browser.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
      await new Promise((r) => setTimeout(r, 150)); // give it a moment to register
      response = await trySend();
    } catch (err) {
      throw new Error(
        `Cannot reach content script in this tab: ${err.message}`,
      );
    }
  }

  if (!response) throw new Error("Content script returned no response");
  if (response.error) throw new Error(response.error);
  return response.data ?? "";
}

// ── Main command dispatcher ───────────────────────────────────
async function handleCommand({ id, action, params = {} }) {
  console.log(`[Aurelius] ── COMMAND ───────────────────────────────`);
  console.log(`[Aurelius]   id     : ${id}`);
  console.log(`[Aurelius]   action : ${action}`);
  console.log(`[Aurelius]   params : ${JSON.stringify(params).slice(0, 200)}`);

  try {
    let result;

    switch (action) {
      // ── Read-only tab info ────────────────────────────────

      case "get_url": {
        const tab = await getActiveTab();
        result = `URL: ${tab.url}\nTitle: ${tab.title ?? "(no title)"}`;
        break;
      }

      case "get_tabs": {
        const tabs = await browser.tabs.query({});
        const lines = tabs.map(
          (t) =>
            `id=${t.id} ${t.active ? "[ACTIVE]" : "        "} | ${(t.title ?? "(no title)").slice(0, 60)}\n           ${t.url}`,
        );
        result = `Open tabs (${tabs.length} total):\n\n${lines.join("\n\n")}`;
        break;
      }

      // ── Tab navigation ────────────────────────────────────

      case "navigate": {
        const url = String(params.url ?? "").trim();
        if (!url) throw new Error("No URL provided");
        const tab = await getActiveTab();
        await browser.tabs.update(tab.id, { url });
        await waitForTabLoad(tab.id);
        const updated = await browser.tabs.get(tab.id);
        result = `Navigated to: ${updated.url}\nTitle: ${updated.title ?? "(no title)"}`;
        break;
      }

      case "new_tab": {
        const url = String(params.url ?? "").trim() || undefined;
        const tab = await browser.tabs.create({ url, active: true });
        if (url) await waitForTabLoad(tab.id);
        result = `Opened new tab (id=${tab.id}): ${tab.url ?? "about:newtab"}`;
        break;
      }

      case "close_tab": {
        const tabId = params.tabId != null ? Number(params.tabId) : null;
        if (tabId == null || !Number.isFinite(tabId))
          throw new Error("No valid tabId provided");
        const tab = await browser.tabs.get(tabId);
        await browser.tabs.remove(tabId);
        result = `Closed tab ${tabId}: ${tab.title ?? tab.url}`;
        break;
      }

      case "switch_tab": {
        const tabId = params.tabId != null ? Number(params.tabId) : null;
        if (tabId == null || !Number.isFinite(tabId))
          throw new Error("No valid tabId provided");
        await browser.tabs.update(tabId, { active: true });
        const tab = await browser.tabs.get(tabId);
        result = `Switched to tab ${tabId}: ${tab.title ?? tab.url}`;
        break;
      }

      case "go_back": {
        const tab = await getActiveTab();
        await browser.tabs.goBack(tab.id);
        await waitForTabLoad(tab.id);
        const updated = await browser.tabs.get(tab.id);
        result = `Navigated back. Now at: ${updated.url}`;
        break;
      }

      case "go_forward": {
        const tab = await getActiveTab();
        await browser.tabs.goForward(tab.id);
        await waitForTabLoad(tab.id);
        const updated = await browser.tabs.get(tab.id);
        result = `Navigated forward. Now at: ${updated.url}`;
        break;
      }

      case "reload": {
        const tab = await getActiveTab();
        await browser.tabs.reload(tab.id);
        await waitForTabLoad(tab.id);
        const updated = await browser.tabs.get(tab.id);
        result = `Reloaded. URL: ${updated.url}`;
        break;
      }

      // ── Screenshot ────────────────────────────────────────

      case "screenshot": {
        // Returns a base64 PNG data URL — backend saves it to disk
        const dataUrl = await browser.tabs.captureVisibleTab(null, {
          format: "png",
        });
        result = dataUrl;
        break;
      }

      // ── Execute arbitrary JS in the page context ──────────
      // Uses scripting.executeScript with world:'MAIN' so the code
      // runs in the page's own JS environment (not the extension sandbox).

      case "execute_js": {
        const code = String(params.code ?? "").trim();
        if (!code) throw new Error("No code provided");

        const tab = await getActiveTab();
        const injectionResults = await browser.scripting.executeScript({
          target: { tabId: tab.id },
          world: "MAIN",
          func: (codeStr) => {
            // Runs inside the PAGE context, not the extension sandbox
            // eslint-disable-next-line no-new-func
            return Function('"use strict";\n' + codeStr)();
          },
          args: [code],
        });

        const val = injectionResults?.[0]?.result;
        result =
          val !== undefined && val !== null
            ? String(val)
            : "Script executed (no return value)";
        break;
      }

      // ── DOM operations — delegated to content.js ──────────

      case "get_content":
      case "find_elements":
      case "click":
      case "type":
      case "scroll":
      case "hover":
      case "select_option": {
        const tab = await getActiveTab();
        result = await sendToContent(tab.id, action, params);
        break;
      }

      default:
        throw new Error(`Unknown action: "${action}"`);
    }

    console.log(`[Aurelius] ── COMMAND DONE ──────────────────────────`);
    console.log(`[Aurelius]   action : ${action}`);
    console.log(`[Aurelius]   result preview: ${String(result).slice(0, 120)}`);
    sendResult(id, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Aurelius] ✖ Command "${action}" failed: ${message}`);
    sendError(id, message);
  }
}

// ── WebSocket connection management ──────────────────────────

function connect() {
  if (
    ws &&
    (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
  )
    return;

  const safeUrl = forceWsProtocol(wsUrl);
  console.log(`[Aurelius] Connecting to ${safeUrl}…`);

  try {
    ws = new WebSocket(safeUrl);
  } catch (err) {
    console.error("[Aurelius] WebSocket constructor failed:", err.message);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log(`[Aurelius] Connected to Aurelius backend at ${safeUrl}`);
    isConnected = true;
    reconnectDelay = RECONNECT_BASE_DELAY_MS; // reset backoff on success
    ws.send(
      JSON.stringify({ type: "connected", version: "1.0", browser: "zen" }),
    );
    updateBadge(true);
  };

  ws.onmessage = async (event) => {
    console.log(`[Aurelius] ── WS MESSAGE RECEIVED ──────────────────`);
    console.log(`[Aurelius]   event.data type   : ${typeof event.data}`);
    console.log(
      `[Aurelius]   event.data preview: ${String(event.data).slice(0, 200)}`,
    );

    let msg;
    try {
      msg = JSON.parse(event.data);
      console.log(`[Aurelius]   parsed type : ${msg.type ?? "(no type)"}`);
      console.log(`[Aurelius]   parsed id   : ${msg.id ?? "(no id)"}`);
      console.log(`[Aurelius]   parsed keys : ${Object.keys(msg).join(", ")}`);
    } catch (err) {
      console.error(`[Aurelius] ✖ Could not parse message: ${err.message}`);
      console.error(
        `[Aurelius]   raw data: ${String(event.data).slice(0, 200)}`,
      );
      return;
    }

    if (msg.type === "command") {
      console.log(`[Aurelius]   → dispatching to handleCommand`);
      await handleCommand(msg);
    } else {
      console.warn(
        `[Aurelius]   ⚠ Unknown message type: "${msg.type}" — ignoring`,
      );
    }
  };

  ws.onerror = (event) => {
    // onclose will fire immediately after, which handles reconnect
    console.error(`[Aurelius] WebSocket error on ${safeUrl} — will reconnect`);
    // Detect if Firefox silently upgraded to wss:// despite our forceWsProtocol call
    if (
      safeUrl.startsWith("ws://") &&
      event.target &&
      event.target.url &&
      event.target.url.startsWith("wss://")
    ) {
      console.error(
        "[Aurelius] ⚠ Firefox upgraded ws:// → wss:// automatically. Go to Zen settings → Privacy & Security → HTTPS-Only Mode and add an exception for localhost.",
      );
    }
  };

  ws.onclose = () => {
    console.log("[Aurelius] Connection closed");
    isConnected = false;
    ws = null;
    updateBadge(false);
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  console.log(`[Aurelius] Reconnecting in ${reconnectDelay / 1000}s…`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 1.5, RECONNECT_MAX_DELAY_MS);
    connect();
  }, reconnectDelay);
}

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.onclose = null; // suppress reconnect when intentionally disconnecting
    ws.close();
    ws = null;
    isConnected = false;
    updateBadge(false);
  }
}

// ── Popup / options message bridge ───────────────────────────
browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "get_status") {
    sendResponse({ isConnected, wsUrl });
    return true;
  }

  if (msg.type === "set_ws_url") {
    const newUrl = forceWsProtocol(String(msg.url ?? "").trim());
    if (!newUrl) {
      sendResponse({ ok: false, error: "Empty URL" });
      return true;
    }
    wsUrl = newUrl;
    browser.storage.local.set({ wsUrl: newUrl });
    disconnect();
    setTimeout(connect, 400);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "reconnect") {
    disconnect();
    setTimeout(connect, 300);
    sendResponse({ ok: true });
    return true;
  }
});

// ── Boot ─────────────────────────────────────────────────────
(async () => {
  await loadWsUrl();
  connect();
})();
