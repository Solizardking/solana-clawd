import assert from 'node:assert/strict'
import test from 'node:test'
import { WebSocket } from 'ws'

import { HubBridge } from '../mcp/src/hub-bridge.js'

function randomPort() {
  return 43000 + Math.floor(Math.random() * 10000)
}

test('HubBridge serves status on loopback and rejects empty execute requests', async () => {
  const port = randomPort()
  const bridge = new HubBridge(port)
  await bridge.start()

  try {
    const status = await fetch(`http://127.0.0.1:${port}/status`)
    assert.equal(status.ok, true)
    assert.deepEqual(await status.json(), { connected: false, busy: false, port })

    const emptyExecute = await fetch(`http://127.0.0.1:${port}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: '   ' }),
    })
    assert.equal(emptyExecute.status, 400)
    assert.match((await emptyExecute.text()), /Missing task field/)
  } finally {
    await new Promise((resolve) => bridge.close(resolve))
  }
})

test('HubBridge forwards execute and stop commands through the connected hub', async () => {
  const port = randomPort()
  const bridge = new HubBridge(port)
  await bridge.start()

  const ws = new WebSocket(`ws://127.0.0.1:${port}`)
  const messages = []

  try {
    await new Promise((resolve) => ws.once('open', resolve))
    ws.on('message', (raw) => {
      const message = JSON.parse(raw.toString('utf8'))
      messages.push(message)
      if (message.type === 'execute') {
        ws.send(JSON.stringify({ type: 'result', success: true, data: `done: ${message.task}` }))
      }
    })
    ws.send(JSON.stringify({ type: 'ready' }))

    await new Promise((resolve) => setTimeout(resolve, 25))
    assert.equal(bridge.connected, true)

    const result = await bridge.executeTask('open settings')
    assert.deepEqual(result, { success: true, data: 'done: open settings' })
    assert.equal(messages[0].type, 'execute')
    assert.equal(messages[0].task, 'open settings')

    bridge.stopTask()
    await new Promise((resolve) => setTimeout(resolve, 25))
    assert.equal(messages.at(-1).type, 'stop')
  } finally {
    ws.close()
    await new Promise((resolve) => bridge.close(resolve))
  }
})
