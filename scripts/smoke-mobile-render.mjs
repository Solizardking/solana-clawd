#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

const cliBaseUrl = process.argv.slice(2).find((arg) => arg !== "--");
const baseUrl = (process.env.SMOKE_BASE_URL || cliBaseUrl || "http://127.0.0.1:5000").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_RENDER_TIMEOUT_MS || 20_000);
const outputDir = path.resolve(process.env.SMOKE_RENDER_OUTPUT_DIR || path.join(tmpdir(), "cheshire-render-smoke"));

const mobileViewport = {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
  touch: true,
};

const desktopViewport = {
  width: 1280,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
  touch: false,
};

const journeys = [
  {
    name: "mobile-remote",
    path: "/remote",
    viewport: mobileViewport,
    expectText: ["Remote Control", "Terminal Handoff", "Agent Handoff", "Wallet"],
    requireMobileDock: true,
  },
  {
    name: "mobile-terminal-handoff",
    path: "/terminal?source=telegram&tab=ai&prompt=Remote%20mobile%20render%20check",
    viewport: mobileViewport,
    expectText: ["$CLAWD HOLDERS ONLY", "Free Terminal", "Buy on Jupiter"],
  },
  {
    name: "mobile-free-terminal",
    path: "/free?source=telegram&prompt=Remote%20mobile%20render%20check",
    viewport: mobileViewport,
    expectText: ["Cheshire Free Terminal", "Public terminal", "OpenRouter"],
  },
  {
    name: "mobile-mini-app",
    path: "/mini-app?source=render-smoke",
    viewport: mobileViewport,
    expectText: ["Telegram Remote", "Wallet", "Link Telegram", "Free Terminal"],
  },
  {
    name: "mobile-account",
    path: "/account?source=render-smoke",
    viewport: mobileViewport,
    expectText: ["Account", "Wallet Session", "Telegram", "Remote Actions"],
    requireMobileDock: true,
  },
  {
    name: "mobile-agent-builder-handoff",
    path: "/agents/builder?source=remote&name=Remote%20CLAWD%20Agent&prompt=Create%20a%20mobile%20remote%20agent",
    viewport: mobileViewport,
    expectText: ["Deep CLAWD Agent Builder", "Remote agent handoff", "Create a mobile remote agent"],
    requireMobileDock: true,
  },
  {
    name: "desktop-agent-explorer",
    path: "/agent-explorer",
    viewport: desktopViewport,
    expectText: ["Agent"],
  },
];

function chromeCandidates() {
  return [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "google-chrome",
    "chromium",
    "chromium-browser",
  ].filter(Boolean);
}

function findChrome() {
  const candidates = chromeCandidates();
  const directPath = candidates.find((candidate) => candidate.includes("/") && existsSync(candidate));
  return directPath || candidates.find((candidate) => !candidate.includes("/"));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function routeUrl(routePath) {
  return `${baseUrl}${routePath.startsWith("/") ? routePath : `/${routePath}`}`;
}

function waitForDevTools(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      reject(new Error(`Chrome did not expose DevTools within ${timeoutMs}ms. ${output.trim()}`));
    }, timeoutMs);

    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited before DevTools started: code=${code} signal=${signal}. ${output.trim()}`));
    });
  });
}

class CdpClient {
  constructor(endpoint) {
    this.nextId = 1;
    this.callbacks = new Map();
    this.listeners = new Map();
    this.socket = new WebSocket(endpoint);
    this.ready = new Promise((resolve, reject) => {
      this.socket.once("open", resolve);
      this.socket.once("error", reject);
    });
    this.socket.on("message", (raw) => this.handleMessage(raw));
  }

  handleMessage(raw) {
    const message = JSON.parse(raw.toString());
    if (message.id && this.callbacks.has(message.id)) {
      const { resolve, reject } = this.callbacks.get(message.id);
      this.callbacks.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message || JSON.stringify(message.error)));
      } else {
        resolve(message.result || {});
      }
      return;
    }

    const handlers = this.listeners.get(message.method);
    if (!handlers) return;
    for (const handler of handlers) {
      handler(message);
    }
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(handler);
    return () => this.listeners.get(method)?.delete(handler);
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.callbacks.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.callbacks.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.socket.send(JSON.stringify(payload));
    });
  }

  close() {
    this.socket.close();
  }
}

async function waitForEvent(client, method, sessionId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error(`${method} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const off = client.on(method, (message) => {
      if (sessionId && message.sessionId !== sessionId) return;
      clearTimeout(timer);
      off();
      resolve(message.params || {});
    });
  });
}

async function evaluate(client, sessionId, expression) {
  const result = await client.send(
    "Runtime.evaluate",
    {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout: timeoutMs,
    },
    sessionId,
  );

  if (result.exceptionDetails) {
    const details = result.exceptionDetails.text || result.exceptionDetails.exception?.description || "Runtime evaluation failed";
    throw new Error(details);
  }

  return result.result?.value;
}

async function waitForRendered(client, sessionId, expectedText) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;

  while (Date.now() < deadline) {
    lastState = await evaluate(
      client,
      sessionId,
      `(() => {
        const bodyText = (document.body?.innerText || "").replace(/\\s+/g, " ").trim();
        return {
          readyState: document.readyState,
          hasRoot: Boolean(document.getElementById("root")?.children.length),
          text: bodyText.slice(0, 6000)
        };
      })()`,
    );

    const renderedText = lastState.text.toLowerCase();
    const hasExpectedText = expectedText.every((text) => renderedText.includes(text.toLowerCase()));
    if (lastState.readyState === "complete" && lastState.hasRoot && hasExpectedText) return lastState;
    await delay(250);
  }

  const renderedText = (lastState?.text || "").toLowerCase();
  const missing = expectedText.filter((text) => !renderedText.includes(text.toLowerCase()));
  const excerpt = lastState?.text ? ` Text: ${lastState.text.slice(0, 600)}` : "";
  throw new Error(`Rendered page did not reach expected state. Missing text: ${missing.join(", ") || "none"}.${excerpt}`);
}

function pageMetricsScript() {
  return `(() => {
    const root = document.getElementById("root");
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    function hasScrollableAncestor(element) {
      let parent = element.parentElement;
      while (parent && parent !== document.body) {
        const style = getComputedStyle(parent);
        const scrollableX = /(auto|scroll)/.test(style.overflowX);
        if (scrollableX && parent.scrollWidth > parent.clientWidth + 2) return true;
        parent = parent.parentElement;
      }
      return false;
    }

    const overflowers = [];
    for (const element of Array.from(document.body.querySelectorAll("*"))) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (rect.width < 1 || rect.height < 1) continue;
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (hasScrollableAncestor(element)) continue;

      const overLeft = rect.left < -2;
      const overRight = rect.right > viewportWidth + 2;
      const fixedViewport = style.position === "fixed" && rect.left <= 0 && rect.right >= viewportWidth;
      if ((overLeft || overRight) && !fixedViewport) {
        overflowers.push({
          tag: element.tagName.toLowerCase(),
          className: String(element.className || "").slice(0, 160),
          text: String(element.innerText || element.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim().slice(0, 140),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width)
        });
      }
      if (overflowers.length >= 8) break;
    }

    const fixedBottomLabels = Array.from(document.body.querySelectorAll("*"))
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.position === "fixed" && Math.abs(viewportHeight - rect.bottom) <= 8 && rect.width > 80;
      })
      .map((element) => String(element.getAttribute("aria-label") || element.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 120))
      .filter(Boolean);
    const mobileRemote = document.querySelector('[aria-label="Mobile remote control"]');
    const mobileRemoteText = String(mobileRemote?.textContent || "").replace(/\\s+/g, " ").trim();

    return {
      href: location.href,
      title: document.title,
      viewportWidth,
      viewportHeight,
      scrollWidth: Math.ceil(document.documentElement.scrollWidth),
      clientWidth: Math.ceil(document.documentElement.clientWidth),
      bodyText: String(document.body.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 800),
      rootHtmlLength: root?.innerHTML.length || 0,
      overflowers,
      fixedBottomLabels,
      mobileRemoteText,
      terminalMobileControls: Boolean(document.querySelector('[aria-label="Terminal mobile remote controls"]')),
      mobileRemoteDock: Boolean(mobileRemote) && ["Free", "Terminal", "Remote", "Agents"].every((label) => mobileRemoteText.includes(label))
    };
  })()`;
}

async function runJourney(client, sessionId, journey) {
  const pageErrors = [];
  const removeExceptionListener = client.on("Runtime.exceptionThrown", (message) => {
    if (message.sessionId !== sessionId) return;
    const detail = message.params?.exceptionDetails;
    pageErrors.push(detail?.exception?.description || detail?.text || "Runtime exception");
  });

  const width = journey.viewport.width;
  const height = journey.viewport.height;
  await client.send(
    "Emulation.setDeviceMetricsOverride",
    {
      width,
      height,
      deviceScaleFactor: journey.viewport.deviceScaleFactor,
      mobile: journey.viewport.mobile,
      screenWidth: width,
      screenHeight: height,
    },
    sessionId,
  );
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: journey.viewport.touch }, sessionId);
  await client.send(
    "Network.setUserAgentOverride",
    {
      userAgent: journey.viewport.mobile
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        : "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0 Safari/537.36",
    },
    sessionId,
  );

  const loadEvent = waitForEvent(client, "Page.loadEventFired", sessionId).catch(() => null);
  const navigateResult = await client.send("Page.navigate", { url: routeUrl(journey.path) }, sessionId);
  if (navigateResult.errorText) throw new Error(navigateResult.errorText);
  await loadEvent;
  await waitForRendered(client, sessionId, journey.expectText);
  await delay(500);

  const metrics = await evaluate(client, sessionId, pageMetricsScript());
  const failures = [];

  if (metrics.rootHtmlLength < 500) {
    failures.push("React root rendered too little content");
  }

  if (journey.viewport.mobile && metrics.scrollWidth > metrics.clientWidth + 2) {
    failures.push(`document overflows horizontally (${metrics.scrollWidth}px > ${metrics.clientWidth}px)`);
  }

  if (journey.viewport.mobile && metrics.overflowers.length > 0) {
    failures.push(`visible horizontal overflowers: ${JSON.stringify(metrics.overflowers)}`);
  }

  if (journey.requireMobileDock && !metrics.mobileRemoteDock) {
    failures.push("mobile bottom remote dock was not detected");
  }

  if (journey.requireMobileControls && !metrics.terminalMobileControls) {
    failures.push("terminal mobile remote controls were not detected");
  }

  if (pageErrors.length > 0) {
    failures.push(`runtime exceptions: ${pageErrors.join(" | ")}`);
  }

  const screenshot = await client.send(
    "Page.captureScreenshot",
    {
      format: "png",
      captureBeyondViewport: false,
      fromSurface: true,
    },
    sessionId,
  );
  const screenshotPath = path.join(outputDir, `${journey.name}.png`);
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));

  removeExceptionListener();

  return {
    journey,
    metrics,
    failures,
    screenshotPath,
  };
}

async function createPageSession(client) {
  const target = await client.send("Target.createTarget", { url: "about:blank" });
  const attached = await client.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await client.send("Page.enable", {}, sessionId);
  await client.send("Runtime.enable", {}, sessionId);
  await client.send("Network.enable", {}, sessionId);
  return sessionId;
}

async function waitForServer() {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(500);
  }

  throw new Error(`Server did not become reachable at ${baseUrl}: ${lastError}`);
}

await waitForServer();
mkdirSync(outputDir, { recursive: true });

const chromePath = findChrome();
if (!chromePath) {
  throw new Error("No Chrome or Chromium executable found. Set CHROME_BIN to run rendered smoke checks.");
}

const profileDir = mkdtempSync(path.join(tmpdir(), "cheshire-chrome-"));
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-gpu",
    "--disable-sync",
    "--hide-scrollbars",
    "--no-default-browser-check",
    "--no-first-run",
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);

let client;
try {
  const endpoint = await waitForDevTools(chrome);
  client = new CdpClient(endpoint);
  await client.ready;
  const sessionId = await createPageSession(client);
  const results = [];

  for (const journey of journeys) {
    const started = Date.now();
    try {
      const result = await runJourney(client, sessionId, journey);
      results.push(result);
      const status = result.failures.length ? "FAIL" : "PASS";
      console.log(`${status} ${String(Date.now() - started).padStart(5)}ms ${journey.name} ${result.screenshotPath}`);
      for (const failure of result.failures) {
        console.log(`  - ${failure}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        journey,
        metrics: null,
        failures: [message],
        screenshotPath: "",
      });
      console.log(`FAIL ${String(Date.now() - started).padStart(5)}ms ${journey.name}`);
      console.log(`  - ${message}`);
    }
  }

  const failures = results.filter((result) => result.failures.length > 0);
  console.log("");
  console.log(`Rendered smoke base: ${baseUrl}`);
  console.log(`Screenshots: ${outputDir}`);
  console.log(`Rendered journeys passed: ${results.length - failures.length}/${results.length}`);

  if (failures.length > 0) process.exitCode = 1;
} finally {
  try {
    await client?.send("Browser.close");
  } catch {
    chrome.kill("SIGTERM");
  }
  client?.close();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(profileDir, { recursive: true, force: true });
      break;
    } catch (error) {
      if (attempt === 4) throw error;
      await delay(250);
    }
  }
}
