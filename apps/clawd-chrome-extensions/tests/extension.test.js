import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'

const root = new URL('../', import.meta.url)

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), 'utf8'))
}

test('manifest declares the MV3 popup, service worker, icons, and localhost host permissions', async () => {
  const manifest = await readJson('manifest.json')

  assert.equal(manifest.manifest_version, 3)
  assert.equal(manifest.action.default_popup, 'popup.html')
  assert.equal(manifest.background.service_worker, 'background.js')
  assert.equal(manifest.permissions.includes('storage'), true)
  assert.equal(manifest.permissions.includes('alarms'), true)
  assert.equal(manifest.permissions.includes('tabs'), true)
  assert.deepEqual(manifest.content_scripts, [
    {
      matches: [
        'https://x402.wtf/*',
        'https://*.x402.wtf/*',
        'https://cheshireterminal.ai/*',
        'https://*.cheshireterminal.ai/*',
        'http://localhost/*',
        'http://127.0.0.1/*',
      ],
      js: ['site-bridge.js'],
      run_at: 'document_start',
    },
  ])
  assert.deepEqual(manifest.externally_connectable.matches, [
    'https://x402.wtf/*',
    'https://*.x402.wtf/*',
    'https://cheshireterminal.ai/*',
    'https://*.cheshireterminal.ai/*',
    'http://localhost:*/*',
    'http://127.0.0.1:*/*',
  ])

  for (const size of ['16', '32', '48', '128']) {
    assert.equal(manifest.icons[size], `icons/icon${size}.png`)
  }

  for (const host of manifest.host_permissions) {
    assert.match(host, /^http:\/\/(127\.0\.0\.1|localhost):\d+\//)
  }

  for (const port of ['7777', '18790', '8420', '38401', '9099']) {
    assert.equal(
      manifest.host_permissions.some((permission) => permission.includes(`127.0.0.1:${port}`)),
      true,
      `missing 127.0.0.1:${port}`
    )
  }
})

test('popup has matching tabs and tab content panels for every top-level feature', async () => {
  const html = await readFile(new URL('popup.html', root), 'utf8')
  const tabNames = [...html.matchAll(/class="tab[^"]*"\s+data-tab="([^"]+)"/g)].map((match) => match[1])
  const panelNames = [...html.matchAll(/class="tab-content[^"]*"\s+id="tab-([^"]+)"/g)].map((match) => match[1])

  assert.deepEqual(tabNames, ['wallet', 'seeker', 'miner', 'chat', 'tools', 'vault'])
  assert.deepEqual(panelNames.sort(), tabNames.toSorted())
})

test('popup defines every non-dynamic DOM id used by popup.js and ships no OpenRouter key', async () => {
  const [html, js] = await Promise.all([
    readFile(new URL('popup.html', root), 'utf8'),
    readFile(new URL('popup.js', root), 'utf8'),
  ])
  const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]))
  const referencedIds = [...js.matchAll(/getElementById\('([^']+)'\)/g)].map((match) => match[1])
  const ignoredDynamicIds = new Set(['settingOrModelCustom'])
  const missing = [...new Set(referencedIds)].filter((id) => !htmlIds.has(id) && !ignoredDynamicIds.has(id))

  assert.deepEqual(missing, [])
  assert.match(js, /const OR_BUNDLED_KEY = '';/)
  assert.doesNotMatch(js, /sk-or-v1-[A-Za-z0-9_-]{20,}/)
})

test('site bridge forwards page messages through chrome runtime', async () => {
  const source = await readFile(new URL('site-bridge.js', root), 'utf8')
  const listeners = {}
  const posted = []
  const sent = []

  const window = {
    location: { origin: 'https://x402.wtf' },
    addEventListener(type, listener) {
      listeners[type] = listener
    },
    postMessage(message, targetOrigin) {
      posted.push({ message, targetOrigin })
    },
  }
  window.window = window

  const chrome = {
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        sent.push(message)
        callback({ ok: true, data: 'pong' })
      },
    },
  }

  vm.runInNewContext(source, { window, chrome, String })

  assert.equal(posted[0].message.__clawdExtensionBridge, true)
  assert.equal(posted[0].message.direction, 'ready')

  listeners.message({
    source: window,
    origin: 'https://x402.wtf',
    data: {
      __clawdExtensionBridge: true,
      direction: 'request',
      id: 'req-1',
      message: { type: 'CLAWD_EXTENSION_STATUS' },
    },
  })

  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [
    { type: 'CLAWD_BRIDGE_FROM_PAGE', payload: { type: 'CLAWD_EXTENSION_STATUS' } },
  ])
  assert.equal(posted[1].message.direction, 'response')
  assert.equal(posted[1].message.id, 'req-1')
  assert.deepEqual(posted[1].message.response, { ok: true, data: 'pong' })
})

test('background service worker registers one alarm listener and handles core messages', async () => {
  const source = await readFile(new URL('background.js', root), 'utf8')
  const storage = new Map()
  const alarmListeners = []
  let messageListener
  let externalMessageListener
  const createdTabs = []

  const chrome = {
    action: {
      setBadgeText() {},
      setBadgeBackgroundColor() {},
    },
    alarms: {
      create() {},
      onAlarm: { addListener(listener) { alarmListeners.push(listener) } },
    },
    runtime: {
      id: 'test-extension-id',
      getManifest: () => ({ version: '3.0.0' }),
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessage: { addListener(listener) { messageListener = listener } },
      onMessageExternal: { addListener(listener) { externalMessageListener = listener } },
    },
    tabs: {
      create(tab) {
        createdTabs.push(tab)
        return Promise.resolve(tab)
      },
    },
    storage: {
      local: {
        get(keys, callback) {
          const result = {}
          for (const key of keys) result[key] = storage.get(key)
          callback(result)
        },
        set(values, callback = () => {}) {
          for (const [key, value] of Object.entries(values)) storage.set(key, value)
          callback()
        },
      },
    },
  }

  const context = {
    chrome,
    console,
    AbortSignal: { timeout: () => undefined },
    fetch: async () => ({ ok: false, status: 503, text: async () => 'offline' }),
    Promise,
    Set,
    String,
    Number,
    Date,
    Error,
    JSON,
    URL,
    URLSearchParams,
  }

  vm.runInNewContext(source, context)

  assert.equal(alarmListeners.length, 1)
  assert.equal(typeof messageListener, 'function')
  assert.equal(typeof externalMessageListener, 'function')

  const settingsResponse = await new Promise((resolve) => {
    const asyncResponse = messageListener({ type: 'GET_SETTINGS' }, {}, resolve)
    assert.equal(asyncResponse, true)
  })
  assert.equal(settingsResponse.nanobotUrl, 'http://127.0.0.1:7777')
  assert.equal(settingsResponse.clawdGatewaySecret, '')
  assert.equal(settingsResponse.seekerGatewayAuthMode, 'auto')

  const saveResponse = await new Promise((resolve) => {
    const asyncResponse = messageListener({ type: 'SAVE_SETTINGS', data: { network: 'devnet' } }, {}, resolve)
    assert.equal(asyncResponse, true)
  })
  assert.equal(saveResponse.ok, true)
  assert.equal(storage.get('network'), 'devnet')

  const externalStatus = await new Promise((resolve) => {
    const asyncResponse = externalMessageListener(
      { type: 'CLAWD_EXTENSION_STATUS' },
      { origin: 'https://x402.wtf' },
      resolve
    )
    assert.equal(asyncResponse, true)
  })
  assert.equal(externalStatus.ok, true)
  assert.equal(externalStatus.extension.id, 'test-extension-id')

  const bridgeStatus = await new Promise((resolve) => {
    const asyncResponse = messageListener(
      { type: 'CLAWD_BRIDGE_FROM_PAGE', payload: { type: 'CLAWD_EXTENSION_STATUS' } },
      { url: 'https://x402.wtf/terminal' },
      resolve
    )
    assert.equal(asyncResponse, true)
  })
  assert.equal(bridgeStatus.ok, true)
  assert.equal(bridgeStatus.extension.id, 'test-extension-id')

  const bridgeDenied = await new Promise((resolve) => {
    messageListener(
      { type: 'CLAWD_BRIDGE_FROM_PAGE', payload: { type: 'CLAWD_EXTENSION_STATUS' } },
      { url: 'https://evil.example/terminal' },
      resolve
    )
  })
  assert.equal(bridgeDenied.ok, false)
  assert.equal(bridgeDenied.error, 'origin not allowed')

  const externalDenied = await new Promise((resolve) => {
    externalMessageListener(
      { type: 'CLAWD_EXTENSION_STATUS' },
      { origin: 'https://evil.example' },
      resolve
    )
  })
  assert.equal(externalDenied.ok, false)
  assert.equal(externalDenied.error, 'origin not allowed')

  const phantomResponse = await new Promise((resolve) => {
    externalMessageListener(
      { type: 'CLAWD_OPEN_PHANTOM', url: 'https://x402.wtf/telegram' },
      { origin: 'https://x402.wtf' },
      resolve
    )
  })
  assert.equal(phantomResponse.ok, true)
  assert.equal(createdTabs.length, 1)
  assert.match(createdTabs[0].url, /^https:\/\/phantom\.app\/ul\/browse\//)
})
