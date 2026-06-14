#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

const EXT_ID = 'ccalceefjldibjloiknckgbkajmjfokd'
const STORE_URL = `https://chromewebstore.google.com/detail/solana-clawd-pagent/${EXT_ID}`
const MAX_BODY_BYTES = 64 * 1024
const TASK_TIMEOUT_MS = 120000

const launcherTemplate = readFileSync(
	fileURLToPath(new URL('./launcher.html', import.meta.url)),
	'utf-8'
)

/**
 * HTTP + WebSocket bridge to the hub.html extension tab.
 * - HTTP serves the launcher page (triggers extension to open hub)
 * - WS carries execute/stop commands and result/error responses
 */
export class HubBridge {
	/** @type {number} */
	port

	/** @type {http.Server} */
	#httpServer

	/** @type {WebSocketServer} */
	#wss

	/** @type {import('ws').WebSocket | null} */
	#hub = null

	/** @type {boolean} */
	#hubReady = false

	/** @type {{ resolve: (r: {success: boolean, data: string}) => void, reject: (e: Error) => void, timeout: NodeJS.Timeout } | null} */
	#pendingTask = null

	/** @param {number} port */
	constructor(port) {
		this.port = port
		this.#httpServer = http.createServer((req, res) => this.#handleHttp(req, res))
		this.#wss = new WebSocketServer({ server: this.#httpServer })
		this.#wss.on('connection', (ws) => this.#onConnection(ws))
	}

	/**
	 * HTTP router — handles REST API used by the popup and background service worker,
	 * plus the launcher page that opens hub.html in the extension.
	 * @param {http.IncomingMessage} req
	 * @param {http.ServerResponse} res
	 */
	#handleHttp(req, res) {
		const cors = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		}

		if (req.method === 'OPTIONS') {
			res.writeHead(204, cors)
			res.end()
			return
		}

		// GET /status — checked by popup + background every 30 s
		if (req.method === 'GET' && req.url === '/status') {
			res.writeHead(200, { 'Content-Type': 'application/json', ...cors })
			res.end(JSON.stringify({ connected: this.connected, busy: this.busy, port: this.port }))
			return
		}

		// POST /execute — fire-and-wait from popup chat "Run in Browser"
		if (req.method === 'POST' && req.url === '/execute') {
			let body = ''
			let tooLarge = false
			req.on('data', chunk => {
				body += chunk
				if (body.length > MAX_BODY_BYTES) {
					tooLarge = true
					req.destroy()
				}
			})
			req.on('end', () => {
				if (tooLarge) {
					res.writeHead(413, { 'Content-Type': 'application/json', ...cors })
					res.end(JSON.stringify({ error: 'Request body too large' }))
					return
				}
				let task
				try { task = JSON.parse(body).task } catch {
					res.writeHead(400, { 'Content-Type': 'application/json', ...cors })
					res.end(JSON.stringify({ error: 'Invalid JSON body — expected { task: string }' }))
					return
				}
				task = String(task || '').trim()
				if (!task) {
					res.writeHead(400, { 'Content-Type': 'application/json', ...cors })
					res.end(JSON.stringify({ error: 'Missing task field' }))
					return
				}
				this.executeTask(task)
					.then(result => {
						res.writeHead(200, { 'Content-Type': 'application/json', ...cors })
						res.end(JSON.stringify(result))
					})
					.catch(err => {
						res.writeHead(503, { 'Content-Type': 'application/json', ...cors })
						res.end(JSON.stringify({ success: false, data: err.message }))
					})
			})
			return
		}

		// POST /stop — cancel current task
		if (req.method === 'POST' && req.url === '/stop') {
			this.stopTask()
			res.writeHead(200, { 'Content-Type': 'application/json', ...cors })
			res.end(JSON.stringify({ ok: true }))
			return
		}

		// GET / — launcher HTML that triggers extension to open hub.html
		const html = launcherTemplate
			.replaceAll('__EXT_ID__', EXT_ID)
			.replaceAll('__STORE_URL__', STORE_URL)
			.replaceAll('__WS_PORT__', String(this.port))
		res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
		res.end(html)
	}

	/** @returns {Promise<void>} */
	async start() {
		return new Promise((resolve, reject) => {
			this.#httpServer.on('error', (/** @type {NodeJS.ErrnoException} */ err) => {
				if (err.code === 'EADDRINUSE') {
					reject(
						new Error(`Port ${this.port} is in use. Another pAGENT MCP server may be running.`)
					)
				} else {
					reject(err)
				}
			})
			this.#httpServer.listen(this.port, '127.0.0.1', () => {
				const address = this.#httpServer.address()
				if (address && typeof address === 'object') {
					this.port = address.port
				}
				console.error(`[clawd-mcp] HTTP + WS on http://127.0.0.1:${this.port}`)
				resolve()
			})
		})
	}

	httpServerAddress() {
		return this.#httpServer.address()
	}

	get connected() {
		return this.#hub?.readyState === 1 && this.#hubReady
	}

	get busy() {
		return this.#pendingTask !== null
	}

	/**
	 * @param {string} task
	 * @param {Record<string, unknown>} [config]
	 * @returns {Promise<{success: boolean, data: string}>}
	 */
	async executeTask(task, config) {
		if (!this.connected) throw new Error('Hub is not connected. Is the extension running?')
		if (this.#pendingTask) throw new Error('Agent is already running a task.')

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				if (this.#pendingTask) {
					this.#pendingTask.reject(new Error('Agent task timed out'))
					this.#pendingTask = null
				}
			}, TASK_TIMEOUT_MS)
			this.#pendingTask = { resolve, reject, timeout }
			this.#hub.send(JSON.stringify({ type: 'execute', task, config }))
		})
	}

	stopTask() {
		if (this.connected) {
			this.#hub.send(JSON.stringify({ type: 'stop' }))
		}
	}

	/** @param {() => void} [callback] */
	close(callback) {
		for (const client of this.#wss.clients) {
			client.close()
		}
		this.#wss.close()
		const closePromise = new Promise((resolve, reject) => {
			this.#httpServer.close((err) => {
				if (err) reject(err)
				else resolve()
			})
		})
		if (callback) {
			closePromise.then(() => callback()).catch(() => callback())
		}
		return closePromise
	}

	// TODO: Add version checking

	/** @param {import('ws').WebSocket} ws */
	#onConnection(ws) {
		if (this.#hub && this.#hub.readyState === 1) {
			ws.close(4000, 'Another hub is already connected')
			return
		}

		this.#hub = ws
		console.error('[clawd-mcp] Hub connected')

		ws.on('message', (/** @type {Buffer} */ rawData) => {
			/** @type {{ type: string, success?: boolean, data?: string, message?: string }} */
			let msg
			try {
				msg = JSON.parse(rawData.toString('utf-8'))
			} catch {
				return
			}

			if (msg.type === 'ready') {
				this.#hubReady = true
				console.error('[clawd-mcp] Hub ready')
			} else if (msg.type === 'result') {
				if (this.#pendingTask) clearTimeout(this.#pendingTask.timeout)
				this.#pendingTask?.resolve({ success: msg.success ?? false, data: msg.data ?? '' })
				this.#pendingTask = null
			} else if (msg.type === 'error') {
				if (this.#pendingTask) clearTimeout(this.#pendingTask.timeout)
				this.#pendingTask?.reject(new Error(msg.message ?? 'Unknown error from hub'))
				this.#pendingTask = null
			}
		})

		ws.on('close', () => {
			console.error('[clawd-mcp] Hub disconnected')
			if (this.#hub === ws) {
				this.#hub = null
				this.#hubReady = false
			}
			if (this.#pendingTask) {
				clearTimeout(this.#pendingTask.timeout)
				this.#pendingTask.reject(new Error('Hub disconnected while task was running'))
				this.#pendingTask = null
			}
		})
	}
}
