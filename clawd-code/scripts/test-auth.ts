// scripts/test-auth.ts
// Quick test that API keys are configured and can reach the AI providers
// Usage: bun scripts/test-auth.ts
//
// Tests Grok (xAI) by default, with optional Claude (Anthropic) fallback.
// Set XAI_API_KEY or ANTHROPIC_API_KEY in environment.

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir: string =
  (import.meta as any).dir ??
  (import.meta as any).dirname ??
  dirname(fileURLToPath(import.meta.url))

const ROOT = resolve(__dir, '..')

// Load .env file if present
function loadEnv() {
  const envPath = resolve(ROOT, '.env')
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim()
          const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
          if (!process.env[key]) {
            process.env[key] = value
          }
        }
      }
    }
  }
}

loadEnv()

async function testGrok() {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    console.log('  ⚠️  XAI_API_KEY not set — skipping Grok test')
    return false
  }

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.XAI_MODEL || 'grok-4.3',
        messages: [{ role: 'user', content: 'Say "hello from Clawd Code" and nothing else.' }],
        max_tokens: 50,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`HTTP ${response.status}: ${text}`)
    }

    const data = await response.json() as any
    const content = data?.choices?.[0]?.message?.content || '(unexpected format)'
    console.log('✅ Grok/xAI connection successful!')
    console.log('   Response:', content)
    return true
  } catch (err: any) {
    console.error('❌ Grok/xAI connection failed:', err.message)
    return false
  }
}

async function testClaude() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.log('  ⚠️  ANTHROPIC_API_KEY not set — skipping Claude test')
    return false
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Say "hello from Clawd Code" and nothing else.' }],
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`HTTP ${response.status}: ${text}`)
    }

    const data = await response.json() as any
    const content = data?.content?.[0]?.text || '(unexpected format)'
    console.log('✅ Anthropic/Claude connection successful!')
    console.log('   Response:', content)
    return true
  } catch (err: any) {
    console.error('❌ Anthropic/Claude connection failed:', err.message)
    return false
  }
}

async function main() {
  console.log('Clawd Code Auth Test\n')

  const grokOk = await testGrok()
  const claudeOk = await testClaude()

  console.log('')
  if (grokOk || claudeOk) {
    console.log('✅ At least one provider is configured and reachable.')
  } else {
    console.log('❌ No providers are configured. Set XAI_API_KEY or ANTHROPIC_API_KEY.')
    console.log('   Copy .env.example to .env and fill in your keys.')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})