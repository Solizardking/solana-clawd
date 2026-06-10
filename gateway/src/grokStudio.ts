import express, { Router, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chat, type GrokMessage } from './grok.js';

const router = Router();
const XAI_BASE_URL = 'https://api.x.ai/v1';
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..');
const ASSET_DIR = path.join(REPO_ROOT, 'gateway', 'data', 'grok-assets');
const ASSET_INDEX = path.join(ASSET_DIR, 'index.json');

const CHAT_SYSTEM = [
  'You are Clawd Grok Studio, a sharp terminal-native creative operator for OpenClawd.',
  'Help the user plan, generate, remix, and critique chat, image, video, voice, and transcription assets.',
  'When the user attaches generated assets, treat the attachment metadata as available project context.',
  'Keep answers direct, useful, and a little cyber-terminal in tone without hiding important caveats.',
].join(' ');

type AssetKind = 'image' | 'video' | 'audio' | 'transcript' | 'file';

type StudioAsset = {
  id: string;
  kind: AssetKind;
  label: string;
  prompt?: string;
  mimeType?: string;
  fileName?: string;
  size?: number;
  url?: string;
  sourceUrl?: string;
  text?: string;
  createdAt: string;
};

type XaiImageResponse = {
  data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
};

type XaiVideoStartResponse = {
  request_id?: string;
  id?: string;
  status?: string;
};

type XaiVideoStatusResponse = {
  request_id?: string;
  id?: string;
  status?: 'pending' | 'done' | 'expired' | 'failed' | string;
  video?: { url?: string; duration?: number; content_type?: string; mime_type?: string };
  error?: unknown;
};

type XaiSttResponse = {
  text?: string;
  language?: string;
  duration?: number;
  segments?: unknown;
};

function ensureAssetDir(): void {
  fs.mkdirSync(ASSET_DIR, { recursive: true });
}

function readAssets(): StudioAsset[] {
  try {
    return JSON.parse(fs.readFileSync(ASSET_INDEX, 'utf8')) as StudioAsset[];
  } catch {
    return [];
  }
}

function writeAssets(assets: StudioAsset[]): void {
  ensureAssetDir();
  fs.writeFileSync(ASSET_INDEX, `${JSON.stringify(assets.slice(0, 200), null, 2)}\n`);
}

function addAsset(asset: StudioAsset): StudioAsset {
  const assets = readAssets().filter((entry) => entry.id !== asset.id);
  assets.unshift(asset);
  writeAssets(assets);
  return asset;
}

function apiKey(): string | null {
  return process.env.XAI_API_KEY || null;
}

function requireXaiKey(res: Response): string | null {
  const key = apiKey();
  if (!key) {
    res.status(503).json({
      error: 'XAI_API_KEY is not configured on the gateway.',
      missing: 'XAI_API_KEY',
    });
    return null;
  }
  return key;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeFilePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72) || 'asset';
}

function extFromMime(mimeType?: string, fallback = 'bin'): string {
  if (!mimeType) return fallback;
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('json')) return 'json';
  if (mimeType.includes('text')) return 'txt';
  return fallback;
}

function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('Expected a data URL.');
  const mimeType = match[1] ?? 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const payload = match[3] ?? '';
  const buffer = isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload));
  return { mimeType, buffer };
}

async function xaiJson<T>(pathName: string, body: Record<string, unknown>): Promise<T> {
  const key = apiKey();
  if (!key) throw new Error('XAI_API_KEY is not configured.');
  const res = await fetch(`${XAI_BASE_URL}${pathName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`xAI API ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

async function downloadRemoteAsset(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  const mimeType = res.headers.get('content-type')?.split(';')[0] ?? 'application/octet-stream';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mimeType };
}

function saveBufferAsset(input: {
  kind: AssetKind;
  label: string;
  prompt?: string;
  mimeType: string;
  buffer: Buffer;
}): StudioAsset {
  ensureAssetDir();
  const id = randomUUID();
  const ext = extFromMime(input.mimeType, input.kind === 'audio' ? 'mp3' : input.kind === 'video' ? 'mp4' : 'bin');
  const fileName = `${Date.now()}-${sanitizeFilePart(input.label)}-${id.slice(0, 8)}.${ext}`;
  fs.writeFileSync(path.join(ASSET_DIR, fileName), input.buffer);
  return addAsset({
    id,
    kind: input.kind,
    label: input.label,
    prompt: input.prompt,
    mimeType: input.mimeType,
    fileName,
    size: input.buffer.length,
    url: `/api/grok/assets/${id}`,
    createdAt: new Date().toISOString(),
  });
}

function saveTextAsset(input: { kind: AssetKind; label: string; text: string; prompt?: string }): StudioAsset {
  const buffer = Buffer.from(input.text, 'utf8');
  return saveBufferAsset({
    kind: input.kind,
    label: input.label,
    prompt: input.prompt,
    mimeType: 'text/plain',
    buffer,
  });
}

function assetById(id: string): StudioAsset | undefined {
  if (!/^[a-f0-9-]{36}$/i.test(id)) return undefined;
  return readAssets().find((asset) => asset.id === id);
}

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function sendAsset(res: Response, id: string, download = false): void {
  const asset = assetById(id);
  if (!asset) {
    res.status(404).json({ error: 'Asset not found.' });
    return;
  }
  if (asset.fileName) {
    const filePath = path.join(ASSET_DIR, asset.fileName);
    if (!filePath.startsWith(ASSET_DIR) || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Asset file missing.' });
      return;
    }
    if (asset.mimeType) res.type(asset.mimeType);
    if (download) res.download(filePath, asset.fileName);
    else res.sendFile(filePath);
    return;
  }
  if (asset.sourceUrl) {
    res.redirect(asset.sourceUrl);
    return;
  }
  res.status(404).json({ error: 'Asset has no stored file.' });
}

function renderGrokPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Clawd Grok Studio</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%2305070a'/%3E%3Cpath d='M7 17 14 8h11l-7 8h7l-10 9 3-8H7z' fill='%235cff9d'/%3E%3C/svg%3E" />
  <style>
    :root{color-scheme:dark;--bg:#05070a;--panel:#0b1118;--panel2:#101822;--ink:#e8fff6;--muted:#8aa79d;--line:#1f342c;--green:#5cff9d;--cyan:#39d8ff;--red:#ff5f7c;--amber:#ffce66;--violet:#c792ea}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 20% 0%,#15332a 0,#06100e 34%,#030506 68%);color:var(--ink);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:0}
    body::before{content:"";position:fixed;inset:0;pointer-events:none;background:linear-gradient(rgba(92,255,157,.05) 50%,rgba(0,0,0,0) 50%);background-size:100% 4px;mix-blend-mode:screen;opacity:.45}
    button,input,textarea,select{font:inherit}button{cursor:pointer}
    .shell{min-height:100vh;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(340px,.75fr);gap:14px;padding:14px}
    .terminal,.studio,.panel{border:1px solid var(--line);background:linear-gradient(180deg,rgba(11,17,24,.94),rgba(5,8,12,.96));box-shadow:0 0 0 1px rgba(92,255,157,.04),0 18px 60px rgba(0,0,0,.35)}
    .terminal,.studio{min-height:calc(100vh - 28px);display:flex;flex-direction:column;border-radius:8px;overflow:hidden}
    .topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid var(--line);background:#080d12}
    .brand{display:flex;align-items:center;gap:10px;min-width:0}.lights{display:flex;gap:6px}.light{width:10px;height:10px;border-radius:50%;background:var(--red)}.light:nth-child(2){background:var(--amber)}.light:nth-child(3){background:var(--green)}
    .brand strong{color:var(--green);white-space:nowrap}.status{display:flex;gap:8px;align-items:center;color:var(--muted);font-size:12px}.dot{width:8px;height:8px;border-radius:50%;background:var(--red)}.dot.on{background:var(--green);box-shadow:0 0 16px var(--green)}
    .log{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:12px}.msg{border-left:2px solid var(--line);padding:10px 12px;background:rgba(8,13,18,.72);border-radius:0 6px 6px 0;white-space:pre-wrap;line-height:1.45}.msg.user{border-color:var(--cyan)}.msg.assistant{border-color:var(--green)}.msg.system{border-color:var(--amber);color:#ffe9b2}.msg .who{display:block;color:var(--muted);font-size:12px;margin-bottom:6px}.msg a{color:var(--cyan)}
    .composer{border-top:1px solid var(--line);padding:12px;background:#070b10}.attached{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}.chip{display:inline-flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid var(--line);border-radius:6px;background:#0d151d;color:var(--muted);font-size:12px}.chip button{border:0;background:transparent;color:var(--red);padding:0}
    .inputrow{display:grid;grid-template-columns:1fr auto;gap:10px}.inputrow textarea{height:86px;resize:none;border:1px solid var(--line);border-radius:6px;background:#03070a;color:var(--ink);padding:12px;outline:none}.btn{border:1px solid var(--line);background:#0d171f;color:var(--ink);border-radius:6px;padding:10px 12px}.btn.primary{border-color:rgba(92,255,157,.7);color:#04100a;background:var(--green);font-weight:800}.btn.warn{border-color:rgba(255,206,102,.65);color:var(--amber)}
    .studio{gap:0}.tabs{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid var(--line)}.tab{border:0;border-right:1px solid var(--line);background:#081017;color:var(--muted);padding:11px 6px}.tab.active{color:var(--green);background:#0f1b15}
    .tool{display:none;padding:14px;overflow:auto}.tool.active{display:block}.panel{border-radius:8px;padding:12px;margin-bottom:12px}label{display:block;color:var(--muted);font-size:12px;margin:0 0 6px;text-transform:uppercase}textarea,input,select{width:100%;border:1px solid var(--line);border-radius:6px;background:#03070a;color:var(--ink);padding:10px;outline:none}textarea{min-height:96px;resize:vertical}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
    .assets{display:grid;gap:10px}.asset{border:1px solid var(--line);border-radius:8px;background:#070c11;overflow:hidden}.assetBody{padding:10px}.asset h3{font-size:13px;margin:0 0 4px;color:var(--ink)}.asset p{margin:0 0 8px;color:var(--muted);font-size:12px;line-height:1.35}.asset img,.asset video,.asset audio{display:block;width:100%;background:#020406}.asset video{aspect-ratio:16/9}.tiny{font-size:12px;color:var(--muted);line-height:1.4}.meter{height:8px;border:1px solid var(--line);border-radius:999px;overflow:hidden;background:#05090d}.meter i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--green),var(--cyan))}
    @media (max-width:980px){.shell{grid-template-columns:1fr}.terminal,.studio{min-height:70vh}.studio{min-height:auto}.grid2{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main class="shell">
    <section class="terminal">
      <header class="topbar">
        <div class="brand"><span class="lights"><i class="light"></i><i class="light"></i><i class="light"></i></span><strong>CLAWD_GROK_STUDIO</strong></div>
        <div class="status"><i id="xaiDot" class="dot"></i><span id="xaiStatus">checking XAI_API_KEY</span></div>
      </header>
      <div id="log" class="log"></div>
      <form id="chatForm" class="composer">
        <div id="attached" class="attached"></div>
        <div class="inputrow">
          <textarea id="chatInput" placeholder="$ ask grok to reason, remix assets, draft prompts, critique outputs..."></textarea>
          <button class="btn primary" type="submit">SEND</button>
        </div>
      </form>
    </section>
    <aside class="studio">
      <header class="topbar"><strong>MEDIA / VOICE OPS</strong><span class="tiny" id="assetCount">0 assets</span></header>
      <nav class="tabs">
        <button class="tab active" data-tab="image">IMAGE</button>
        <button class="tab" data-tab="video">VIDEO</button>
        <button class="tab" data-tab="voice">VOICE</button>
        <button class="tab" data-tab="assets">ASSETS</button>
      </nav>
      <section class="tool active" id="tool-image">
        <div class="panel">
          <label for="imagePrompt">Image prompt</label>
          <textarea id="imagePrompt">A black-and-green Grok terminal cockpit for a Solana AI agent, cinematic neon glow, real UI surfaces, high detail</textarea>
          <div class="grid2">
            <div><label for="imageRatio">Aspect</label><select id="imageRatio"><option>16:9</option><option>1:1</option><option>9:16</option><option>4:3</option><option>3:4</option></select></div>
            <div><label for="imageRes">Resolution</label><select id="imageRes"><option>1k</option><option>2k</option></select></div>
          </div>
          <div class="actions"><button id="makeImage" class="btn primary" type="button">GENERATE IMAGE</button></div>
        </div>
      </section>
      <section class="tool" id="tool-video">
        <div class="panel">
          <label for="videoPrompt">Video prompt</label>
          <textarea id="videoPrompt">A sleek terminal chat interface boots into life, green phosphor text flowing across glass, camera pushes through a Solana agent control room</textarea>
          <div class="grid2">
            <div><label for="videoRatio">Aspect</label><select id="videoRatio"><option>16:9</option><option>9:16</option><option>1:1</option></select></div>
            <div><label for="videoDuration">Duration</label><select id="videoDuration"><option value="5">5 sec</option><option value="10">10 sec</option></select></div>
          </div>
          <div class="actions"><button id="makeVideo" class="btn primary" type="button">START VIDEO</button><button id="pollVideo" class="btn" type="button" disabled>POLL</button></div>
          <p class="tiny" id="videoJob">No active job.</p>
        </div>
      </section>
      <section class="tool" id="tool-voice">
        <div class="panel">
          <label for="ttsText">Speech</label>
          <textarea id="ttsText">Clawd Grok Studio is online. Terminal voice chain armed.</textarea>
          <div class="grid2">
            <div><label for="voiceId">Voice</label><input id="voiceId" value="eve" /></div>
            <div><label for="language">Language</label><input id="language" value="en" /></div>
          </div>
          <div class="actions"><button id="makeSpeech" class="btn primary" type="button">TEXT TO SPEECH</button><button id="recordBtn" class="btn warn" type="button">REC</button><button id="transcribeBtn" class="btn" type="button" disabled>TRANSCRIBE</button></div>
          <div class="meter"><i id="recMeter"></i></div>
          <p class="tiny" id="voiceState">Record from mic, transcribe, then attach transcript to chat.</p>
        </div>
      </section>
      <section class="tool" id="tool-assets">
        <div class="panel"><p class="tiny">Generated media is saved in the gateway asset shelf. Use Download for local files or Attach to pass the asset back into Grok chat context.</p></div>
      </section>
      <div class="tool active" style="display:block;padding-top:0"><div id="assets" class="assets"></div></div>
    </aside>
  </main>
  <script>
    const state = { messages: [], assets: [], attached: [], activeVideo: null, recorder: null, chunks: [], recTimer: null };
    const $ = (id) => document.getElementById(id);
    const log = $('log');
    function addLog(role, text) {
      const el = document.createElement('div');
      el.className = 'msg ' + role;
      el.innerHTML = '<span class="who">' + role.toUpperCase() + '</span>' + escapeText(text).replace(/\\n/g, '<br>');
      log.appendChild(el); log.scrollTop = log.scrollHeight;
    }
    function escapeText(text) { return String(text).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
    async function api(path, options = {}) {
      const res = await fetch(path, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('application/json') ? await res.json() : await res.text();
      if (!res.ok) throw new Error(data.error || data.message || data);
      return data;
    }
    function setBusy(id, busy, label) {
      const el = $(id); el.disabled = busy; if (label) el.textContent = busy ? label : el.dataset.label || el.textContent;
    }
    function renderAttached() {
      $('attached').innerHTML = state.attached.map((asset) => '<span class="chip">' + asset.kind + ':' + escapeText(asset.label) + '<button type="button" data-detach="' + asset.id + '">x</button></span>').join('');
    }
    function attach(asset) {
      if (!state.attached.find((item) => item.id === asset.id)) state.attached.push(asset);
      renderAttached();
      addLog('system', 'attached ' + asset.kind + ' asset: ' + asset.label);
    }
    function renderAssets() {
      $('assetCount').textContent = state.assets.length + ' assets';
      $('assets').innerHTML = state.assets.map((asset) => {
        const media = asset.kind === 'image' ? '<img src="' + asset.url + '" alt="">' :
          asset.kind === 'video' ? '<video src="' + asset.url + '" controls></video>' :
          asset.kind === 'audio' ? '<audio src="' + asset.url + '" controls></audio>' : '';
        return '<article class="asset">' + media + '<div class="assetBody"><h3>' + escapeText(asset.label) + '</h3><p>' + escapeText(asset.prompt || asset.text || asset.createdAt) + '</p><div class="actions"><button class="btn" data-attach="' + asset.id + '">ATTACH</button><a class="btn" href="/api/grok/assets/' + asset.id + '/download">DOWNLOAD</a></div></div></article>';
      }).join('');
    }
    async function refreshAssets() {
      const data = await api('/api/grok/assets');
      state.assets = data.assets || [];
      renderAssets();
    }
    document.addEventListener('click', (event) => {
      const target = event.target;
      const tab = target.dataset?.tab;
      if (tab) {
        document.querySelectorAll('.tab').forEach((el) => el.classList.toggle('active', el.dataset.tab === tab));
        document.querySelectorAll('.tool[id^="tool-"]').forEach((el) => el.classList.toggle('active', el.id === 'tool-' + tab));
      }
      const attachId = target.dataset?.attach;
      if (attachId) {
        const asset = state.assets.find((item) => item.id === attachId);
        if (asset) attach(asset);
      }
      const detachId = target.dataset?.detach;
      if (detachId) {
        state.attached = state.attached.filter((item) => item.id !== detachId);
        renderAttached();
      }
    });
    $('chatForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = $('chatInput');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      const attachments = state.attached.map(({ id, kind, label, prompt, text, url }) => ({ id, kind, label, prompt, text, url }));
      state.messages.push({ role: 'user', content: text });
      addLog('user', text);
      try {
        const data = await api('/api/grok/chat', { method: 'POST', body: JSON.stringify({ messages: state.messages, attachments }) });
        state.messages.push({ role: 'assistant', content: data.reply });
        addLog('assistant', data.reply);
      } catch (error) { addLog('system', error.message); }
    });
    $('makeImage').dataset.label = $('makeImage').textContent;
    $('makeImage').addEventListener('click', async () => {
      setBusy('makeImage', true, 'GENERATING');
      try {
        const data = await api('/api/grok/image', { method: 'POST', body: JSON.stringify({ prompt: $('imagePrompt').value, aspect_ratio: $('imageRatio').value, resolution: $('imageRes').value }) });
        state.assets.unshift(data.asset); renderAssets(); attach(data.asset);
      } catch (error) { addLog('system', error.message); }
      finally { setBusy('makeImage', false); }
    });
    $('makeVideo').dataset.label = $('makeVideo').textContent;
    $('makeVideo').addEventListener('click', async () => {
      setBusy('makeVideo', true, 'STARTING');
      try {
        const data = await api('/api/grok/video', { method: 'POST', body: JSON.stringify({ prompt: $('videoPrompt').value, aspect_ratio: $('videoRatio').value, duration: Number($('videoDuration').value), resolution: '720p' }) });
        state.activeVideo = data.request_id;
        $('videoJob').textContent = 'job ' + data.request_id + ' status: ' + data.status;
        $('pollVideo').disabled = false;
      } catch (error) { addLog('system', error.message); }
      finally { setBusy('makeVideo', false); }
    });
    $('pollVideo').addEventListener('click', async () => {
      if (!state.activeVideo) return;
      try {
        const data = await api('/api/grok/video/' + encodeURIComponent(state.activeVideo));
        $('videoJob').textContent = 'job ' + state.activeVideo + ' status: ' + data.status;
        if (data.asset) { state.assets.unshift(data.asset); renderAssets(); attach(data.asset); $('pollVideo').disabled = true; }
      } catch (error) { addLog('system', error.message); }
    });
    $('makeSpeech').dataset.label = $('makeSpeech').textContent;
    $('makeSpeech').addEventListener('click', async () => {
      setBusy('makeSpeech', true, 'SPEAKING');
      try {
        const data = await api('/api/grok/tts', { method: 'POST', body: JSON.stringify({ text: $('ttsText').value, voice_id: $('voiceId').value, language: $('language').value }) });
        state.assets.unshift(data.asset); renderAssets(); attach(data.asset);
      } catch (error) { addLog('system', error.message); }
      finally { setBusy('makeSpeech', false); }
    });
    $('recordBtn').addEventListener('click', async () => {
      if (state.recorder && state.recorder.state === 'recording') {
        state.recorder.stop(); return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.chunks = [];
        state.recorder = new MediaRecorder(stream);
        state.recorder.ondataavailable = (event) => { if (event.data.size) state.chunks.push(event.data); };
        state.recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          clearInterval(state.recTimer);
          $('recMeter').style.width = '0%';
          $('recordBtn').textContent = 'REC';
          $('transcribeBtn').disabled = state.chunks.length === 0;
          $('voiceState').textContent = 'Recording captured. Ready to transcribe.';
        };
        state.recorder.start();
        $('recordBtn').textContent = 'STOP';
        $('voiceState').textContent = 'Recording...';
        let pct = 0;
        state.recTimer = setInterval(() => { pct = (pct + 7) % 100; $('recMeter').style.width = pct + '%'; }, 220);
      } catch (error) { addLog('system', error.message); }
    });
    $('transcribeBtn').addEventListener('click', async () => {
      const blob = new Blob(state.chunks, { type: state.chunks[0]?.type || 'audio/webm' });
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const data = await api('/api/grok/stt', { method: 'POST', body: JSON.stringify({ audioDataUrl: reader.result, language: $('language').value }) });
          state.assets.unshift(data.asset); renderAssets(); attach(data.asset);
          $('chatInput').value = data.text;
        } catch (error) { addLog('system', error.message); }
      };
      reader.readAsDataURL(blob);
    });
    api('/api/grok/status').then((data) => {
      $('xaiDot').classList.toggle('on', data.xai_available);
      $('xaiStatus').textContent = data.xai_available ? 'XAI_API_KEY online' : 'XAI_API_KEY missing';
    });
    addLog('system', 'Clawd Grok Studio booted. Generate media, speak, transcribe, attach assets, then chat.');
    refreshAssets().catch((error) => addLog('system', error.message));
  </script>
</body>
</html>`;
}

router.get('/grok', (_req: Request, res: Response) => {
  res.type('html').send(renderGrokPage());
});

router.get('/api/grok/status', (_req: Request, res: Response) => {
  res.json({
    xai_available: Boolean(apiKey()),
    chat_model: process.env.GROK_MODEL ?? 'grok-4.3',
    image_model: process.env.GROK_IMAGE_MODEL ?? 'grok-imagine-image-quality',
    video_model: process.env.GROK_VIDEO_MODEL ?? 'grok-imagine-video',
    tts_available: Boolean(apiKey()),
    stt_available: Boolean(apiKey()),
    assets: readAssets().length,
  });
});

router.get('/api/grok/assets', (_req: Request, res: Response) => {
  res.json({ assets: readAssets() });
});

router.get('/api/grok/assets/:id', (req: Request, res: Response) => {
  sendAsset(res, routeParam(req.params.id));
});

router.get('/api/grok/assets/:id/download', (req: Request, res: Response) => {
  sendAsset(res, routeParam(req.params.id), true);
});

router.post('/api/grok/chat', async (req: Request, res: Response) => {
  if (!requireXaiKey(res)) return;
  const body = req.body as {
    messages?: GrokMessage[];
    attachments?: Array<Pick<StudioAsset, 'id' | 'kind' | 'label' | 'prompt' | 'text' | 'url'>>;
  };
  const messages = (body.messages ?? [])
    .filter((message) => ['user', 'assistant', 'system'].includes(message.role) && typeof message.content === 'string')
    .slice(-16);
  const attachments = (body.attachments ?? []).slice(0, 8);
  const attachmentContext = attachments.length
    ? `\n\nAttached studio assets:\n${attachments.map((asset) => [
        `- ${asset.kind}: ${asset.label}`,
        asset.prompt ? `prompt=${asset.prompt}` : '',
        asset.text ? `text=${asset.text}` : '',
        asset.url ? `url=${asset.url}` : '',
      ].filter(Boolean).join(' | ')).join('\n')}`
    : '';

  try {
    const reply = await chat([
      { role: 'system', content: CHAT_SYSTEM + attachmentContext },
      ...messages,
    ], { max_tokens: 1400, temperature: 0.7 });
    res.json({ reply: reply ?? 'Grok returned no text.' });
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

router.post('/api/grok/image', async (req: Request, res: Response) => {
  if (!requireXaiKey(res)) return;
  const body = req.body as { prompt?: string; aspect_ratio?: string; resolution?: string; n?: number };
  const prompt = body.prompt?.trim();
  if (!prompt) {
    res.status(400).json({ error: 'prompt is required.' });
    return;
  }
  try {
    const data = await xaiJson<XaiImageResponse>('/images/generations', {
      model: process.env.GROK_IMAGE_MODEL ?? 'grok-imagine-image-quality',
      prompt,
      response_format: 'b64_json',
      aspect_ratio: body.aspect_ratio ?? '16:9',
      resolution: body.resolution ?? '1k',
      n: Math.min(Math.max(body.n ?? 1, 1), 4),
    });
    const first = data.data?.[0];
    if (!first?.b64_json && !first?.url) throw new Error('xAI returned no image data.');
    let asset: StudioAsset;
    if (first.b64_json) {
      asset = saveBufferAsset({
        kind: 'image',
        label: 'grok-image',
        prompt,
        mimeType: 'image/jpeg',
        buffer: Buffer.from(first.b64_json, 'base64'),
      });
    } else {
      const remote = await downloadRemoteAsset(first.url!);
      asset = saveBufferAsset({
        kind: 'image',
        label: 'grok-image',
        prompt,
        mimeType: remote.mimeType,
        buffer: remote.buffer,
      });
      asset.sourceUrl = first.url;
      addAsset(asset);
    }
    res.status(201).json({ asset, raw: { revised_prompt: first.revised_prompt } });
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

router.post('/api/grok/video', async (req: Request, res: Response) => {
  if (!requireXaiKey(res)) return;
  const body = req.body as { prompt?: string; aspect_ratio?: string; resolution?: string; duration?: number };
  const prompt = body.prompt?.trim();
  if (!prompt) {
    res.status(400).json({ error: 'prompt is required.' });
    return;
  }
  try {
    const data = await xaiJson<XaiVideoStartResponse>('/videos/generations', {
      model: process.env.GROK_VIDEO_MODEL ?? 'grok-imagine-video',
      prompt,
      duration: body.duration ?? 5,
      aspect_ratio: body.aspect_ratio ?? '16:9',
      resolution: body.resolution ?? '720p',
    });
    const requestId = data.request_id ?? data.id;
    if (!requestId) throw new Error('xAI returned no video request id.');
    res.status(202).json({ request_id: requestId, status: data.status ?? 'pending' });
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

router.get('/api/grok/video/:requestId', async (req: Request, res: Response) => {
  const key = requireXaiKey(res);
  if (!key) return;
  const requestId = routeParam(req.params.requestId);
  try {
    const upstream = await fetch(`${XAI_BASE_URL}/videos/${encodeURIComponent(requestId)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = (await upstream.json()) as XaiVideoStatusResponse;
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: JSON.stringify(data) });
      return;
    }
    if (data.status === 'done' && data.video?.url) {
      const remote = await downloadRemoteAsset(data.video.url);
      const asset = saveBufferAsset({
        kind: 'video',
        label: 'grok-video',
        prompt: `request ${requestId}`,
        mimeType: data.video.mime_type ?? data.video.content_type ?? remote.mimeType,
        buffer: remote.buffer,
      });
      asset.sourceUrl = data.video.url;
      addAsset(asset);
      res.json({ ...data, asset });
      return;
    }
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

router.post('/api/grok/tts', async (req: Request, res: Response) => {
  const key = requireXaiKey(res);
  if (!key) return;
  const body = req.body as { text?: string; voice_id?: string; language?: string };
  const text = body.text?.trim();
  if (!text) {
    res.status(400).json({ error: 'text is required.' });
    return;
  }
  try {
    const upstream = await fetch(`${XAI_BASE_URL}/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        text,
        voice_id: body.voice_id?.trim() || process.env.GROK_VOICE_ID || 'eve',
        language: body.language?.trim() || 'en',
      }),
    });
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: await upstream.text().catch(() => upstream.statusText) });
      return;
    }
    const mimeType = upstream.headers.get('content-type')?.split(';')[0] ?? 'audio/mpeg';
    const asset = saveBufferAsset({
      kind: 'audio',
      label: 'grok-speech',
      prompt: text,
      mimeType,
      buffer: Buffer.from(await upstream.arrayBuffer()),
    });
    res.status(201).json({ asset });
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

router.post('/api/grok/stt', async (req: Request, res: Response) => {
  const key = requireXaiKey(res);
  if (!key) return;
  const body = req.body as { audioDataUrl?: string; language?: string; format?: boolean; keyterm?: string };
  if (!body.audioDataUrl) {
    res.status(400).json({ error: 'audioDataUrl is required.' });
    return;
  }
  try {
    const audio = parseDataUrl(body.audioDataUrl);
    const audioArrayBuffer = new ArrayBuffer(audio.buffer.byteLength);
    new Uint8Array(audioArrayBuffer).set(audio.buffer);
    const form = new FormData();
    form.set('format', String(body.format ?? true));
    form.set('language', body.language?.trim() || 'en');
    if (body.keyterm?.trim()) form.set('keyterm', body.keyterm.trim());
    form.set('file', new Blob([audioArrayBuffer], { type: audio.mimeType }), `recording.${extFromMime(audio.mimeType, 'webm')}`);

    const upstream = await fetch(`${XAI_BASE_URL}/stt`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    const data = (await upstream.json()) as XaiSttResponse;
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: JSON.stringify(data) });
      return;
    }
    const text = data.text ?? '';
    const asset = saveTextAsset({ kind: 'transcript', label: 'grok-transcript', text, prompt: 'speech-to-text' });
    asset.text = text;
    addAsset(asset);
    res.status(201).json({ ...data, text, asset });
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

router.use('/grok/static', express.static(ASSET_DIR));

export default router;
