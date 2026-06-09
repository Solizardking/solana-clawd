#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";

const ROOT = process.cwd();
const MINTED_DIR = resolve(ROOT, "agents/minted");
const README_PATH = resolve(ROOT, "README.md");
const SVG_PATH = resolve(ROOT, "assets/minted-scoreboard.svg");

const README_START = "<!-- MINTED_SCOREBOARD:START -->";
const README_END = "<!-- MINTED_SCOREBOARD:END -->";

function safeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readMintedAgents() {
  if (!existsSync(MINTED_DIR)) return [];

  return readdirSync(MINTED_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const fullPath = join(MINTED_DIR, file);
      const json = JSON.parse(readFileSync(fullPath, "utf8"));
      const attrs = Array.isArray(json.attributes) ? json.attributes : [];
      const findAttr = (name) =>
        attrs.find((attr) => attr?.trait_type === name)?.value ?? "";
      const proof = json.openclawd?.proofOfExecution ?? {};
      const persona = json.openclawd?.persona ?? {};
      const mintedAt = proof.audit?.confirmedAt || proof.timestamp || findAttr("Minted At") || "";
      return {
        file,
        displayName: json.name || persona.name || file.replace(/\.json$/, ""),
        shortName: persona.name || json.name || file.replace(/\.json$/, ""),
        role: persona.role || findAttr("Role") || "Unknown Role",
        rarity: findAttr("Rarity") || "Unknown",
        generation: findAttr("Generation") || "?",
        verified: Boolean(proof.verified),
        assetAddress: proof.assetAddress || "pending",
        mintedAt,
      };
    })
    .sort((a, b) => {
      const ta = Date.parse(a.mintedAt || 0);
      const tb = Date.parse(b.mintedAt || 0);
      return tb - ta;
    });
}

function buildSvg(agents) {
  const total = agents.length;
  const verified = agents.filter((agent) => agent.verified).length;
  const latest = agents[0];
  const cards = agents.slice(0, 6);

  const rows = cards.map((agent, index) => {
    const x = 40 + index * 196;
    const accent = agent.verified ? "#22c55e" : "#f59e0b";
    const yDelay = index * 0.6;
    const status = agent.verified ? "verified" : "pending";
    return `
      <g transform="translate(${x},170)">
        <rect x="0" y="0" rx="18" ry="18" width="180" height="142" fill="rgba(9,15,28,0.74)" stroke="rgba(255,255,255,0.14)" />
        <rect x="0" y="0" rx="18" ry="18" width="180" height="6" fill="${accent}" />
        <text x="16" y="34" fill="#f8fafc" font-size="20" font-weight="700">${safeText(agent.displayName).slice(0, 18)}</text>
        <text x="16" y="58" fill="#93c5fd" font-size="13">${safeText(agent.role).slice(0, 22)}</text>
        <text x="16" y="82" fill="#cbd5e1" font-size="12">${safeText(agent.rarity)} · Gen ${safeText(agent.generation)}</text>
        <text x="16" y="106" fill="${accent}" font-size="12">${status}</text>
        <text x="16" y="126" fill="#94a3b8" font-size="10">${safeText(agent.assetAddress).slice(0, 10)}...${safeText(agent.assetAddress).slice(-6)}</text>
        <animateTransform attributeName="transform" type="translate" values="${x},170;${x},162;${x},170" dur="4.5s" begin="${yDelay}s" repeatCount="indefinite" />
      </g>`;
  }).join("");

  const tickerSource = agents.length > 0
    ? agents.map((agent) => `${agent.shortName} ${agent.verified ? "✓" : "…"}`).join("  •  ")
    : "No minted agents yet";

  return `<svg width="1280" height="360" viewBox="0 0 1280 360" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Live CLAWD minted agent scoreboard">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1280" y2="360" gradientUnits="userSpaceOnUse">
      <stop stop-color="#07111f"/>
      <stop offset="0.45" stop-color="#13233f"/>
      <stop offset="1" stop-color="#251235"/>
    </linearGradient>
    <linearGradient id="pulse" x1="0" y1="0" x2="1280" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#22d3ee"/>
      <stop offset="0.5" stop-color="#f97316"/>
      <stop offset="1" stop-color="#22c55e"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="10" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="1280" height="360" rx="28" fill="url(#bg)"/>
  <circle cx="1130" cy="72" r="88" fill="#22d3ee" fill-opacity="0.08">
    <animate attributeName="r" values="88;98;88" dur="5s" repeatCount="indefinite"/>
  </circle>
  <circle cx="155" cy="322" r="96" fill="#f97316" fill-opacity="0.09">
    <animate attributeName="r" values="96;84;96" dur="5.5s" repeatCount="indefinite"/>
  </circle>
  <rect x="32" y="26" width="1216" height="86" rx="22" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)"/>
  <rect x="32" y="26" width="1216" height="4" rx="2" fill="url(#pulse)" filter="url(#glow)">
    <animate attributeName="opacity" values="0.7;1;0.7" dur="3.2s" repeatCount="indefinite"/>
  </rect>
  <text x="58" y="58" fill="#f8fafc" font-size="28" font-weight="800">LIVE MINTED AGENT SCOREBOARD</text>
  <text x="58" y="88" fill="#93c5fd" font-size="16">Generated from /agents/minted for the README top banner</text>
  <text x="760" y="58" fill="#f8fafc" font-size="18" font-weight="700">Total minted: ${total}</text>
  <text x="760" y="86" fill="#22c55e" font-size="18" font-weight="700">Proof verified: ${verified}</text>
  <text x="980" y="58" fill="#f8fafc" font-size="18" font-weight="700">Latest: ${safeText(latest?.shortName ?? "none")}</text>
  <text x="980" y="86" fill="#cbd5e1" font-size="14">${safeText(latest?.role ?? "waiting for first mint")}</text>
  <g>
${rows}
  </g>
  <clipPath id="tickerClip"><rect x="40" y="326" width="1200" height="20" rx="8"/></clipPath>
  <g clip-path="url(#tickerClip)">
    <text x="1240" y="341" fill="#e2e8f0" font-size="14">
      ${safeText(tickerSource)}  •  ${safeText(tickerSource)}
      <animate attributeName="x" values="1240;-1640" dur="24s" repeatCount="indefinite"/>
    </text>
  </g>
</svg>`;
}

function buildMarkdown(agents) {
  const latestRows = agents.slice(0, 5).map((agent) => {
    const status = agent.verified ? "verified" : "pending";
    const asset = agent.assetAddress === "pending"
      ? "pending"
      : `\`${agent.assetAddress.slice(0, 8)}...${agent.assetAddress.slice(-6)}\``;
    return `| ${agent.displayName} | ${agent.role} | ${agent.rarity} / ${agent.generation} | ${status} | ${asset} |`;
  }).join("\n");

  return `${README_START}
## Live Minted Agent Scoreboard

<div align="center">
  <img src="./assets/minted-scoreboard.svg" alt="Live minted CLAWD agent scoreboard" width="100%" />
</div>

**Source:** [agents/minted](/agents/minted) · auto-generated from local mint artifacts

| Agent | Role | Rarity / Gen | Proof | Asset |
|---|---|---:|---|---|
${latestRows || "| none yet | - | - | - | - |"}
${README_END}`;
}

function main() {
  const agents = readMintedAgents();
  const svg = buildSvg(agents);
  writeFileSync(SVG_PATH, svg);

  const readme = readFileSync(README_PATH, "utf8");
  const scoreboard = buildMarkdown(agents);

  if (readme.includes(README_START) && readme.includes(README_END)) {
    const next = readme.replace(
      new RegExp(`${README_START}[\\s\\S]*${README_END}`),
      scoreboard,
    );
    writeFileSync(README_PATH, next);
  } else {
    const anchor = "</div>\n\n---";
    const next = readme.includes(anchor)
      ? readme.replace(anchor, `</div>\n\n${scoreboard}\n\n---`)
      : `${scoreboard}\n\n${readme}`;
    writeFileSync(README_PATH, next);
  }

  console.log(`Updated minted scoreboard for ${agents.length} agents.`);
}

main();
