import { Router } from "express";

const router = Router();

// Discord OAuth2 callback — registered in Discord Dev Portal as:
// http://cheshireterminal.ai/discord/auth/callback
router.get("/auth/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;

  const appUrl = process.env.APP_URL ?? "https://cheshireterminal.ai";

  if (error) {
    return res.redirect(`${appUrl}?discordError=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.redirect(`${appUrl}?discordError=no_code`);
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.redirect(`${appUrl}?discordError=not_configured`);
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${appUrl}/discord/auth/callback`,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("[discord-oauth] token exchange failed:", err);
      return res.redirect(`${appUrl}?discordError=token_exchange_failed`);
    }

    const tokenData = await tokenRes.json() as {
      access_token: string;
      token_type: string;
      scope: string;
    };

    // Fetch Discord user info
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      return res.redirect(`${appUrl}?discordError=user_fetch_failed`);
    }

    const user = await userRes.json() as { id: string; username: string; discriminator: string; avatar: string | null };

    const tag = user.discriminator && user.discriminator !== "0"
      ? `${user.username}#${user.discriminator}`
      : user.username;

    // Store in session
    req.session.discordUser = { id: user.id, username: user.username, tag };
    req.session.save((err) => {
      if (err) console.error("[discord-oauth] session save error:", err);
      res.redirect(`${appUrl}?discordLinked=1&discordUser=${encodeURIComponent(tag)}`);
    });
  } catch (e: unknown) {
    console.error("[discord-oauth] error:", e);
    res.redirect(`${appUrl}?discordError=internal_error`);
  }
});

// Initiate Discord OAuth — redirects user to Discord consent screen
router.get("/oauth/start", (req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const appUrl = process.env.APP_URL ?? "https://cheshireterminal.ai";

  if (!clientId) {
    return res.status(503).json({ error: "Discord OAuth not configured" });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/discord/auth/callback`,
    response_type: "code",
    scope: "identify",
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

export default router;
