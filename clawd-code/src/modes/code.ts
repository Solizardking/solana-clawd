/**
 * Clawd Code — CODE MODE
 * Write, review, and ship production code
 */

import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createXaiClient } from '../xai.js';
import { createDeepSeekClient } from '../deepseek.js';

export class CodeMode {
  constructor(private config: any) {}

  async run(args: string[]): Promise<void> {
    const command = args.filter(a => !a.startsWith('--')).join(' ');
    
    console.log('\n[CODE MODE] Initiating code synthesis...\n');
    
    if (!this.hasConfiguredProvider()) {
      console.error('[CODE MODE] ERROR: No API key configured for selected provider.');
      console.log('Set XAI_API_KEY or DEEPSEEK_API_KEY in ~/.clawd-code/.env or ./clawd-code/.env.');
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
    const systemPrompt = `You are Clawd Code. Ship production TypeScript/Solana code only. No prose. Just code with brief inline comments. Include imports, types, error handling. Format for .ts files.`;

    try {
      if (this.shouldUseDeepSeek()) {
        const client = createDeepSeekClient(this.config.deepSeekApiKey, this.config.deepSeekBaseUrl);
        if (!client) return this.fallbackCode(prompt);

        const response = await client.chat({
          model: this.getDeepSeekModel(),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          maxTokens: 4000,
          temperature: 0.7,
          reasoningEffort: 'high',
          thinking: true,
        });

        return response.content || '// Code generation unavailable';
      }

      const client = createXaiClient(this.config.xaiApiKey);
      if (!client) return this.fallbackCode(prompt);

      const response = await client.chat({
        model: this.config.model === 'grok-4.20-multi-agent' ? 'grok-4.3' : (this.config.model || 'grok-4.3'),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        maxTokens: 4000,
        temperature: 0.7,
      });

      return response.content || '// Code generation unavailable';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[CODE MODE] Grok unavailable: ${message}`);
      console.log('[CODE MODE] Generating fallback code...');
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

  private hasConfiguredProvider(): boolean {
    if (this.shouldUseDeepSeek()) return Boolean(this.config.deepSeekApiKey);
    return Boolean(this.config.xaiApiKey);
  }

  private shouldUseDeepSeek(): boolean {
    return this.config.provider === 'deepseek' || String(this.config.model || '').startsWith('deepseek-');
  }

  private getDeepSeekModel(): string {
    const model = String(this.config.model || '');
    return model.startsWith('deepseek-') ? model : 'deepseek-v4-pro';
  }
}
