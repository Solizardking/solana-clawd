import { Router, Request, Response } from 'express';
import { isAuthenticated } from '../middleware/session';

const router = Router();
const ASSEMBLY_AGENT_BASE = 'https://agents.assemblyai.com';

function getAssemblyApiKey() {
  return process.env.ASSEMBLY_API_KEY || process.env.ASSEMBLYAI_API_KEY || '';
}

// All voice-agent routes require an authenticated session.
router.use(isAuthenticated);

/**
 * POST /api/voice-agent/token
 *
 * Generates a short-lived AssemblyAI temporary token the browser
 * uses to open the Voice Agent WebSocket without exposing the API key.
 */
router.post('/token', async (_req: Request, res: Response) => {
  const apiKey = getAssemblyApiKey();
  if (!apiKey) {
    return res.status(500).json({ error: 'ASSEMBLY_API_KEY or ASSEMBLYAI_API_KEY is not configured on the server' });
  }

  try {
    const url = new URL('/v1/token', ASSEMBLY_AGENT_BASE);
    url.searchParams.set('expires_in_seconds', '480');
    url.searchParams.set('max_session_duration_seconds', '3600');

    const r = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!r.ok) {
      const text = await r.text();
      console.error('[voice-agent] AssemblyAI token error:', r.status, text);
      return res.status(r.status).json({ error: `AssemblyAI error: ${r.status}` });
    }

    const data = await r.json() as { token: string };
    return res.json(data);
  } catch (err: any) {
    console.error('[voice-agent] token generation failed:', err);
    return res.status(500).json({ error: err.message ?? 'Failed to generate token' });
  }
});

/**
 * GET /api/voice-agent/status
 */
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    configured: !!getAssemblyApiKey(),
    env: process.env.ASSEMBLY_API_KEY ? 'ASSEMBLY_API_KEY' : process.env.ASSEMBLYAI_API_KEY ? 'ASSEMBLYAI_API_KEY' : null,
    endpoint: `${ASSEMBLY_AGENT_BASE}/v1/token`,
  });
});

export default router;
