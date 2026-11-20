// Dirgha v2 — Generation-Bound Compact Agent-DOM & Lokahi Rule 14 Approval Ribbon
// Harvests Traycer's monotonic `generation` snapshot contract + Xiryn's `<untrusted>` & origin-bound vault check.

(() => {
  let domGeneration = 0;

  // Bump generation automatically whenever the DOM mutates so stale `idx` refs fail closed
  const observer = new MutationObserver(() => {
    domGeneration += 1;
  });
  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  }

  /**
   * Extract Compact Agent-DOM (~350 tokens vs 25,000+ raw HTML tokens).
   */
  function extractCompactAgentDom() {
    domGeneration += 1;
    const selector = 'a, button, input, select, textarea, [role="button"], [role="link"], h1, h2, h3';
    const elements = Array.from(document.querySelectorAll(selector));
    const nodes = [];
    let idx = 1;

    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role") || tag;
      const label =
        el.getAttribute("aria-label") ||
        el.getAttribute("placeholder") ||
        (el.innerText ? el.innerText.trim().slice(0, 80) : null);
      const interactive = ["a", "button", "input", "select", "textarea"].includes(tag) ||
        ["button", "link", "checkbox", "textbox"].includes(role);

      // Classify payment/submit/delete buttons as S2HardwareOrCritical (triggers Lokahi Rule 14 45s Ribbon)
      const lowerLabel = (label || "").toLowerCase();
      const isCritical =
        interactive &&
        (lowerLabel.includes("pay") ||
          lowerLabel.includes("checkout") ||
          lowerLabel.includes("delete") ||
          lowerLabel.includes("promote") ||
          lowerLabel.includes("transfer"));

      el.setAttribute("data-dirgha-gen", String(domGeneration));
      el.setAttribute("data-dirgha-idx", String(idx));

      nodes.push({
        idx,
        role,
        label,
        text: label,
        value: "value" in el ? String(el.value || "").slice(0, 64) : null,
        interactive,
        safety_class: isCritical ? "S2HardwareOrCritical" : "S0ReadOnly",
      });
      idx += 1;
    }

    return {
      generation: domGeneration,
      tab_id: window.location.pathname || "active_tab",
      origin: window.location.origin,
      dom_blake3: "client_pending_native_hash",
      nodes,
    };
  }

  /**
   * Render the Lokahi Rule 14 Approval Ribbon (45-second Ahimsa countdown; silence = DENY_TIMEOUT).
   */
  function showLokahiApprovalRibbon(actionSummary) {
    return new Promise((resolve) => {
      const existing = document.getElementById("dirgha-lokahi-ribbon");
      if (existing) existing.remove();

      const bar = document.createElement("div");
      bar.id = "dirgha-lokahi-ribbon";
      bar.style.cssText = [
        "position:fixed",
        "top:0",
        "left:0",
        "right:0",
        "z-index:2147483647",
        "background:#111827",
        "color:#f9fafb",
        "padding:10px 16px",
        "font-family:system-ui,sans-serif",
        "font-size:13px",
        "display:flex",
        "justify-content:space-between",
        "align-items:center",
        "border-bottom:2px solid #f59e0b",
      ].join(";");

      let remaining = 45;
      const textSpan = document.createElement("span");
      textSpan.textContent = `[Lokahi Rule 14] Approve S2 Action (${actionSummary})? Auto-deny in ${remaining}s`;

      const btnGroup = document.createElement("div");
      btnGroup.style.cssText = "display:flex;gap:8px;";

      const approveBtn = document.createElement("button");
      approveBtn.textContent = "Approve (Sign)";
      approveBtn.style.cssText = "background:#059669;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;";

      const denyBtn = document.createElement("button");
      denyBtn.textContent = "Deny";
      denyBtn.style.cssText = "background:#dc2626;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;";

      const timer = setInterval(() => {
        remaining -= 1;
        textSpan.textContent = `[Lokahi Rule 14] Approve S2 Action (${actionSummary})? Auto-deny in ${remaining}s`;
        if (remaining <= 0) {
          clearInterval(timer);
          bar.remove();
          resolve({ approved: false, waited_ms: 45000 });
        }
      }, 1000);

      approveBtn.onclick = () => {
        clearInterval(timer);
        bar.remove();
        resolve({ approved: true, waited_ms: (45 - remaining) * 1000 });
      };
      denyBtn.onclick = () => {
        clearInterval(timer);
        bar.remove();
        resolve({ approved: false, waited_ms: (45 - remaining) * 1000 });
      };

      btnGroup.appendChild(approveBtn);
      btnGroup.appendChild(denyBtn);
      bar.appendChild(textSpan);
      bar.appendChild(btnGroup);
      document.body.appendChild(bar);
    });
  }

  const runtime = globalThis.browser?.runtime || globalThis.chrome?.runtime;
  if (runtime && runtime.onMessage) {
    runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === "DIRGHA_SNAPSHOT_DOM") {
        sendResponse(extractCompactAgentDom());
        return false;
      }
      if (msg.type === "DIRGHA_RULE14_APPROVAL") {
        showLokahiApprovalRibbon(msg.summary || "Critical Action").then(sendResponse);
        return true;
      }
      return false;
    });
  }
})();
