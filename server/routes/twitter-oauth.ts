import crypto from 'node:crypto';
import { Router, Request, Response } from 'express';
import { and, eq, or } from 'drizzle-orm';
import { db, hasDatabase } from '../db';
import { users, walletProfiles, walletSocialLinks } from '../../drizzle/schema';
import { isAuthenticated } from '../middleware/session';

const router = Router();

const APP_URL  = () => process.env.APP_URL ?? process.env.VITE_APP_URL ?? 'https://cheshireterminal.ai';
const CALLBACK = () => process.env.TWITTER_CALLBACK_URL ?? `${APP_URL()}/auth/callback/twitter`;

// ── PKCE helpers ──────────────────────────────────────────────────────────────
function generateVerifier(): string {
  return crypto.randomBytes(43).toString('base64url');
}
function generateChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ── GET /auth/twitter/start ───────────────────────────────────────────────────
// Requires an active wallet session — associates the Twitter account with the
// logged-in wallet on the callback.
router.get('/twitter/start', isAuthenticated, (req: Request, res: Response) => {
  const clientId = process.env.TWITTER_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({ error: 'Twitter OAuth not configured (missing TWITTER_CLIENT_ID)' });
  }

  const verifier  = generateVerifier();
  const challenge = generateChallenge(verifier);
  const state     = crypto.randomBytes(16).toString('hex');

  req.session.xOAuth = {
    codeVerifier:  verifier,
    state,
    walletAddress: req.session.walletAddress ?? '',
  };

  req.session.save((err) => {
    if (err) {
      console.error('[twitter-oauth] session save error:', err);
      return res.redirect(`${APP_URL()}?twitterError=session_error`);
    }

    const params = new URLSearchParams({
      response_type:         'code',
      client_id:             clientId,
      redirect_uri:          CALLBACK(),
      scope:                 'tweet.read users.read offline.access',
      state,
      code_challenge:        challenge,
      code_challenge_method: 'S256',
    });

    res.redirect(`https://twitter.com/i/oauth2/authorize?${params}`);
  });
});

// ── GET /auth/callback/twitter ────────────────────────────────────────────────
// Twitter redirects here after the user approves (or denies) the app.
router.get('/callback/twitter', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;
  const base = APP_URL();

  if (error) {
    return res.redirect(`${base}?twitterError=${encodeURIComponent(error)}`);
  }

  const session = req.session.xOAuth;
  if (!session || !code) {
    return res.redirect(`${base}?twitterError=invalid_state`);
  }

  if (state !== session.state) {
    return res.redirect(`${base}?twitterError=state_mismatch`);
  }

  const clientId     = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.redirect(`${base}?twitterError=not_configured`);
  }

  const walletAddress = session.walletAddress || req.session.walletAddress;
  delete req.session.xOAuth;

  try {
    // 1. Exchange authorization code for access token
    const basicCreds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicCreds}`,
      },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  CALLBACK(),
        code_verifier: session.codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error('[twitter-oauth] token exchange failed:', tokenRes.status, text);
      return res.redirect(`${base}?twitterError=token_exchange_failed`);
    }

    const tokenData = await tokenRes.json() as { access_token: string };

    // 2. Fetch the Twitter user
    const userRes = await fetch(
      'https://api.twitter.com/2/users/me?user.fields=username,name,profile_image_url',
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
    );

    if (!userRes.ok) {
      return res.redirect(`${base}?twitterError=user_fetch_failed`);
    }

    const { data: twitterUser } = await userRes.json() as {
      data: { id: string; username: string; name: string; profile_image_url?: string };
    };

    const handle = twitterUser.username; // e.g. "8bitsats"

    // 3. Persist to database
    if (hasDatabase && walletAddress) {
      const userId = req.session.userId;

      // Update users table
      if (userId) {
        await db.update(users).set({
          twitterUsername: handle,
          updatedAt: new Date(),
        }).where(eq(users.id, userId)).catch(console.warn);

        // Update walletProfile
        await db.update(walletProfiles).set({
          twitterUsername: handle,
          updatedAt: new Date(),
        }).where(
          and(eq(walletProfiles.userId, userId), eq(walletProfiles.walletAddress, walletAddress)),
        ).catch(console.warn);

        // Upsert walletSocialLinks
        const existing = await db.select().from(walletSocialLinks).where(
          and(
            eq(walletSocialLinks.userId, userId),
            eq(walletSocialLinks.walletAddress, walletAddress),
            eq(walletSocialLinks.provider, 'twitter'),
          ),
        ).limit(1).catch(() => []);

        const url = `https://x.com/${handle}`;
        if (existing[0]) {
          await db.update(walletSocialLinks).set({
            handle, url, verified: true, updatedAt: new Date(),
          }).where(eq(walletSocialLinks.id, existing[0].id)).catch(console.warn);
        } else {
          await db.insert(walletSocialLinks).values({
            userId, walletAddress, provider: 'twitter', handle, url, verified: true,
          }).catch(console.warn);
        }
      }
    }

    // 4. Store in session so the client knows immediately
    (req.session as any).twitterHandle = handle;
    req.session.save(() => {
      res.redirect(`${base}?twitterLinked=1&twitterHandle=${encodeURIComponent(handle)}`);
    });

  } catch (e: unknown) {
    console.error('[twitter-oauth] error:', e);
    res.redirect(`${base}?twitterError=internal_error`);
  }
});

// ── GET /auth/twitter/status ──────────────────────────────────────────────────
// Lets the client check if Twitter is linked for the current session.
router.get('/twitter/status', isAuthenticated, async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId || !hasDatabase) {
    return res.json({ linked: false });
  }
  try {
    const [user] = await db.select({ twitterUsername: users.twitterUsername })
      .from(users).where(eq(users.id, userId)).limit(1);
    res.json({ linked: !!user?.twitterUsername, handle: user?.twitterUsername ?? null });
  } catch {
    res.json({ linked: false });
  }
});

export default router;
