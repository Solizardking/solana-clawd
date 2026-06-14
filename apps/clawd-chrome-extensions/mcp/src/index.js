#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { exec } from 'node:child_process'
import { platform } from 'node:os'
import * as z from 'zod/v4'

import { HubBridge } from './hub-bridge.js'

const env = process.env
const port = parseInt(env.PORT || '38401')

/** @type {Record<string, string>} */
const llmConfig = {}

// Provider-specific keys wire sane defaults while still allowing LLM_* overrides.
if (env.XAI_API_KEY) {
	llmConfig.baseURL = env.XAI_BASE_URL || env.LLM_BASE_URL || 'https://api.x.ai/v1'
	llmConfig.model   = env.XAI_MODEL_NAME || env.LLM_MODEL_NAME || 'grok-4.3'
	llmConfig.apiKey  = env.XAI_API_KEY
} else if (env.GOOGLE_API_KEY) {
	llmConfig.baseURL = env.GOOGLE_BASE_URL || env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai'
	llmConfig.model   = env.GOOGLE_MODEL_NAME || env.LLM_MODEL_NAME || 'gemini-2.5-flash'
	llmConfig.apiKey  = env.GOOGLE_API_KEY
} else if (env.OPENROUTER_API_KEY) {
	llmConfig.baseURL = env.LLM_BASE_URL || 'https://openrouter.ai/api/v1'
	llmConfig.model   = env.LLM_MODEL_NAME || 'deepseek/deepseek-r1-0528:free'
	llmConfig.apiKey  = env.OPENROUTER_API_KEY
} else {
	if (env.LLM_BASE_URL)   llmConfig.baseURL = env.LLM_BASE_URL
	if (env.LLM_MODEL_NAME) llmConfig.model   = env.LLM_MODEL_NAME
	if (env.LLM_API_KEY)    llmConfig.apiKey  = env.LLM_API_KEY
}

// --- Hub bridge (HTTP + WebSocket) ---

const hub = new HubBridge(port)
await hub.start()

// Open launcher in default browser
const url = `http://localhost:${port}`
const cmd = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start ""' : 'xdg-open'
exec(`${cmd} "${url}"`, (err) => {
	if (err) console.error(`[clawd-mcp] Could not open browser: ${err.message}`)
})

// --- MCP server (stdio) ---

const mcpServer = new McpServer({ name: 'clawd-pagent-browser', version: '2.0.0' })

mcpServer.registerTool(
	'execute_task',
	{
		description: "Execute a task in user's browser.",
		inputSchema: {
			task: z
				.string()
				.describe(
					'Task description. Give specific instructions for the task. Steps preferable. And the information you want to get after the task is done.'
				),
		},
	},
	async ({ task }) => {
		try {
			const config = Object.keys(llmConfig).length > 0 ? llmConfig : undefined
			const result = await hub.executeTask(task, config)
			return {
				content: [
					{
						type: 'text',
						text: result.success
							? `Task completed.\n\n${result.data}`
							: `Task failed.\n\n${result.data}`,
					},
				],
			}
		} catch (err) {
			return {
				content: [{ type: 'text', text: `Error: ${err.message}` }],
				isError: true,
			}
		}
	}
)

mcpServer.registerTool(
	'get_status',
	{
		description: 'Check the current status of the pAGENT hub.',
	},
	async () => ({
		content: [
			{
				type: 'text',
				text: JSON.stringify({ connected: hub.connected, busy: hub.busy }, null, 2),
			},
		],
	})
)

mcpServer.registerTool(
	'stop_task',
	{
		description: 'Stop the currently running browser automation task.',
	},
	async () => {
		hub.stopTask()
		return { content: [{ type: 'text', text: 'Stop signal sent.' }] }
	}
)

const transport = new StdioServerTransport()
await mcpServer.connect(transport)
console.error('[clawd-mcp] MCP server ready (stdio)')
