// ============================================================
// Aurelius Browser Control — popup.js
// Displays connection status and lets the user configure the
// backend WebSocket URL.
// ============================================================

const DEFAULT_WS_URL = "ws://localhost:3001/browser/ws";

const statusDot = document.getElementById("statusDot");
const statusLabel = document.getElementById("statusLabel");
const statusSub = document.getElementById("statusSub");
const wsUrlInput = document.getElementById("wsUrlInput");
const saveUrlBtn = document.getElementById("saveUrlBtn");
const reconnectBtn = document.getElementById("reconnectBtn");
const resetUrlBtn = document.getElementById("resetUrlBtn");
const toast = document.getElementById("toast");

// ── Toast helper ─────────────────────────────────────────────

let toastTimer = null;

function showToast(msg, isError = false) {
  toast.textContent = msg;
  toast.className = "toast visible " + (isError ? "error" : "success");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.className = "toast";
  }, 2500);
}

// ── Render connection state ───────────────────────────────────

function renderStatus(isConnected, wsUrl) {
  const state = isConnected ? "connected" : "disconnected";
  const label = isConnected ? "Connected" : "Disconnected";
  const sub = isConnected
    ? wsUrl || DEFAULT_WS_URL
    : "Not connected to Aurelius backend";

  statusDot.className = `status-dot ${state}`;
  statusLabel.className = `status-label ${state}`;
  statusLabel.textContent = label;
  statusSub.textContent = sub;
}

// ── Load state from background script ────────────────────────

async function loadStatus() {
  try {
    const res = await browser.runtime.sendMessage({ type: "get_status" });
    renderStatus(res.isConnected, res.wsUrl);
    // Populate input only if the user isn't actively editing it
    if (document.activeElement !== wsUrlInput) {
      wsUrlInput.value = res.wsUrl || DEFAULT_WS_URL;
    }
  } catch {
    renderStatus(false, null);
  }
}

// ── Save new WS URL ───────────────────────────────────────────

saveUrlBtn.addEventListener("click", async () => {
  const url = wsUrlInput.value.trim();

  if (!url) {
    showToast("URL cannot be empty.", true);
    return;
  }

  if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
    showToast("URL must start with ws:// or wss://", true);
    return;
  }

  try {
    const res = await browser.runtime.sendMessage({ type: "set_ws_url", url });
    if (res.ok) {
      showToast("Saved — reconnecting…");
      setTimeout(loadStatus, 1200);
    } else {
      showToast(res.error || "Failed to save.", true);
    }
  } catch (err) {
    showToast("Error: " + (err.message || String(err)), true);
  }
});

// ── Reset to default URL ──────────────────────────────────────

resetUrlBtn.addEventListener("click", async () => {
  wsUrlInput.value = DEFAULT_WS_URL;
  try {
    const res = await browser.runtime.sendMessage({
      type: "set_ws_url",
      url: DEFAULT_WS_URL,
    });
    if (res.ok) {
      showToast("Reset to default URL.");
      setTimeout(loadStatus, 1200);
    } else {
      showToast(res.error || "Reset failed.", true);
    }
  } catch (err) {
    showToast("Error: " + (err.message || String(err)), true);
  }
});

// ── Manual reconnect ─────────────────────────────────────────

reconnectBtn.addEventListener("click", async () => {
  try {
    await browser.runtime.sendMessage({ type: "reconnect" });
    showToast("Reconnecting…");
    setTimeout(loadStatus, 1200);
  } catch (err) {
    showToast("Error: " + (err.message || String(err)), true);
  }
});

// ── Save on Enter key in URL input ───────────────────────────

wsUrlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveUrlBtn.click();
});

// ── Poll status every 2s while popup is open ─────────────────

loadStatus();
const pollTimer = setInterval(loadStatus, 2000);
window.addEventListener("unload", () => clearInterval(pollTimer));
