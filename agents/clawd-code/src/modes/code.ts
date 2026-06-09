/**
 * Clawd Code — CODE MODE
 * Write, review, and ship production code
 */

import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export class CodeMode {
  constructor(private config: any) {}

  async run(args: string[]): Promise<void> {
    const command = args.filter(a => !a.startsWith('--')).join(' ');
    
    console.log('\n[CODE MODE] Initiating code synthesis...\n');
    
    if (!this.config.xaiApiKey) {
      console.error('[CODE MODE] ERROR: XAI_API_KEY not set. Grok unavailable.');
      console.log('Set XAI_API_KEY in ~/.clawd-code/.env to enable AI code generation.');
      return;
    }

    // Use Grok to generate code
    const code = await this.generateWithGrok(command);
    
    // Write output
    const outputDir = join(process.cwd(), 'outputs');
    mkdirSync(outputDir, { recursive: true });
    const timestamp = Date.now();
    const filename = `clawd-code-${timestamp}.ts`;
    const filepath = join(outputDir, filename);
    
    writeFileSync(filepath, code);
    console.log(`\n[CODE MODE] Code written to: ${filepath}`);
    
    // Offer to run type check
    if (existsSync('tsconfig.json')) {
      console.log('\n[CODE MODE] Running TypeScript check...');
      try {
        execSync('npx tsc --noEmit', { stdio: 'inherit' });
        console.log('[CODE MODE] ✓ TypeScript check passed');
      } catch {
        console.log('[CODE MODE] ⚠ TypeScript check failed (see above)');
      }
    }
  }

  private async generateWithGrok(prompt: string): Promise<string> {
    // Use OpenAI-compatible SDK with xAI base URL
    const { spawn } = await import('child_process');
    
    const systemPrompt = `You are Clawd Code. Ship production TypeScript/Solana code only. No prose. Just code with brief inline comments. Include imports, types, error handling. Format for .ts files.`;

    const pythonCode = `
import os
import httpx
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("XAI_API_KEY", ""),
    base_url="https://api.x.ai/v1"
)

response = client.chat.completions.create(
    model="grok-4.3",
    messages=[
        {"role": "system", "content": "${systemPrompt.replace(/"/g, '\\"')}"},
        {"role": "user", "content": "${prompt.replace(/"/g, '\\"')}"}
    ],
    max_tokens=4000,
    temperature=0.7
)

print(response.choices[0].message.content)
`;

    try {
      const result = spawn('python3', ['-c', pythonCode], { 
        env: { ...process.env, XAI_API_KEY: this.config.xaiApiKey },
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let output = '';
      result.stdout.on('data', (data) => { output += data.toString(); });
      
      return new Promise((resolve) => {
        result.on('close', () => resolve(output || '// Code generation unavailable'));
      });
    } catch (error) {
      console.log('[CODE MODE] Grok unavailable, generating fallback code...');
      return this.fallbackCode(prompt);
    }
  }

  private fallbackCode(prompt: string): string {
    return `// Clawd Code — Generated Code
// Note: Grok unavailable. Add XAI_API_KEY to ~/.clawd-code/.env

${prompt}

export {};
`;
  }
}