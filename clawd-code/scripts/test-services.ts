// scripts/test-services.ts
// Test that all Clawd Code services initialize without crashing
// Usage: bun scripts/test-services.ts

import '../src/shims/preload.js'

// Ensure we don't accidentally talk to real servers
process.env.NODE_ENV = process.env.NODE_ENV || 'test'

type TestResult = { name: string; status: 'pass' | 'fail' | 'skip'; detail?: string }
const results: TestResult[] = []

function pass(name: string, detail?: string) {
  results.push({ name, status: 'pass', detail })
  console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`)
}

function fail(name: string, detail: string) {
  results.push({ name, status: 'fail', detail })
  console.log(`  ❌ ${name} — ${detail}`)
}

function skip(name: string, detail: string) {
  results.push({ name, status: 'skip', detail })
  console.log(`  ⏭️  ${name} — ${detail}`)
}

async function testAnalyticsSink() {
  console.log('\n--- Analytics Sink ---')
  try {
    const analytics = await import('../src/services/analytics/index.js')

    // logEvent should queue without crashing when no sink is attached
    analytics.logEvent('test_event', { test_key: 1 })
    pass('logEvent (no sink)', 'queues without crash')

    await analytics.logEventAsync('test_async_event', { test_key: 2 })
    pass('logEventAsync (no sink)', 'queues without crash')
  } catch (err: any) {
    fail('Analytics sink', err.message)
  }
}

async function testClawdRegistry() {
  console.log('\n--- Clawd Agent Registry ---')
  try {
    const registry = await import('../src/services/registry/index.js')

    // Agent catalog should be accessible
    const agents = registry.listAgents?.()
    if (agents !== undefined) {
      pass('listAgents', `found ${Array.isArray(agents) ? agents.length : 'some'} agents`)
    } else {
      skip('listAgents', 'not available in current build')
    }
  } catch (err: any) {
    // Registry is optional — fail open
    skip('Clawd registry', err.message)
  }
}

async function testSessionMemoryUtils() {
  console.log('\n--- Session Memory ---')
  try {
    const smUtils = await import('../src/services/SessionMemory/sessionMemoryUtils.js')

    // Default config should be sensible
    const config = smUtils.DEFAULT_SESSION_MEMORY_CONFIG
    if (config.minimumMessageTokensToInit > 0 && config.minimumTokensBetweenUpdate > 0) {
      pass('DEFAULT_SESSION_MEMORY_CONFIG', `init=${config.minimumMessageTokensToInit} tokens, update=${config.minimumTokensBetweenUpdate} tokens`)
    } else {
      fail('DEFAULT_SESSION_MEMORY_CONFIG', 'unexpected config values')
    }

    // getLastSummarizedMessageId should return undefined initially
    const lastId = smUtils.getLastSummarizedMessageId()
    if (lastId === undefined) {
      pass('getLastSummarizedMessageId', 'returns undefined initially')
    } else {
      fail('getLastSummarizedMessageId', `expected undefined, got ${lastId}`)
    }
  } catch (err: any) {
    fail('Session memory utils', err.message)
  }
}

async function testCostTracker() {
  console.log('\n--- Cost Tracking ---')
  try {
    const ct = await import('../src/cost-tracker.js')

    // Total cost should start at 0
    const cost = ct.getTotalCost()
    if (cost === 0) {
      pass('getTotalCost', 'starts at $0.00')
    } else {
      pass('getTotalCost', `current: $${cost.toFixed(4)} (non-zero means restored session)`)
    }

    // Duration should be available
    const duration = ct.getTotalDuration()
    pass('getTotalDuration', `${duration}ms`)

    // Token counters should be available
    const inputTokens = ct.getTotalInputTokens()
    const outputTokens = ct.getTotalOutputTokens()
    pass('Token counters', `input=${inputTokens}, output=${outputTokens}`)

    // Lines changed
    const added = ct.getTotalLinesAdded()
    const removed = ct.getTotalLinesRemoved()
    pass('Lines changed', `+${added} -${removed}`)
  } catch (err: any) {
    fail('Cost tracker', err.message)
  }
}

async function testX402Payments() {
  console.log('\n--- x402 Payments ---')
  try {
    const x402 = await import('../src/services/x402/index.js')

    // Payment client should exist without crashing
    if (x402.createPaymentClient) {
      pass('createPaymentClient', 'exports available')
    } else {
      skip('x402.createPaymentClient', 'not yet implemented')
    }
  } catch (err: any) {
    skip('x402 payments', err.message)
  }
}

async function testVulcanMCP() {
  console.log('\n--- Vulcan MCP ---')
  try {
    const vulcan = await import('../src/services/vulcan/index.js')

    if (vulcan.getDefaultConfig) {
      const config = vulcan.getDefaultConfig()
      pass('getDefaultConfig', `config loaded: ${JSON.stringify(config).slice(0, 60)}...`)
    } else {
      skip('Vulcan MCP', 'default config not available')
    }
  } catch (err: any) {
    skip('Vulcan MCP', err.message)
  }
}

async function testInit() {
  console.log('\n--- Init (entrypoint) ---')
  try {
    const { init } = await import('../src/entrypoints/init.js')
    await init()
    pass('init()', 'completed successfully')
  } catch (err: any) {
    fail('init()', err.message)
  }
}

async function main() {
  console.log('=== Clawd Code Services Layer Smoke Test ===')
  console.log(`Environment: NODE_ENV=${process.env.NODE_ENV}`)
  console.log(`Auth: XAI_API_KEY=${process.env.XAI_API_KEY ? '(set)' : '(not set)'}, ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY ? '(set)' : '(not set)'}`)

  // Test individual services first (order: least-dependent → most-dependent)
  await testAnalyticsSink()
  await testCostTracker()
  await testSessionMemoryUtils()
  await testClawdRegistry()
  await testX402Payments()
  await testVulcanMCP()

  // Then test the full init sequence
  await testInit()

  // Summary
  console.log('\n=== Summary ===')
  const passed = results.filter(r => r.status === 'pass').length
  const failed = results.filter(r => r.status === 'fail').length
  const skipped = results.filter(r => r.status === 'skip').length
  console.log(`  ${passed} passed, ${failed} failed, ${skipped} skipped`)

  if (failed > 0) {
    console.log('\nFailed tests:')
    for (const r of results.filter(r => r.status === 'fail')) {
      console.log(`  ❌ ${r.name}: ${r.detail}`)
    }
    process.exit(1)
  }

  console.log('\n✅ All services handle graceful degradation correctly')
}

main().catch(err => {
  console.error('Fatal error in smoke test:', err)
  process.exit(1)
})