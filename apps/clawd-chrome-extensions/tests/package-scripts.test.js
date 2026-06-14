import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const buildPackages = ['llms', 'core', 'page-controller', 'page-agent', 'ui']

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), 'utf8'))
}

test('source packages expose build scripts and direct-install packages keep lockfiles', async () => {
  for (const pkg of buildPackages) {
    const packageJson = await readJson(`${pkg}/package.json`)
    assert.equal(typeof packageJson.scripts?.build, 'string', `${pkg} is missing scripts.build`)
  }

  for (const pkg of ['llms', 'page-controller', 'page-agent', 'mcp']) {
    assert.equal(existsSync(new URL(`${pkg}/package-lock.json`, root)), true, `${pkg} is missing package-lock.json`)
  }
})

test('checked-in JavaScript entrypoints parse', () => {
  const files = [
    'background.js',
    'popup.js',
    'mcp/src/index.js',
    'mcp/src/hub-bridge.js',
    'clawd-agent/background.js',
    'clawd-agent/main-world.js',
  ]

  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', new URL(file, root).pathname], {
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, `${file} failed syntax check:\n${result.stderr}`)
  }
})
