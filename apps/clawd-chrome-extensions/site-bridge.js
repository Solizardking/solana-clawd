// Page bridge for trusted Clawd web surfaces.
// Lets sites talk to the extension without knowing its Chrome extension ID.

const CLAWD_BRIDGE_MARKER = '__clawdExtensionBridge';
const CLAWD_BRIDGE_VERSION = 1;

function postBridgeResponse(id, response) {
  window.postMessage({
    [CLAWD_BRIDGE_MARKER]: true,
    direction: 'response',
    version: CLAWD_BRIDGE_VERSION,
    id,
    response,
  }, window.location.origin);
}

function postBridgeReady() {
  window.postMessage({
    [CLAWD_BRIDGE_MARKER]: true,
    direction: 'ready',
    version: CLAWD_BRIDGE_VERSION,
  }, window.location.origin);
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;

  const data = event.data;
  if (!data || data[CLAWD_BRIDGE_MARKER] !== true) return;
  if (data.direction !== 'request') return;

  const id = String(data.id || '');
  const message = data.message || {};
  chrome.runtime.sendMessage(
    { type: 'CLAWD_BRIDGE_FROM_PAGE', payload: message },
    (response) => {
      const err = chrome.runtime.lastError;
      postBridgeResponse(id, err ? { ok: false, error: err.message } : response);
    }
  );
});

postBridgeReady();
