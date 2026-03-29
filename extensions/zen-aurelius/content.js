// ============================================================
// Aurelius Browser Control — content.js
// DOM operations handler injected into every page.
// Communicates with background.js via browser.runtime.onMessage.
// ============================================================

// ── Element Finder ───────────────────────────────────────────
// Tries multiple strategies to locate an element from a
// human-readable or CSS selector string.

function findElement(selector) {
  if (!selector || typeof selector !== "string") {
    throw new Error("No selector provided");
  }

  const s = selector.trim();

  // Strategy 1: CSS selector (id, class, attribute, tag, or complex)
  const looksLikeCss =
    (/^[#.\[a-zA-Z*]/.test(s) && !s.includes(" ")) ||
    /^[#.\[]/.test(s) ||
    /\[.*\]/.test(s);

  if (looksLikeCss) {
    try {
      const el = document.querySelector(s);
      if (el) return el;
    } catch {
      // Not valid CSS — fall through to text strategies
    }
  }

  const needle = s.toLowerCase();

  // Strategy 2: Exact text match on interactive elements
  const interactive = document.querySelectorAll(
    "a, button, input, textarea, select, label, " +
      '[role="button"], [role="link"], [role="tab"], [role="menuitem"], ' +
      '[role="option"], [role="checkbox"], [role="radio"], [onclick], [tabindex]',
  );

  for (const el of interactive) {
    const text = (el.textContent || "").trim().toLowerCase();
    if (text === needle) return el;
  }

  // Strategy 3: Partial text match on interactive elements
  for (const el of interactive) {
    const text = (el.textContent || "").trim().toLowerCase();
    if (text.includes(needle)) return el;
  }

  // Strategy 4: aria-label match (exact then partial)
  for (const el of interactive) {
    const label = (el.getAttribute("aria-label") || "").toLowerCase();
    if (label === needle || label.includes(needle)) return el;
  }

  // Strategy 5: placeholder match
  const inputs = document.querySelectorAll("input, textarea");
  for (const el of inputs) {
    const ph = (el.getAttribute("placeholder") || "").toLowerCase();
    if (ph === needle || ph.includes(needle)) return el;
  }

  // Strategy 6: name / id / title attribute
  const all = document.querySelectorAll("*");
  for (const el of all) {
    const name = (el.getAttribute("name") || "").toLowerCase();
    const id = (el.getAttribute("id") || "").toLowerCase();
    const title = (el.getAttribute("title") || "").toLowerCase();
    if (name === needle || id === needle || title === needle) return el;
    if (name.includes(needle) || id.includes(needle) || title.includes(needle))
      return el;
  }

  throw new Error(`Element not found for selector: "${selector}"`);
}

// ── Type into an input (React / Vue / vanilla compatible) ────
function typeIntoElement(el, text) {
  if (!el) throw new Error("Element is null");

  el.focus();

  // Clear existing value
  el.value = "";

  // Use the native property setter to bypass framework value trapping.
  // Object.getOwnPropertyDescriptor on the prototype gives us the setter
  // that React/Vue listen for via property interception.
  const proto = Object.getPrototypeOf(el);
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");

  if (descriptor && descriptor.set) {
    descriptor.set.call(el, text);
  } else {
    el.value = text;
  }

  // Dispatch synthetic events so framework state updates
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));

  // For contenteditable elements
  if (el.isContentEditable) {
    el.textContent = text;
    el.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: text,
        inputType: "insertText",
      }),
    );
  }
}

// ── Page content extractor ───────────────────────────────────
function extractPageContent() {
  const title = document.title || "(no title)";
  const url = window.location.href;

  // Remove script, style, svg, noscript nodes from a clone
  const clone = document.body ? document.body.cloneNode(true) : null;
  if (clone) {
    const garbage = clone.querySelectorAll(
      "script, style, svg, noscript, iframe, canvas",
    );
    garbage.forEach((n) => n.remove());
  }

  const raw = (clone ? clone.innerText : document.body?.innerText) || "";
  // Collapse excessive whitespace
  const text = raw
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .trim();
  const words = text.split(/\s+/).length;

  const MAX_CHARS = 12_000;
  const truncated =
    text.length > MAX_CHARS
      ? text.slice(0, MAX_CHARS) +
        `\n\n… [truncated — ${text.length - MAX_CHARS} more chars]`
      : text;

  return `Title: ${title}\nURL: ${url}\nWords: ~${words}\n\n---\n\n${truncated}`;
}

// ── Find & describe interactive elements on the page ─────────
function findInteractiveElements(filterQuery) {
  const candidates = document.querySelectorAll(
    'a[href], button, input:not([type="hidden"]), textarea, select, ' +
      '[role="button"], [role="link"], [role="tab"], [role="menuitem"], ' +
      '[role="textbox"], [role="checkbox"], [role="radio"], [role="combobox"]',
  );

  const needle = filterQuery ? filterQuery.toLowerCase() : null;
  const results = [];

  for (const el of candidates) {
    // Skip invisible elements
    const style = window.getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    )
      continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    const tag = el.tagName.toLowerCase();
    const id = el.getAttribute("id") || "";
    const type = el.getAttribute("type") || "";
    const text = (el.textContent || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 80);
    const ariaLabel = el.getAttribute("aria-label") || "";
    const placeholder = el.getAttribute("placeholder") || "";
    const href = el.getAttribute("href") || "";
    const name = el.getAttribute("name") || "";
    const value = (el.value || "").toString().slice(0, 60);
    const role = el.getAttribute("role") || "";

    const descriptor = [tag, type, id, text, ariaLabel, placeholder, href, name]
      .join(" ")
      .toLowerCase();

    if (needle && !descriptor.includes(needle)) continue;

    const parts = [
      `<${tag}${type ? ` type="${type}"` : ""}${role ? ` role="${role}"` : ""}>`,
    ];
    if (id) parts.push(`  id: "${id}"`);
    if (text) parts.push(`  text: "${text}"`);
    if (ariaLabel) parts.push(`  aria-label: "${ariaLabel}"`);
    if (placeholder) parts.push(`  placeholder: "${placeholder}"`);
    if (href) parts.push(`  href: "${href.slice(0, 80)}"`);
    if (name) parts.push(`  name: "${name}"`);
    if (value) parts.push(`  value: "${value}"`);

    results.push(parts.join("\n"));

    if (results.length >= 50) break; // cap to avoid overwhelming the LLM
  }

  if (results.length === 0) {
    return needle
      ? `No interactive elements found matching "${filterQuery}".`
      : "No visible interactive elements found on this page.";
  }

  return `Found ${results.length} interactive element(s)${needle ? ` matching "${filterQuery}"` : ""}:\n\n${results.join("\n\n")}`;
}

// ── Scroll handler ───────────────────────────────────────────
function handleScroll(params) {
  const { selector, direction = "down", amount = 300, x, y } = params;

  // Scroll to absolute coordinates
  if (x != null && y != null) {
    window.scrollTo({ top: Number(y), left: Number(x), behavior: "smooth" });
    return `Scrolled to (${x}, ${y})`;
  }

  // Scroll a specific element into view
  if (selector) {
    const el = findElement(selector);
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    return `Scrolled to element: "${selector}"`;
  }

  // Directional page scroll
  const px = Number(amount) || 300;
  const map = { down: [0, px], up: [0, -px], right: [px, 0], left: [-px, 0] };
  const [dx, dy] = map[direction] ?? [0, px];
  window.scrollBy({ top: dy, left: dx, behavior: "smooth" });
  return `Scrolled ${direction} by ${Math.abs(dx || dy)}px`;
}

// ── Hover handler ────────────────────────────────────────────
function handleHover(params) {
  const el = findElement(params.selector);
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const opts = {
    bubbles: true,
    cancelable: true,
    clientX: cx,
    clientY: cy,
  };

  el.dispatchEvent(new MouseEvent("mouseover", opts));
  el.dispatchEvent(new MouseEvent("mouseenter", { ...opts, bubbles: false }));
  el.dispatchEvent(new MouseEvent("mousemove", opts));

  const tag = el.tagName.toLowerCase();
  const hint =
    el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 40) || "";
  return `Hovered over <${tag}>${hint ? `: "${hint}"` : ""}`;
}

// ── Select option handler ─────────────────────────────────────
function handleSelectOption(params) {
  const el = findElement(params.selector);

  if (el.tagName.toLowerCase() !== "select") {
    throw new Error(
      `Element "${params.selector}" is not a <select> (found <${el.tagName.toLowerCase()}>)`,
    );
  }

  const value = params.value != null ? String(params.value) : null;
  const label = params.label != null ? String(params.label) : null;
  const index = params.index != null ? Number(params.index) : null;

  let matched = false;

  for (const option of el.options) {
    const matchValue = value != null && option.value === value;
    const matchLabel =
      label != null &&
      option.text.trim().toLowerCase().includes(label.toLowerCase());
    const matchIndex = index != null && option.index === index;

    if (matchValue || matchLabel || matchIndex) {
      el.value = option.value;
      matched = true;
      break;
    }
  }

  if (!matched) {
    const available = Array.from(el.options)
      .map((o) => `"${o.text}" (value="${o.value}")`)
      .join(", ");
    throw new Error(`Option not found. Available: ${available}`);
  }

  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("input", { bubbles: true }));

  return `Selected option in <select>: value="${el.value}"`;
}

// ── Message listener (receives commands from background.js) ──
browser.runtime.onMessage.addListener(async (msg, _sender, sendResponse) => {
  if (!msg || typeof msg.action !== "string") return false;

  const { action, params = {} } = msg;

  let result;
  let error;

  try {
    switch (action) {
      case "get_content": {
        result = extractPageContent();
        break;
      }

      case "find_elements": {
        const filter = params.filter ? String(params.filter) : null;
        result = findInteractiveElements(filter);
        break;
      }

      case "click": {
        const el = findElement(params.selector);

        // Scroll element into view so coordinates are valid
        el.scrollIntoView({ block: "nearest", inline: "nearest" });

        const rect = el.getBoundingClientRect();
        const cx = Math.round(rect.left + rect.width / 2);
        const cy = Math.round(rect.top + rect.height / 2);

        const base = {
          bubbles: true,
          cancelable: true,
          composed: true, // pierce shadow DOM (Polymer / LitElement)
          view: window,
          clientX: cx,
          clientY: cy,
        };

        // 1. Fire mouseenter on the parent row first so hover-dependent
        //    elements (e.g. YouTube Music's inline play button) become
        //    visible and interactive before we try to click them.
        const parent = el.parentElement;
        if (parent) {
          parent.dispatchEvent(
            new MouseEvent("mouseenter", { ...base, bubbles: false }),
          );
          parent.dispatchEvent(new MouseEvent("mouseover", base));
          parent.dispatchEvent(new MouseEvent("mousemove", base));
        }

        // 2. Full hover → press → release → click sequence on the target
        el.dispatchEvent(
          new MouseEvent("mouseenter", { ...base, bubbles: false }),
        );
        el.dispatchEvent(new MouseEvent("mouseover", base));
        el.dispatchEvent(new MouseEvent("mousemove", base));
        el.dispatchEvent(
          new MouseEvent("mousedown", { ...base, button: 0, buttons: 1 }),
        );
        el.dispatchEvent(
          new MouseEvent("mouseup", { ...base, button: 0, buttons: 0 }),
        );
        el.dispatchEvent(
          new MouseEvent("click", { ...base, button: 0, buttons: 0 }),
        );

        // 3. Native focus + click as final fallback
        el.focus?.();
        el.click();

        const tag = el.tagName.toLowerCase();
        const hint =
          el.getAttribute("aria-label") ||
          el.textContent?.trim().slice(0, 40) ||
          "";
        result = `Clicked <${tag}>${hint ? `: "${hint}"` : ""}`;
        break;
      }

      case "type": {
        const text = params.text != null ? String(params.text) : "";
        const el = findElement(params.selector);
        typeIntoElement(el, text);

        const tag = el.tagName.toLowerCase();
        const masked = params.secret
          ? "•".repeat(text.length)
          : `"${text.slice(0, 50)}${text.length > 50 ? "…" : ""}"`;
        result = `Typed ${masked} into <${tag}>`;
        break;
      }

      case "scroll": {
        result = handleScroll(params);
        break;
      }

      case "hover": {
        result = handleHover(params);
        break;
      }

      case "hover_and_click": {
        // Hover the parent row first (makes hidden buttons visible),
        // wait a short moment, then fire the full click sequence on the target.
        // Used by automations on SPAs like YouTube Music.
        const rowSel = params.row_selector;
        const btnSel = params.selector;
        const delayMs = Math.min(Number(params.delay_ms ?? 400), 3000);

        const row = rowSel ? findElement(rowSel) : null;
        if (row) {
          const rr = row.getBoundingClientRect();
          const rx = Math.round(rr.left + rr.width / 2);
          const ry = Math.round(rr.top + rr.height / 2);
          const rOpts = {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            clientX: rx,
            clientY: ry,
          };
          row.dispatchEvent(
            new MouseEvent("mouseenter", { ...rOpts, bubbles: false }),
          );
          row.dispatchEvent(new MouseEvent("mouseover", rOpts));
          row.dispatchEvent(new MouseEvent("mousemove", rOpts));
        }

        await new Promise((r) => setTimeout(r, delayMs));

        const btn = findElement(btnSel);
        btn.scrollIntoView({ block: "nearest", inline: "nearest" });

        const br = btn.getBoundingClientRect();
        const bx = Math.round(br.left + br.width / 2);
        const by = Math.round(br.top + br.height / 2);
        const bOpts = {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          clientX: bx,
          clientY: by,
        };

        btn.dispatchEvent(
          new MouseEvent("mouseenter", { ...bOpts, bubbles: false }),
        );
        btn.dispatchEvent(new MouseEvent("mouseover", bOpts));
        btn.dispatchEvent(new MouseEvent("mousemove", bOpts));
        btn.dispatchEvent(
          new MouseEvent("mousedown", { ...bOpts, button: 0, buttons: 1 }),
        );
        btn.dispatchEvent(
          new MouseEvent("mouseup", { ...bOpts, button: 0, buttons: 0 }),
        );
        btn.dispatchEvent(
          new MouseEvent("click", { ...bOpts, button: 0, buttons: 0 }),
        );
        btn.focus?.();
        btn.click();

        const tag = btn.tagName.toLowerCase();
        const hint =
          btn.getAttribute("aria-label") ||
          btn.textContent?.trim().slice(0, 40) ||
          "";
        result = `Hovered row + clicked <${tag}>${hint ? `: "${hint}"` : ""}`;
        break;
      }

      case "select_option": {
        result = handleSelectOption(params);
        break;
      }

      default:
        error = `Unknown DOM action: "${action}"`;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  sendResponse(error ? { error } : { data: result });
  return true; // keep message channel open for async sendResponse
});
