/**
 * Clawd Code — RESEARCH MODE
 * Multi-agent deep research with grok-4.20-multi-agent
 */

import { createXaiClient, type XaiTextResponse } from '../xai.js';

export class ResearchMode {
  constructor(private config: any) {}

  async run(args: string[]): Promise<void> {
    const query = args.filter(a => !a.startsWith('--')).join(' ');
    
    console.log('\n[RESEARCH MODE] Initiating multi-agent research...\n');
    console.log(`[RESEARCH MODE] Model: ${this.config.model}`);
    console.log(`[RESEARCH MODE] Agent Count: ${this.config.agentCount}`);
    console.log(`[RESEARCH MODE] Query: ${query}`);
    
    if (!this.config.xaiApiKey) {
      console.error('\n[RESEARCH MODE] ERROR: XAI_API_KEY not set');
      return;
    }

    console.log('\n[RESEARCH MODE] Spinning up grok-4.20-multi-agent with ' + this.config.agentCount + ' sub-agents...');
    console.log('[RESEARCH MODE] Tools enabled: web_search, x_search, code_execution');
    console.log('[RESEARCH MODE] Leader agent synthesizing findings...\n');

    const results = await this.runMultiAgentResearch(query);

    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║  RESEARCH RESULTS — grok-4.20-multi-agent                        ║');
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log('║  TOPIC: ' + query.substring(0, 50).padEnd(53) + '║');
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log('║  STATUS: complete | Agents requested: ' + String(this.config.agentCount).padEnd(25) + '║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');

    console.log('\n' + (results.content || 'No research output returned.'));
    if (results.citations.length > 0) {
      console.log('\nCitations:');
      for (const citation of results.citations) {
        console.log(`- ${citation}`);
      }
    }
    
    console.log('\n[RESEARCH MODE] Research complete. Say "code" to generate implementation.');
  }

  private async runMultiAgentResearch(query: string): Promise<XaiTextResponse> {
    try {
      const client = createXaiClient(this.config.xaiApiKey);
      if (!client) {
        return { content: 'Multi-agent research unavailable: XAI_API_KEY is not set.', citations: [] };
      }

      return await client.responses({
        model: this.config.model || 'grok-4.20-multi-agent',
        reasoning: { effort: this.config.agentCount === 16 ? 'high' : 'low' },
        input: [
          {
            role: 'user',
            content: query,
          },
        ],
        tools: [
          { type: 'web_search' },
          { type: 'x_search' },
          { type: 'code_interpreter' },
        ],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: `Multi-agent research unavailable: ${message}`, citations: [] };
    }
  }
}
