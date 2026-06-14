// Solana Clawd pAGENT — Background Service Worker
// Manages connection state and badge updates

const DEFAULT_API = 'http://127.0.0.1:7777';
const LOCAL_API_CANDIDATES = [
  'http://127.0.0.1:7777',
  'http://127.0.0.1:18800',
  'http://localhost:7777',
  'http://localhost:18800',
];
const LEGACY_APIS = new Set([
  'https://nanobot-backend-production.up.railway.app',
]);
const TRUSTED_EXTERNAL_ORIGIN_PATTERNS = [
  /^https:\/\/(?:[^/]+\.)?x402\.wtf$/,
  /^https:\/\/(?:[^/]+\.)?cheshireterminal\.ai$/,
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
];
const EXTERNAL_PROXY_PATHS = new Set([
  '/api/status',
  '/api/chat',
  '/api/run',
  '/api/trade',
  '/api/agents',
  '/api/wallet',
  '/api/wallet/send',
  '/api/wallet/swap',
  '/api/wallet/portfolio',
  '/api/wallet/tokens',
  '/api/wallet/history',
  '/api/telegram/status',
  '/api/telegram/session',
  '/api/telegram/register',
  '/api/telegram/config',
]);
const EXTERNAL_PROXY_METHODS = new Set(['GET', 'POST']);
const MAX_EXTERNAL_PROXY_BODY_BYTES = 64 * 1024;
const SITE_ORIGIN = 'https://x402.wtf';

function normalizeSecret(value) {
  return String(value || '').trim();
}

function gatewayAuthHeaders(secret) {
  const trimmed = normalizeSecret(secret);
  if (!trimmed) return {};
  return {
    'Authorization': `Bearer ${trimmed}`,
    'X-Clawd-Secret': trimmed,
  };
}

function trustedExternalOrigin(origin) {
  const value = String(origin || '').replace(/\/+$/, '');
  return TRUSTED_EXTERNAL_ORIGIN_PATTERNS.some(pattern => pattern.test(value));
}

function senderOrigin(sender) {
  if (sender?.origin) return sender.origin;
  if (sender?.url) {
    try {
      return new URL(sender.url).origin;
    } catch {}
  }
  return '';
}

function normalizeProxyPath(path) {
  const raw = String(path || '').trim();
  if (!raw.startsWith('/')) return '';
  try {
    const parsed = new URL(raw, DEFAULT_API);
    return parsed.pathname + parsed.search;
  } catch {
    return '';
  }
}

function proxyPathAllowed(path) {
  const normalized = normalizeProxyPath(path);
  if (!normalized) return false;
  const pathname = normalized.split('?')[0];
  return EXTERNAL_PROXY_PATHS.has(pathname);
}

function phantomBrowseUrl(targetUrl, refUrl = SITE_ORIGIN) {
  const target = String(targetUrl || SITE_ORIGIN).trim();
  let parsedTarget;
  try {
    parsedTarget = new URL(target);
  } catch {
    parsedTarget = new URL(SITE_ORIGIN);
  }

  if (!['https:', 'http:'].includes(parsedTarget.protocol)) {
    parsedTarget = new URL(SITE_ORIGIN);
  }

  let parsedRef;
  try {
    parsedRef = new URL(String(refUrl || SITE_ORIGIN));
  } catch {
    parsedRef = new URL(SITE_ORIGIN);
  }

  const query = new URLSearchParams({ ref: parsedRef.origin });
  return `https://phantom.app/ul/browse/${encodeURIComponent(parsedTarget.href)}?${query.toString()}`;
}

async function externalStatus() {
  const { url, secret } = await getNanobotUrl();
  const [daemon, pagent] = await Promise.allSettled([
    resolveReachableApi(url, secret).then(async api => {
      const r = await fetch(api + '/api/status', {
        signal: AbortSignal.timeout(2500),
        headers: gatewayAuthHeaders(secret),
      });
      return { api, ok: r.ok, status: r.status, data: r.ok ? await r.json() : null };
    }),
    checkPagentStatus(),
  ]);

  return {
    ok: true,
    extension: {
      id: chrome.runtime.id,
      version: chrome.runtime.getManifest().version,
    },
    clawd: daemon.status === 'fulfilled'
      ? { online: daemon.value.ok, url: daemon.value.api, status: daemon.value.status, data: daemon.value.data }
      : { online: false, error: daemon.reason?.message || 'offline' },
    pagent: pagent.status === 'fulfilled' ? pagent.value : { online: false },
  };
}

async function proxyClawdApi(msg) {
  const method = String(msg.method || 'GET').toUpperCase();
  const path = normalizeProxyPath(msg.path);
  if (!EXTERNAL_PROXY_METHODS.has(method)) {
    throw new Error('method not allowed');
  }
  if (!proxyPathAllowed(path)) {
    throw new Error('path not allowed');
  }

  const body = msg.body == null ? null : JSON.stringify(msg.body);
  if (body && body.length > MAX_EXTERNAL_PROXY_BODY_BYTES) {
    throw new Error('body too large');
  }

  const { url: savedApi, secret } = await getNanobotUrl();
  const api = await resolveReachableApi(savedApi, secret);
  const headers = gatewayAuthHeaders(secret);
  if (body) headers['Content-Type'] = 'application/json';

  const response = await fetch(api + path, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(Number(msg.timeoutMs) || 30000),
  });
  const text = await response.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}

  return {
    ok: response.ok,
    status: response.status,
    url: api,
    data,
  };
}

async function openPhantom(msg, origin) {
  const url = phantomBrowseUrl(msg.url, origin || SITE_ORIGIN);
  await chrome.tabs.create({ url });
  return { ok: true, url };
}

async function handleExternalMessage(msg, sender) {
  const origin = senderOrigin(sender);
  if (!trustedExternalOrigin(origin)) {
    return { ok: false, error: 'origin not allowed' };
  }

  switch (msg?.type) {
    case 'CLAWD_EXTENSION_STATUS':
      return externalStatus();
    case 'CLAWD_PROXY_API':
      return proxyClawdApi(msg);
    case 'CLAWD_EXECUTE_AGENT_TASK':
      return executeAgentTask(msg.task).then(result => ({ ok: true, result }));
    case 'CLAWD_STOP_AGENT_TASK':
      await fetch(`${MCP_BRIDGE_URL}/stop`, { method: 'POST', signal: AbortSignal.timeout(3000) });
      return { ok: true };
    case 'CLAWD_OPEN_PHANTOM':
      return openPhantom(msg, origin);
    case 'CLAWD_SAVE_CONNECT_BUNDLE':
      await saveExternalConnectBundle(msg.bundle || msg.data || {});
      return { ok: true };
    default:
      return { ok: false, error: 'unknown message type' };
  }
}

async function saveExternalConnectBundle(bundle) {
  const data = typeof bundle === 'string' ? JSON.parse(bundle) : bundle;
  const updates = {};
  const apiUrl = data?.extension?.apiUrl || data?.control?.apiUrl || data?.apiUrl;
  const gatewayUrl = data?.gateway?.url || data?.macos?.gatewayUrl || data?.gatewayUrl;
  const secret = data?.extension?.secret || data?.gateway?.secret || data?.macos?.secret || data?.secret;
  const authMode = String(data?.gateway?.authMode || data?.authMode || '').trim().toLowerCase();

  if (apiUrl) updates.nanobotUrl = normalizeApi(String(apiUrl));
  if (gatewayUrl) updates.seekerGatewayUrl = String(gatewayUrl).trim().replace(/\/+$/, '');
  if (secret) {
    updates.clawdGatewaySecret = normalizeSecret(secret);
    updates.seekerGatewayToken = normalizeSecret(secret);
  }
  if (authMode === 'token' || authMode === 'password') {
    updates.seekerGatewayAuthMode = authMode;
  }

  await new Promise(resolve => chrome.storage.local.set(updates, resolve));
}

async function migrateSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(['nanobotUrl', 'clawdGatewaySecret', 'seekerGatewayUrl', 'seekerGatewayToken', 'seekerGatewayAuthMode'], data => {
      const url = normalizeApi(data.nanobotUrl);
      const updates = {
        clawdGatewaySecret: normalizeSecret(data.clawdGatewaySecret),
        seekerGatewayToken: normalizeSecret(data.seekerGatewayToken),
        seekerGatewayAuthMode: ['token', 'password'].includes(String(data.seekerGatewayAuthMode || '').trim().toLowerCase())
          ? String(data.seekerGatewayAuthMode).trim().toLowerCase()
          : 'auto',
      };
      if (data.seekerGatewayUrl) {
        updates.seekerGatewayUrl = String(data.seekerGatewayUrl).trim().replace(/\/+$/, '');
      }
      if (url !== data.nanobotUrl) {
        updates.nanobotUrl = url;
      }
      chrome.storage.local.set(updates, resolve);
    });
  });
}

function normalizeApi(url) {
  const value = (url || '').trim();
  if (!value || LEGACY_APIS.has(value)) return DEFAULT_API;
  return value;
}

async function getNanobotUrl() {
  return new Promise(resolve => {
    chrome.storage.local.get(['nanobotUrl', 'clawdGatewaySecret'], data => {
      const url = normalizeApi(data.nanobotUrl);
      if (url !== data.nanobotUrl) {
        chrome.storage.local.set({ nanobotUrl: url });
      }
      resolve({
        url,
        secret: normalizeSecret(data.clawdGatewaySecret),
      });
    });
  });
}

async function resolveReachableApi(preferred, secret) {
  const candidates = [];
  if (preferred) candidates.push(preferred);
  for (const api of LOCAL_API_CANDIDATES) {
    if (!candidates.includes(api)) candidates.push(api);
  }

  for (const api of candidates) {
    try {
      const r = await fetch(api + '/api/status', {
        signal: AbortSignal.timeout(1200),
        headers: gatewayAuthHeaders(secret),
      });
      if (r.ok || r.status === 401) {
        if (api !== preferred) {
          chrome.storage.local.set({ nanobotUrl: api });
        }
        return api;
      }
    } catch {}
  }

  return preferred || DEFAULT_API;
}

// Check server status periodically
async function checkStatus() {
  const { url: savedApi, secret } = await getNanobotUrl();
  const SOLANAOS_API = await resolveReachableApi(savedApi, secret);
  try {
    const r = await fetch(SOLANAOS_API + '/api/status', {
      signal: AbortSignal.timeout(3000),
      headers: gatewayAuthHeaders(secret),
    });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const d = await r.json();
    const badge = deriveBadge(d);
    chrome.action.setBadgeText({ text: badge.text });
    chrome.action.setBadgeBackgroundColor({ color: badge.color });
    
    // Store status for popup
    chrome.storage.local.set({ 
      nanobotOnline: true, 
      lastStatus: d,
      lastCheck: Date.now() 
    });
  } catch {
    chrome.action.setBadgeText({ text: '' });
    chrome.storage.local.set({ 
      nanobotOnline: false, 
      lastCheck: Date.now() 
    });
  }
}

function deriveBadge(status) {
  if (!status) return { text: '', color: '#14F195' };
  if (status.daemon === 'stale') return { text: '!', color: '#f59e0b' };
  if (status.oodaMode === 'live') return { text: 'L', color: '#14F195' };
  if (status.oodaMode === 'simulated') return { text: 'S', color: '#9945FF' };
  if (status.daemon === 'alive') return { text: '●', color: '#14F195' };
  return { text: 'N', color: '#00D1FF' };
}

// Check every 30 seconds. Keep both daemon and pAGENT checks on one alarm
// path so the service worker does not duplicate API probes every interval.
chrome.alarms.create('clawd-status', { periodInMinutes: 0.5 });

// Check on install/startup
chrome.runtime.onInstalled.addListener(() => {
  migrateSettings().then(refreshAllStatus);
});
chrome.runtime.onStartup.addListener(() => {
  migrateSettings().then(refreshAllStatus);
});

// Also migrate immediately when the service worker loads.
migrateSettings().then(refreshAllStatus);

// ── pAGENT MCP bridge health check ──────────────────────────────────────
const MCP_BRIDGE_URL = 'http://127.0.0.1:38401';

async function checkPagentStatus() {
  try {
    const r = await fetch(`${MCP_BRIDGE_URL}/status`, { signal: AbortSignal.timeout(1500) });
    if (r.ok) {
      const d = await r.json();
      chrome.storage.local.set({ pagentOnline: true, pagentStatus: d, pagentLastCheck: Date.now() });
      return { online: true, ...d };
    }
  } catch {}
  chrome.storage.local.set({ pagentOnline: false, pagentLastCheck: Date.now() });
  return { online: false };
}

async function executeAgentTask(task) {
  const r = await fetch(`${MCP_BRIDGE_URL}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task }),
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`pAGENT ${r.status}: ${err.slice(0, 200)}`);
  }
  return r.json();
}

async function refreshAllStatus() {
  await Promise.allSettled([checkStatus(), checkPagentStatus()]);
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'clawd-status') {
    refreshAllStatus();
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CLAWD_BRIDGE_FROM_PAGE') {
    handleExternalMessage(msg.payload, sender)
      .then(sendResponse)
      .catch(err => sendResponse({ ok: false, error: err.message || 'page bridge failed' }));
    return true;
  }
  if (msg.type === 'CHECK_STATUS') {
    refreshAllStatus().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'GET_SETTINGS') {
    chrome.storage.local.get([
      'heliusApiKey',
      'nanobotUrl',
      'network',
      'clawdGatewaySecret',
      'seekerGatewayUrl',
      'seekerGatewayToken',
      'seekerGatewayAuthMode',
    ], (data) => {
      sendResponse(data);
    });
    return true;
  }
  if (msg.type === 'SAVE_SETTINGS') {
    chrome.storage.local.set(msg.data, () => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'PAGENT_STATUS') {
    checkPagentStatus().then(sendResponse);
    return true;
  }
  if (msg.type === 'EXECUTE_AGENT_TASK') {
    executeAgentTask(msg.task)
      .then(result => sendResponse({ ok: true, result }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.type === 'STOP_AGENT_TASK') {
    fetch(`${MCP_BRIDGE_URL}/stop`, { method: 'POST', signal: AbortSignal.timeout(3000) })
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  handleExternalMessage(msg, sender)
    .then(sendResponse)
    .catch(err => sendResponse({ ok: false, error: err.message || 'external message failed' }));
  return true;
});
