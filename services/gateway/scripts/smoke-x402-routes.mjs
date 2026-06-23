#!/usr/bin/env node

import { spawn } from 'node:child_process';
import net from 'node:net';

const HOST = '127.0.0.1';
const BASE_URL = 'https://x402.wtf';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function getOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => {
        if (!port) reject(new Error('Could not allocate a local port'));
        else resolve(port);
      });
    });
  });
}

async function waitForGateway(child, port) {
  const deadline = Date.now() + 15_000;
  const url = `http://${HOST}:${port}/health`;
  let lastError = '';

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Gateway exited early with code ${child.exitCode}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Gateway did not become ready on ${url}: ${lastError}`);
}

async function json(url, options) {
  const response = await fetch(url, options);
  assert(response.ok, `${url} returned ${response.status}`);
  return response.json();
}

async function text(url, options) {
  const response = await fetch(url, options);
  assert(response.ok, `${url} returned ${response.status}`);
  return response.text();
}

async function main() {
  const port = await getOpenPort();
  const child = spawn('node', ['dist/src/index.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      GATEWAY_HOST: HOST,
      GATEWAY_PORT: String(port),
      GATEWAY_BASE_URL: BASE_URL,
      CLAWD_PRODUCTION_MODE: 'true',
      GATEWAY_ADMIN_KEY: 'smoke-gateway-admin-key',
      BIRDEYE_API_KEY: '',
      TELEGRAM_BOT_TOKEN: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logs = [];
  child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()));

  try {
    await waitForGateway(child, port);
    const local = `http://${HOST}:${port}`;

    const health = await json(`${local}/health`);
    assert(health.access?.productionMode === true, 'gateway smoke must run with production access mode enabled');

    const agents = await json(`${local}/api/agents/catalog`);
    assert(agents.hub?.gallery === `${BASE_URL}/agents`, 'agents hub must point to x402.wtf/agents');
    assert(agents.hub?.api === `${BASE_URL}/api/agents`, 'agents API must point to x402.wtf/api/agents');
    assert(agents.stats?.totalAgents >= 130, `expected at least 130 agents, got ${agents.stats?.totalAgents}`);
    assert(agents.agents?.length === agents.stats.totalAgents, 'agents catalog length must match totalAgents');

    const skills = await json(`${local}/api/skills/catalog`);
    assert(skills.count >= 95, `expected at least 95 skills, got ${skills.count}`);
    assert(skills.catalog?.length === skills.count, 'skills catalog length must match count');
    assert(skills.catalog?.[0]?.homepage?.startsWith(`${BASE_URL}/skills/`), 'skills homepage must point to x402.wtf/skills');

    const githubSkill = await json(`${local}/api/skills/slug/github`);
    assert(githubSkill.homepage === `${BASE_URL}/skills/github`, 'github skill must resolve through x402.wtf/skills/github');

    const githubMetadata = await json(`${local}/api/skills/slug/github/metadata.json`);
    assert(githubMetadata.external_url === `${BASE_URL}/skills/github`, 'github skill metadata must expose x402 external_url');

    const plugin = await json(`${local}/.well-known/ai-plugin.json`);
    assert(plugin.api?.url === `${BASE_URL}/api/agents`, 'ai-plugin API must point to x402 agents API');
    assert(plugin.agent_registry?.hub === `${BASE_URL}/agents`, 'ai-plugin must expose x402 agents hub');
    assert(plugin.skill_registry?.hub === `${BASE_URL}/skills`, 'ai-plugin must expose x402 skills hub');
    assert(plugin.gateway?.hub === `${BASE_URL}/gateway`, 'ai-plugin must expose x402 gateway hub');
    assert(plugin.gateway?.telegram_webhook === `${BASE_URL}/telegram/webhook`, 'ai-plugin must expose x402 Telegram webhook');
    assert(plugin.staking?.hub === `${BASE_URL}/staking`, 'ai-plugin must expose x402 staking hub');
    assert(plugin.staking?.portfolio === `${BASE_URL}/api/staking/portfolio/{owner}`, 'ai-plugin must expose staking portfolio route');
    assert(plugin.staking?.assets === `${BASE_URL}/api/staking/assets/{owner}`, 'ai-plugin must expose staking assets route');
    assert(plugin.staking?.asset === `${BASE_URL}/api/staking/agent/{assetId}`, 'ai-plugin must expose staking asset route');
    assert(plugin.staking?.das_methods?.includes('getAssetsByOwner'), 'ai-plugin must expose Helius DAS methods');

    const stakingConfig = await json(`${local}/api/staking/config`);
    assert(stakingConfig.route === `${BASE_URL}/staking`, 'staking route must point to x402.wtf/staking');
    assert(stakingConfig.api === `${BASE_URL}/api/staking`, 'staking API must point to x402.wtf/api/staking');
    assert(stakingConfig.agentSource === 'agents/Agent-Staking_Unstaking_solana_metaplex_core', 'staking source must point to the agent staking workspace');

    const stakingPage = await text(`${local}/staking`);
    assert(stakingPage.includes('Helius DAS Token Assets'), 'staking page must expose DAS token assets');
    assert(stakingPage.includes('/api/staking/portfolio/'), 'staking page must use staking portfolio API');

    const grokPage = await text(`${local}/grok`);
    assert(grokPage.includes('CLAWD_GROK_STUDIO'), 'grok page must render the terminal studio');
    assert(grokPage.includes('/api/grok/chat'), 'grok page must use the gateway chat API');
    assert(grokPage.includes('/api/grok/image'), 'grok page must use the gateway image API');
    assert(grokPage.includes('/api/grok/tts'), 'grok page must use the gateway voice API');

    const grokStatus = await json(`${local}/api/grok/status`);
    assert(grokStatus.chat_model, 'grok status must expose chat model config');
    assert(grokStatus.image_model, 'grok status must expose image model config');
    assert(grokStatus.video_model, 'grok status must expose video model config');
    assert(typeof grokStatus.xai_available === 'boolean', 'grok status must report XAI_API_KEY availability');

    const blockedMutation = await fetch(`${local}/api/staking/transaction`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert(blockedMutation.status === 401, `live staking transaction should require access, got ${blockedMutation.status}`);

    const webhook = await fetch(`${local}/telegram/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert(webhook.status === 200, `telegram webhook returned ${webhook.status}`);

    console.log(`x402 gateway smoke OK on ${local}: ${agents.stats.totalAgents} agents, ${skills.count} skills`);
  } catch (error) {
    console.error(logs.join('').trim());
    throw error;
  } finally {
    child.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
