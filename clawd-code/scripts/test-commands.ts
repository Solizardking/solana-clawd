// scripts/test-commands.ts
// Verify all Clawd Code commands load without errors
// Usage: bun scripts/test-commands.ts

// Load MACRO global before any app code
import '../src/shims/macro.js'

async function main() {
  const { getCommands } = await import('../src/commands.js')

  const cwd = process.cwd()
  const commands = await getCommands(cwd)

  console.log(`Loaded ${commands.length} commands:\n`)

  // Group commands by type for readability
  const byType: Record<string, typeof commands> = {}
  for (const cmd of commands) {
    const t = cmd.type
    if (!byType[t]) byType[t] = []
    byType[t]!.push(cmd)
  }

  for (const [type, cmds] of Object.entries(byType)) {
    console.log(`  [${type}] (${cmds.length} commands)`)
    for (const cmd of cmds) {
      const aliases = cmd.aliases?.length ? ` (aliases: ${cmd.aliases.join(', ')})` : ''
      const hidden = cmd.isHidden ? ' [hidden]' : ''
      const source = cmd.type === 'prompt' ? ` (source: ${cmd.source})` : ''
      console.log(`    /${cmd.name} — ${cmd.description || '(no description)'}${aliases}${hidden}${source}`)
    }
    console.log()
  }

  // Verify essential Clawd Code commands are present
  const essential = ['help', 'wallet', 'perps', 'config', 'arena']
  const commandNames = new Set(commands.map(c => c.name))
  const missing = essential.filter(n => !commandNames.has(n))

  if (missing.length > 0) {
    console.error(`❌ Missing essential commands: ${missing.join(', ')}`)
    process.exit(1)
  }

  console.log(`✅ All ${essential.length} essential commands present: ${essential.join(', ')}`)

  // Check Clawd-specific commands
  const clawdSpecific = commands.filter(
    c => c.name.startsWith('clawd') || c.name === 'perps' || c.name === 'wallet' || c.name === 'arena'
  )

  if (clawdSpecific.length > 0) {
    console.log(`✅ Clawd-specific commands present: ${clawdSpecific.map(c => c.name).join(', ')}`)
  }

  console.log(`\n✅ Command system loaded successfully (${commands.length} commands)`)
}

main().catch(err => {
  console.error('❌ Command loading failed:', err)
  process.exit(1)
})