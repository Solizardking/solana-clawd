/* pay/public/app.js
 *
 * Storefront frontend for the x402.wtf real-store integration.
 *  - Renders the merchant catalog (manifest v2.1)
 *  - Probes the live /api/x402wtf/* routes
 *  - Powers the "Live Checkout" lab (challenge -> payment -> verify)
 *
 * No bundler. Plain ES2020. Works inside wrangler dev and any static host.
 */

const $ = (sel) => document.querySelector(sel);
const STORE_BASE_DEFAULT = "";
const ROUTES = {
  manifest: "/api/x402wtf/manifest",
  info: "/api/x402wtf/info",
  registry: "/api/x402wtf/registry",
  agents: "/api/x402wtf/agents",
  agentChat: "/api/x402wtf/agent/chat",
  checkout: "/api/x402wtf/checkout",
  verify: "/api/x402wtf/verify",
  register: "/api/x402wtf/register",
};

const state = {
  manifest: null,
  challenge: null,
  products: [],
};

// ---- Utilities ------------------------------------------------------------

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { data = { _raw: text }; }
  return { ok: response.ok, status: response.status, data, headers: response.headers };
}

function setText(sel, value) {
  const el = $(sel);
  if (el) el.textContent = value == null ? "—" : value;
}

function truncate(value, head, tail) {
  if (!value) return "—";
  if (value.length <= head + tail + 1) return value;
  return value.slice(0, head) + "…" + value.slice(-tail);
}

const HTML_AMP = String.fromCharCode(38);   // &
const HTML_LT  = String.fromCharCode(60);   // <
const HTML_GT  = String.fromCharCode(62);   // >
const HTML_QUOT = String.fromCharCode(34);  // "
const HTML_APOS = String.fromCharCode(39);  // '

function escape(value) {
  if (value == null) return "";
  return String(value)
    .replace(new RegExp(HTML_AMP, "g"), HTML_AMP + "amp;")
    .replace(new RegExp(HTML_LT, "g"), HTML_AMP + "lt;")
    .replace(new RegExp(HTML_GT, "g"), HTML_AMP + "gt;")
    .replace(new RegExp(HTML_QUOT, "g"), HTML_AMP + "quot;")
    .replace(new RegExp(HTML_APOS, "g"), HTML_AMP + "#39;");
}

function pretty(value) {
  return escape(JSON.stringify(value, null, 2));
}

// ---- Status panel ---------------------------------------------------------

async function loadStatus() {
  const [manifestRes, infoRes, registryRes] = await Promise.all([
    fetchJson(ROUTES.manifest).catch((err) => ({ ok: false, data: { error: err.message } })),
    fetchJson(ROUTES.info).catch((err) => ({ ok: false, data: { error: err.message } })),
    fetchJson(ROUTES.registry).catch((err) => ({ ok: false, data: { error: err.message } })),
  ]);

  if (manifestRes.ok && manifestRes.data) {
    state.manifest = manifestRes.data;
    const m = manifestRes.data.manifest || manifestRes.data.x402 || {};
    const issued = m.issuedAt ? m.issuedAt.slice(0, 19) : "?";
    setText("#s-manifest", "v" + (m.version || "?") + " · " + issued + "Z");
  } else {
    setText("#s-manifest", "offline");
  }

  const x402 = (manifestRes.data && manifestRes.data.x402) || {};
  setText("#s-registry", (x402.registry && x402.registry.url) || "https://x402.wtf/agents/registry");
  setText("#s-payments", (x402.registry && x402.registry.paymentsUrl) || "https://x402.wtf/payments");

  const merchant = x402.merchant || {};
  setText("#s-operator", truncate(merchant.operatorWallet, 6, 6));
  setText("#s-fee", truncate(merchant.feePayerWallet, 6, 6));
  setText("#s-network", merchant.network || "solana-mainnet");

  setText("#f-operator", merchant.operatorWallet || "—");
  setText("#f-fee", merchant.feePayerWallet || "—");

  const infoOk = infoRes.ok ? "online" : ("http " + infoRes.status);
  const regOk  = registryRes.ok ? "online" : ("http " + registryRes.status);
  const note = $("#status-note");
  if (note) {
    note.innerHTML =
      "<code>/api/x402wtf/info</code> → <strong>" + infoOk + "</strong> · " +
      "<code>/api/x402wtf/registry</code> → <strong>" + regOk + "</strong>";
  }
}

// ---- Catalog grid ---------------------------------------------------------

function renderCatalog() {
  const grid = $("#product-grid");
  const select = $("#lab-product");
  grid.innerHTML = "";
  select.innerHTML = "";

  const products =
    (state.manifest && state.manifest.x402 && state.manifest.x402.products) ||
    (state.manifest && state.manifest.products) ||
    [];

  if (!products.length) {
    grid.innerHTML = '<p class="muted">No products in manifest. The worker may be offline.</p>';
    return;
  }

  for (const product of products) {
    const card = document.createElement("button");
    card.className = "product-card";
    card.type = "button";
    card.dataset.productId = product.id;
    card.innerHTML =
      '<div class="avatar">' + escape(product.avatar || "🦞") + '</div>' +
      '<div class="meta">' +
        '<div class="title">' + escape(product.title) + '</div>' +
        '<div class="summary">' + escape(product.summary) + '</div>' +
        '<div class="price">$' + escape(product.priceUsd) + ' USDC</div>' +
        '<div class="path"><code>' + escape(product.challengePath) + '</code></div>' +
      '</div>';
    card.addEventListener("click", () => {
      select.value = product.id;
      $("#lab-product").dispatchEvent(new Event("change"));
      $("#lab-challenge").focus();
    });
    grid.appendChild(card);

    const option = document.createElement("option");
    option.value = product.id;
    option.textContent = (product.avatar || "🦞") + " " + product.title + " — $" + product.priceUsd + " USDC";
    select.appendChild(option);
  }
}

// ---- Lab: create challenge + verify payment -----------------------------

async function createChallenge() {
  const productId = $("#lab-product").value;
  const wallet = $("#lab-wallet").value.trim();
  const out = $("#lab-challenge-out");
  out.textContent = "// requesting challenge…";

  const res = await fetchJson(ROUTES.checkout, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product: productId, wallet: wallet || undefined }),
  });

  state.challenge = res.data;
  out.textContent = pretty(res.data);
  out.dataset.lastStatus = String(res.status);
  out.classList.toggle("warn", res.status === 402);
}

async function verifyPayment() {
  const out = $("#lab-receipt-out");
  const payment = $("#lab-payment").value.trim();
  const productId = $("#lab-product").value;

  if (!payment) {
    out.textContent = "// paste a payment-signature first";
    out.classList.add("warn");
    return;
  }

  out.textContent = "// verifying…";
  out.classList.remove("warn");
  out.classList.remove("ok");

  const res = await fetchJson(ROUTES.checkout, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Payment": payment,
      "X-Clawd-Product": productId,
    },
    body: JSON.stringify({ product: productId, payment }),
  });

  out.textContent = pretty(res.data);
  out.dataset.lastStatus = String(res.status);
  const ok = res.ok && (res.data && (res.data.verified === true || res.data.ok === true));
  out.classList.toggle("ok", !!ok);
  if (!ok) out.classList.add("warn");
}

// ---- Boot ----------------------------------------------------------------

window.addEventListener("DOMContentLoaded", async () => {
  $("#lab-challenge").addEventListener("click", createChallenge);
  $("#lab-verify").addEventListener("click", verifyPayment);
  await loadStatus();
  renderCatalog();
});
