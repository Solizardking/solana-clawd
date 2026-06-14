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

test('background service worker registers one alarm listener and handles core messages', async () => {
  const source = await readFile(new URL('background.js', root), 'utf8')
  const storage = new Map()
  const alarmListeners = []
  let messageListener

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
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessage: { addListener(listener) { messageListener = listener } },
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
    Date,
    Error,
    JSON,
  }

  vm.runInNewContext(source, context)

  assert.equal(alarmListeners.length, 1)
  assert.equal(typeof messageListener, 'function')

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
})
