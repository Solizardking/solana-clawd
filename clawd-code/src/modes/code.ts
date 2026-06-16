/**
 * Clawd Code — CODE MODE
 * Write, review, and ship production code
 * Default provider: xAI Grok (grok-4.3). Streams via SSE like Anthropic & OpenRouter.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAnthropicClient, DEFAULT_CLAUDE_MODEL, isClaudeModel } from '../anthropic.js';
import { createDeepSeekClient } from '../deepseek.js';
import { loadClawdEnv } from '../env.js';
import {
  DEFAULT_MODEL,
  isResponsesOnlyModel,
  normalizeModelId,
  resolveModelForMode,
} from '../grok-models.js';
import { createOpenRouterClient } from '../openrouter.js';
import { createXaiClient } from '../xai.js';

const CODE_SYSTEM = `You are Clawd Code. Ship production TypeScript/Solana code only. No prose. Just code with brief inline comments. Include imports, types, error handling. Format for .ts files.`;

interface CodeConfig {
  provider?: string;
  model?: string;
  stream?: boolean;
  xaiApiKey?: string;
  anthropicApiKey?: string;
  deepSeekApiKey?: string;
  deepSeekBaseUrl?: string;
}

export class CodeMode {
  constructor(private config: CodeConfig) {}

  async run(args: string[]): Promise<void> {
    const command = args.filter((a) => !a.startsWith('--')).join(' ');

    console.log('\n[CODE MODE] Initiating code synthesis...\n');

    const provider = this.resolveProvider();
    const requested = this.config.model ?? DEFAULT_MODEL;
    const model = resolveModelForMode(requested, 'code');
    if (isResponsesOnlyModel(requested) && model !== requested) {
      console.log(`[CODE MODE] ${requested} is responses-only — falling back to ${model} for tool use.`);
    }

    if (!command.trim()) {
      console.error('[CODE MODE] No prompt given. Usage: clawd-code code "Build a Jupiter swap bot"');
      return;
    }

    const useStream = this.config.stream ?? false;
    const code = useStream
      ? await this.generateStreaming(command, provider, model)
      : await this.generateBlocking(command, provider, model);

    const outputDir = join(process.cwd(), 'outputs');
    mkdirSync(outputDir, { recursive: true });
    const filename = `clawd-code-${Date.now()}.ts`;
    const filepath = join(outputDir, filename);

    writeFileSync(filepath, code);
    console.log(`\n[CODE MODE] Written to: ${filepath}`);

    if (existsSync('tsconfig.json')) {
      console.log('[CODE MODE] Running TypeScript check...');
      try {
        execSync('npx tsc --noEmit', { stdio: 'inherit' });
        console.log('[CODE MODE] ✓ TypeScript check passed');
      } catch {
        console.log('[CODE MODE] ⚠ TypeScript check failed (see above)');
      }
    }
  }

  private resolveProvider(): string {
    const p = this.config.provider as string;
    if (p === 'anthropic' || isClaudeModel(this.config.model ?? '')) return 'anthropic';
    if (p === 'deepseek' || String(this.config.model ?? '').startsWith('deepseek-')) return 'deepseek';
    if (p === 'openrouter') return 'openrouter';
    return 'xai';
  }

  private async generateStreaming(prompt: string, provider: string, model: string): Promise<string> {
    process.stdout.write('\n[CODE MODE] Streaming output:\n\n');
    const chunks: string[] = [];

    try {
      if (provider === 'anthropic') {
        const client = createAnthropicClient(this.config.anthropicApiKey);
        if (!client) return this.fallbackCode(prompt, 'ANTHROPIC_API_KEY not set');

        const useModel = isClaudeModel(model) ? model : DEFAULT_CLAUDE_MODEL;
        for await (const chunk of client.stream({
          model: useModel,
          system: CODE_SYSTEM,
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 8096,
        })) {
          if (chunk.text) {
            process.stdout.write(chunk.text);
            chunks.push(chunk.text);
          }
        }
        process.stdout.write('\n');
        return chunks.join('');
      }

      if (provider === 'xai') {
        const client = createXaiClient(this.config.xaiApiKey);
        if (!client) return this.fallbackCode(prompt, 'XAI_API_KEY not set');

        for await (const chunk of client.streamChat({
          model,
          messages: [
            { role: 'system', content: CODE_SYSTEM },
            { role: 'user', content: prompt },
          ],
          maxTokens: 8096,
          temperature: 0.7,
        })) {
          if (chunk.text) {
            process.stdout.write(chunk.text);
            chunks.push(chunk.text);
          }
        }
        process.stdout.write('\n');
        return chunks.join('');
      }

      if (provider === 'openrouter') {
        const env = loadClawdEnv();
        const client = createOpenRouterClient(env);
        if (!client) return this.fallbackCode(prompt, 'OPENROUTER_API_KEY not set');

        for await (const chunk of client.stream({
          model: this.config.model?.startsWith('grok-') ? client.getDefaultModel() : (this.config.model ?? client.getDefaultModel()),
          messages: [
            { role: 'system', content: CODE_SYSTEM },
            { role: 'user', content: prompt },
          ],
          max_tokens: 8096,
        })) {
          if (chunk.content) {
            process.stdout.write(chunk.content);
            chunks.push(chunk.content);
          }
        }
        process.stdout.write('\n');
        return chunks.join('');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`\n[CODE MODE] Streaming error (${provider}): ${msg} — falling back to blocking`);
    }

    // Fall back to blocking for deepseek or on stream failure
    return this.generateBlocking(prompt, provider, model);
  }

  private async generateBlocking(prompt: string, provider: string, model: string): Promise<string> {
    try {
      if (provider === 'anthropic') {
        const client = createAnthropicClient(this.config.anthropicApiKey);
        if (!client) return this.fallbackCode(prompt, 'ANTHROPIC_API_KEY not set');

        const useModel = isClaudeModel(model) ? model : DEFAULT_CLAUDE_MODEL;
        console.log(`[CODE MODE] Generating with ${useModel}...`);
        const response = await client.chat({
          model: useModel,
          system: CODE_SYSTEM,
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 8096,
        });
        return response.content || this.fallbackCode(prompt, 'empty response');
      }

      if (provider === 'deepseek') {
        const client = createDeepSeekClient(this.config.deepSeekApiKey, this.config.deepSeekBaseUrl);
        if (!client) return this.fallbackCode(prompt, 'DEEPSEEK_API_KEY not set');

        const useModel = String(model).startsWith('deepseek-') ? model : 'deepseek-v4-pro';
        console.log(`[CODE MODE] Generating with ${useModel}...`);
        const response = await client.chat({
          model: useModel,
          messages: [
            { role: 'system', content: CODE_SYSTEM },
            { role: 'user', content: prompt },
          ],
          maxTokens: 8096,
          temperature: 0.7,
          reasoningEffort: 'high',
          thinking: true,
        });
        return response.content || this.fallbackCode(prompt, 'empty response');
      }

      if (provider === 'openrouter') {
        const env = loadClawdEnv();
        const client = createOpenRouterClient(env);
        if (!client) return this.fallbackCode(prompt, 'OPENROUTER_API_KEY not set');

        const useModel = this.config.model?.startsWith('grok-') ? client.getDefaultModel() : (this.config.model ?? client.getDefaultModel());
        console.log(`[CODE MODE] Generating with OpenRouter/${useModel}...`);
        const result = await client.prompt(prompt, {
          model: useModel,
          systemPrompt: CODE_SYSTEM,
          maxTokens: 8096,
        });
        return result.content || this.fallbackCode(prompt, 'empty response');
      }

      // xAI default
      const client = createXaiClient(this.config.xaiApiKey);
      if (!client) return this.fallbackCode(prompt, 'XAI_API_KEY not set');

      const useModel = normalizeModelId(model || DEFAULT_MODEL);
      console.log(`[CODE MODE] Generating with ${useModel}...`);
      const response = await client.chat({
        model: useModel,
        messages: [
          { role: 'system', content: CODE_SYSTEM },
          { role: 'user', content: prompt },
        ],
        maxTokens: 8096,
        temperature: 0.7,
      });
      return response.content || this.fallbackCode(prompt, 'empty response');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`[CODE MODE] ${provider} unavailable: ${msg}`);
      return this.fallbackCode(prompt, msg);
    }
  }

  private fallbackCode(prompt: string, reason: string): string {
    return `// Clawd Code — Generated Code
// Note: ${reason}
// Add the appropriate API key to ~/.clawd-code/.env and re-run.

// Original prompt: ${prompt}

export {};
`;
  }
}
