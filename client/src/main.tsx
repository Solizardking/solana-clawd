// Import Buffer polyfill first to ensure it's available for all other imports
import "./lib/buffer-polyfill";

import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App";
import "./index.css";
import "./lib/i18n"; // Initialize i18n
import { clerkAppearance, getClerkPublishableKey, hasClerk } from "./lib/clerk";

// Global error handler for WebSocket connections
const originalWebSocket = window.WebSocket;
const createClosedWebSocket = () => ({
  addEventListener: () => {},
  removeEventListener: () => {},
  send: () => {},
  close: () => {},
  readyState: 3,
  onopen: null,
  onclose: null,
  onmessage: null,
  onerror: null,
}) as unknown as WebSocket;

window.WebSocket = function(url: string | URL, protocols?: string | string[]) {
  try {
    const wsUrl = String(url);
    if (window.location.hostname.endsWith("vercel.app") && wsUrl.includes("/ws")) {
      return createClosedWebSocket();
    }

    const ws = new originalWebSocket(url, protocols);
    
    // Add error logging for WebSocket connections
    ws.addEventListener('error', (event) => {
      console.warn('[WebSocket] Connection error:', event);
    });
    
    return ws;
  } catch (error) {
    console.error('[WebSocket] Failed to create connection:', error);
    
    // Return a mock WebSocket that won't crash the app
    const mockWs = createClosedWebSocket();
    
    // Trigger the error callback
    setTimeout(() => {
      if (mockWs.onerror) {
        mockWs.onerror(new Event('error') as MessageEvent);
      }
    }, 0);
    
    return mockWs;
  }
} as any;

// Copy prototype from original WebSocket
window.WebSocket.prototype = originalWebSocket.prototype;

// Copy constants without direct assignment
Object.defineProperties(window.WebSocket, {
  CONNECTING: { value: originalWebSocket.CONNECTING },
  OPEN: { value: originalWebSocket.OPEN },
  CLOSING: { value: originalWebSocket.CLOSING },
  CLOSED: { value: originalWebSocket.CLOSED }
});

// Additional polyfill for window.solana
if (!('solana' in window)) {
  Object.defineProperty(window, 'solana', {
    // Getter returns undefined but doesn't crash
    get: function() {
      return undefined;
    },
    configurable: true
  });
}

function renderApplication() {
  try {
    const root = document.getElementById("root");
    const publishableKey = getClerkPublishableKey();
    
    if (!root) {
      console.error("Root element not found");
      return;
    }
  
    const app = <App />;

    createRoot(root).render(
      hasClerk() ? (
        <ClerkProvider
          publishableKey={publishableKey}
          appearance={clerkAppearance}
          signInFallbackRedirectUrl="/account"
          signUpFallbackRedirectUrl="/account"
          afterSignOutUrl="/"
        >
          {app}
        </ClerkProvider>
      ) : (
        app
      )
    );
  } catch (error) {
    console.error("Failed to render application:", error);
    
    // Fallback rendering without wallet providers
    const root = document.getElementById("root");
    if (root) {
      createRoot(root).render(<App />);
    }
  }
}

// Start React as soon as the DOM root exists. Waiting for `window.load` lets
// third-party deferred scripts keep the app blank.
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", renderApplication, { once: true });
} else {
  renderApplication();
}
