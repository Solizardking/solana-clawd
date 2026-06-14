import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Interaction,
  type Message,
  type TextChannel,
} from "discord.js";
import { EventEmitter } from "node:events";

// ── CLAWD token constants ─────────────────────────────────────────────────────
const CLAWD_MINT = process.env.TOKEN_ADDRESS ?? "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
const CLAWD_MIN_BALANCE = Number(process.env.CLAWD_MIN_BALANCE ?? "100000");
const CLAWD_BUY_URL = `https://jup.ag/swap/SOL-${CLAWD_MINT}`;
const CLAWD_SOLSCAN = `https://solscan.io/token/${CLAWD_MINT}`;

export type DiscordMessageEvent = {
  id: string;
  channelId: string;
  channelName: string;
  guildId: string | null;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  content: string;
  attachments: { url: string; name: string; contentType: string | null }[];
  isBot: boolean;
  isFromBridge: boolean;
  createdAt: string;
};

export type DiscordChannelInfo = {
  id: string;
  name: string;
  topic: string | null;
  parentName: string | null;
  position: number;
};

// ── Slash command definitions ────────────────────────────────────────────────

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if Toly is awake ⚡")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("nfts")
    .setDescription("View NFTs owned by a Solana wallet address")
    .addStringOption((opt) =>
      opt.setName("address").setDescription("Solana wallet address").setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("toly")
    .setDescription("Ask Toly (AI) anything about Solana, crypto, or trading")
    .addStringOption((opt) =>
      opt.setName("question").setDescription("Your question").setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("imagine")
    .setDescription("Generate an image with Grok Imagine")
    .addStringOption((opt) =>
      opt.setName("prompt").setDescription("What to generate").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("aspect")
        .setDescription("Aspect ratio (default: 1:1)")
        .addChoices(
          { name: "1:1 Square", value: "1:1" },
          { name: "16:9 Wide", value: "16:9" },
          { name: "9:16 Portrait", value: "9:16" },
          { name: "4:3", value: "4:3" },
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("imagine-edit")
    .setDescription("Edit an image with Grok Imagine")
    .addStringOption((opt) =>
      opt.setName("prompt").setDescription("What to change").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("image_url").setDescription("URL of the source image").setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("analyze")
    .setDescription("Analyze a chart or image with Grok Vision")
    .addStringOption((opt) =>
      opt.setName("image_url").setDescription("URL of the image to analyze").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("question").setDescription("What to look for (default: describe the chart/image)")
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("video")
    .setDescription("Generate a video from text with Grok Imagine (~1-3 min)")
    .addStringOption((opt) =>
      opt.setName("prompt").setDescription("Video description").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("duration").setDescription("Duration in seconds (1-15, default: 5)").setMinValue(1).setMaxValue(15)
    )
    .addStringOption((opt) =>
      opt.setName("aspect").setDescription("Aspect ratio (default: 16:9)")
        .addChoices(
          { name: "16:9 Wide", value: "16:9" },
          { name: "9:16 Portrait", value: "9:16" },
          { name: "1:1 Square", value: "1:1" },
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("img2video")
    .setDescription("Animate a still image into a video (~1-3 min)")
    .addStringOption((opt) =>
      opt.setName("image_url").setDescription("URL of the source image").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("prompt").setDescription("How to animate it").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("duration").setDescription("Duration in seconds (1-15, default: 5)").setMinValue(1).setMaxValue(15)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("video-edit")
    .setDescription("Edit an existing video with a text prompt (~1-3 min)")
    .addStringOption((opt) =>
      opt.setName("video_url").setDescription("URL of the source video").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("prompt").setDescription("What to change").setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("video-extend")
    .setDescription("Extend a video from its last frame (~1-3 min)")
    .addStringOption((opt) =>
      opt.setName("video_url").setDescription("URL of the source video").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("prompt").setDescription("What happens next").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("duration").setDescription("Extension duration in seconds (1-15, default: 5)").setMinValue(1).setMaxValue(15)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("price")
    .setDescription("Get live token price & stats via BirdEye")
    .addStringOption((opt) =>
      opt.setName("token").setDescription("Token mint address (default: $CLAWD)")
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("clawd")
    .setDescription("$CLAWD token stats, price, and where to buy")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Verify you hold $CLAWD to unlock holder perks")
    .addStringOption((opt) =>
      opt.setName("wallet").setDescription("Your Solana wallet address").setRequired(true)
    )
    .toJSON(),
];

// ── xAI helpers ──────────────────────────────────────────────────────────────

function xaiKey(): string {
  return process.env.XAI_API_KEY ?? "";
}

async function generateImage(prompt: string, aspectRatio = "1:1", imageUrl?: string): Promise<string> {
  const key = xaiKey();
  if (!key) throw new Error("XAI_API_KEY not set");

  const endpoint = imageUrl
    ? "https://api.x.ai/v1/images/edits"
    : "https://api.x.ai/v1/images/generations";

  const body: Record<string, unknown> = {
    model: "grok-imagine-image-quality",
    prompt,
    aspect_ratio: aspectRatio,
    response_format: "url",
  };
  if (imageUrl) body.image = { url: imageUrl, type: "image_url" };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`xAI image API error ${res.status}: ${await res.text()}`);
  const data = await res.json() as { data?: { url?: string }[] };
  const url = data.data?.[0]?.url;
  if (!url) throw new Error("No image URL returned");
  return url;
}

async function generateVideo(prompt: string, duration = 5, aspectRatio = "16:9"): Promise<string> {
  const key = xaiKey();
  if (!key) throw new Error("XAI_API_KEY not set");
  const startRes = await fetch("https://api.x.ai/v1/videos/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "grok-imagine-video", prompt, duration, aspect_ratio: aspectRatio, resolution: "720p" }),
  });
  if (!startRes.ok) throw new Error(`Video start error ${startRes.status}: ${await startRes.text()}`);
  return pollVideo((await startRes.json() as { request_id: string }).request_id, key);
}

async function imageToVideo(imageUrl: string, prompt: string, duration = 5): Promise<string> {
  const key = xaiKey();
  if (!key) throw new Error("XAI_API_KEY not set");
  const startRes = await fetch("https://api.x.ai/v1/videos/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "grok-imagine-video",
      prompt,
      duration,
      image: { url: imageUrl, type: "image_url" },
      resolution: "720p",
    }),
  });
  if (!startRes.ok) throw new Error(`img2video start error ${startRes.status}: ${await startRes.text()}`);
  return pollVideo((await startRes.json() as { request_id: string }).request_id, key);
}

async function editVideo(videoUrl: string, prompt: string): Promise<string> {
  const key = xaiKey();
  if (!key) throw new Error("XAI_API_KEY not set");
  const startRes = await fetch("https://api.x.ai/v1/videos/edits", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "grok-imagine-video", prompt, video_url: videoUrl }),
  });
  if (!startRes.ok) throw new Error(`video-edit start error ${startRes.status}: ${await startRes.text()}`);
  return pollVideo((await startRes.json() as { request_id: string }).request_id, key);
}

async function extendVideo(videoUrl: string, prompt: string, duration = 5): Promise<string> {
  const key = xaiKey();
  if (!key) throw new Error("XAI_API_KEY not set");
  const startRes = await fetch("https://api.x.ai/v1/videos/extensions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "grok-imagine-video", prompt, duration, video: { url: videoUrl } }),
  });
  if (!startRes.ok) throw new Error(`video-extend start error ${startRes.status}: ${await startRes.text()}`);
  return pollVideo((await startRes.json() as { request_id: string }).request_id, key);
}

async function pollVideo(requestId: string, key: string): Promise<string> {
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 8000));
    const poll = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = await poll.json() as { status: string; video?: { url: string } };
    if (data.status === "done" && data.video?.url) return data.video.url;
    if (data.status === "expired" || data.status === "failed") throw new Error(`Video ${data.status}`);
  }
  throw new Error("Video generation timed out");
}

async function analyzeImage(imageUrl: string, question: string): Promise<string> {
  const key = xaiKey();
  if (!key) return "XAI_API_KEY not configured.";

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "grok-4",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            { type: "text", text: question },
          ],
        },
      ],
      max_tokens: 600,
    }),
  });
  if (!res.ok) return `Vision API error: ${res.status}`;
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "No analysis returned.";
}

// ── Grok conversational AI ───────────────────────────────────────────────────

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const userHistory = new Map<string, ChatMessage[]>();
const MAX_HISTORY = 12;

const TOLY_SYSTEM: ChatMessage = {
  role: "system",
  content: `You are **Toly**, the AI agent for Cheshire Terminal — a Solana-native trading and NFT platform.

Personality: Witty, sharp, direct. You talk like a Solana degen who has seen every rug and survived. You celebrate wins, call out bad ideas, and always have an interesting take.

Expertise:
- Solana ecosystem: wallets, tokens, NFTs, DeFi, memecoins, validators, staking
- On-chain data: reading transactions, mint addresses, PDAs, SPL tokens
- Trading: Jupiter, Raydium, Orca, order flow, liquidity, price impact
- Cheshire Terminal: NFT scanning (/nfts), image gen (/imagine), video gen (/video), chart analysis (/analyze)

Rules:
- Use Discord markdown (bold, code blocks, bullets)
- Under 300 words unless asked for more
- Never give financial advice — frame as "data shows..." not "you should..."
- For wallet/NFT lookups tell them to use \`/nfts <address>\`
- For token prices suggest cheshireterminal.ai`,
};

async function askToly(userId: string, question: string): Promise<string> {
  const key = xaiKey();
  if (!key) return "AI not configured — XAI_API_KEY missing.";

  let history = userHistory.get(userId) ?? [];
  history.push({ role: "user", content: question });
  if (history.length > MAX_HISTORY) history = history.slice(history.length - MAX_HISTORY);

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "grok-3",
        messages: [TOLY_SYSTEM, ...history],
        max_tokens: 512,
        temperature: 0.85,
      }),
    });

    if (!res.ok) {
      console.error("[discord] xAI error:", await res.text());
      return "Grok is having a moment. Try again in a sec.";
    }

    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const reply = data.choices?.[0]?.message?.content ?? "No response.";
    history.push({ role: "assistant", content: reply });
    userHistory.set(userId, history);
    return reply;
  } catch (e: unknown) {
    console.error("[discord] askToly error:", e);
    return "Network error reaching xAI. Try again.";
  }
}

// ── Helius NFT lookup ────────────────────────────────────────────────────────

type NftInfo = {
  name: string;
  image: string;
  description: string;
  mintAddress: string;
  attributes: { trait_type: string; value: string }[];
};

async function fetchNFTs(address: string): Promise<NftInfo[]> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) throw new Error("HELIUS_API_KEY not set");
  const res = await fetch(`https://api.helius.xyz/v0/addresses/${address}/nfts?api-key=${apiKey}`);
  if (!res.ok) throw new Error(`Helius API error: ${res.status}`);
  const data = await res.json() as {
    nfts?: { name?: string; imageUri?: string; description?: string; id?: string; attributes?: { trait_type: string; value: string }[] }[];
  };
  return (data.nfts ?? []).map((n) => ({
    name: n.name ?? "Unknown NFT",
    image: n.imageUri ?? "",
    description: n.description ?? "",
    mintAddress: n.id ?? "",
    attributes: n.attributes ?? [],
  }));
}

// ── BirdEye token price ──────────────────────────────────────────────────────

type BirdEyeTokenData = {
  price: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  marketCap: number;
  symbol: string;
};

async function fetchBirdEyePrice(mint: string): Promise<BirdEyeTokenData> {
  const key = process.env.BIRDEYE_API_KEY;
  if (!key) throw new Error("BIRDEYE_API_KEY not set");
  const res = await fetch(`https://public-api.birdeye.so/defi/token_overview?address=${mint}`, {
    headers: { "X-API-KEY": key, "x-chain": "solana" },
  });
  if (!res.ok) throw new Error(`BirdEye API error: ${res.status}`);
  const json = await res.json() as {
    data?: {
      price?: number;
      priceChange24hPercent?: number;
      v24hUSD?: number;
      liquidity?: number;
      mc?: number;
      symbol?: string;
    };
  };
  const d = json.data;
  if (!d) throw new Error("No data returned from BirdEye");
  return {
    price: d.price ?? 0,
    priceChange24h: d.priceChange24hPercent ?? 0,
    volume24h: d.v24hUSD ?? 0,
    liquidity: d.liquidity ?? 0,
    marketCap: d.mc ?? 0,
    symbol: d.symbol ?? "???",
  };
}

// ── Helius CLAWD holder check ─────────────────────────────────────────────────

async function verifyCLAWDHolding(walletAddress: string): Promise<number> {
  const rpcUrl = process.env.HELIUS_RPC_URL;
  if (!rpcUrl) throw new Error("HELIUS_RPC_URL not set");
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountsByOwner",
      params: [walletAddress, { mint: CLAWD_MINT }, { encoding: "jsonParsed" }],
    }),
  });
  if (!res.ok) throw new Error(`Helius RPC error: ${res.status}`);
  const data = await res.json() as {
    result?: {
      value?: {
        account: { data: { parsed: { info: { tokenAmount: { uiAmount: number } } } } };
      }[];
    };
  };
  return (data.result?.value ?? []).reduce(
    (sum, acc) => sum + (acc.account.data.parsed.info.tokenAmount.uiAmount ?? 0),
    0,
  );
}

// ── Natural language intent detection ───────────────────────────────────────

function detectIntent(content: string): { type: "nfts"; address: string } | { type: "analyze"; imageUrl: string } | null {
  const solanaAddr = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/.exec(content);
  const nftKeywords = /\b(nft|nfts|collection|tokens?|wallet|holdings?|owns?)\b/i;
  if (solanaAddr && nftKeywords.test(content)) return { type: "nfts", address: solanaAddr[1] };

  const urlMatch = /(https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp))/i.exec(content);
  const analyzeKeywords = /\b(analyze|analyse|chart|graph|look at|what(?:'s| is) (this|in|on)|describe)\b/i;
  if (urlMatch && analyzeKeywords.test(content)) return { type: "analyze", imageUrl: urlMatch[1] };

  return null;
}

// ── Slash command handlers ───────────────────────────────────────────────────

async function handlePing(interaction: ChatInputCommandInteraction) {
  const latency = Date.now() - interaction.createdTimestamp;
  await interaction.reply(`🏓 Pong! Latency: **${latency}ms** | WS: **${interaction.client.ws.ping}ms**`);
}

async function handleNFTs(interaction: ChatInputCommandInteraction) {
  const address = interaction.options.getString("address", true);
  await interaction.deferReply();

  try {
    const nfts = await fetchNFTs(address);
    if (nfts.length === 0) { await interaction.editReply("No NFTs found for that wallet."); return; }

    let page = 0;
    const total = nfts.length;

    const buildEmbed = (i: number) => {
      const n = nfts[i];
      const embed = new EmbedBuilder()
        .setTitle(n.name)
        .setDescription(n.description || "No description")
        .setColor(0x9b59b6);
      if (n.mintAddress) embed.setURL(`https://solscan.io/token/${n.mintAddress}`);
      if (n.image) embed.setThumbnail(n.image);
      if (n.attributes.length > 0) {
        embed.addFields(n.attributes.slice(0, 12).map((a) => ({ name: a.trait_type, value: String(a.value), inline: true })));
      }
      embed.setFooter({ text: `NFT ${i + 1} / ${total} · ${address.slice(0, 8)}...` });
      return embed;
    };

    const buildRow = (i: number) =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`nft_prev_${i}`).setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(i === 0),
        new ButtonBuilder().setCustomId(`nft_next_${i}`).setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(i === total - 1)
      );

    const msg = await interaction.editReply({ embeds: [buildEmbed(page)], components: total > 1 ? [buildRow(page)] : [] });
    if (total <= 1) return;

    const collector = msg.createMessageComponentCollector({ time: 300_000 });
    collector.on("collect", async (btn) => {
      if (btn.customId.startsWith("nft_prev_")) page = Math.max(0, page - 1);
      else if (btn.customId.startsWith("nft_next_")) page = Math.min(total - 1, page + 1);
      await btn.update({ embeds: [buildEmbed(page)], components: [buildRow(page)] });
    });
    collector.on("end", async () => { try { await interaction.editReply({ components: [] }); } catch { /* ignore */ } });
  } catch (e: unknown) {
    await interaction.editReply(`Error fetching NFTs: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function handleTolyCmd(interaction: ChatInputCommandInteraction) {
  const question = interaction.options.getString("question", true);
  await interaction.deferReply();
  const answer = await askToly(interaction.user.id, question);
  await interaction.editReply(answer);
}

async function handleImagine(interaction: ChatInputCommandInteraction) {
  const prompt = interaction.options.getString("prompt", true);
  const aspect = interaction.options.getString("aspect") ?? "1:1";
  await interaction.deferReply();
  try {
    await interaction.editReply(`🎨 Generating image...`);
    const url = await generateImage(prompt, aspect);
    const embed = new EmbedBuilder()
      .setTitle("🎨 Grok Imagine")
      .setDescription(`**${prompt}**`)
      .setImage(url)
      .setColor(0x7c3aed)
      .setFooter({ text: `${aspect} · grok-imagine-image-quality` });
    await interaction.editReply({ content: "", embeds: [embed] });
  } catch (e: unknown) {
    await interaction.editReply(`Image generation failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function handleImagineEdit(interaction: ChatInputCommandInteraction) {
  const prompt = interaction.options.getString("prompt", true);
  const imageUrl = interaction.options.getString("image_url", true);
  await interaction.deferReply();
  try {
    await interaction.editReply(`✏️ Editing image...`);
    const url = await generateImage(prompt, "auto", imageUrl);
    const embed = new EmbedBuilder()
      .setTitle("✏️ Image Edit")
      .setDescription(`**${prompt}**`)
      .setImage(url)
      .setColor(0x0ea5e9)
      .setFooter({ text: "grok-imagine-image-quality" });
    await interaction.editReply({ content: "", embeds: [embed] });
  } catch (e: unknown) {
    await interaction.editReply(`Image edit failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function handleAnalyze(interaction: ChatInputCommandInteraction) {
  const imageUrl = interaction.options.getString("image_url", true);
  const question = interaction.options.getString("question") ?? "Describe this image in detail. If it's a chart or graph, analyze the data, trends, key levels, and what it indicates.";
  await interaction.deferReply();
  try {
    const analysis = await analyzeImage(imageUrl, question);
    const embed = new EmbedBuilder()
      .setTitle("🔍 Vision Analysis")
      .setThumbnail(imageUrl)
      .setDescription(analysis.slice(0, 4000))
      .setColor(0x10b981)
      .setFooter({ text: "grok-4 vision" });
    await interaction.editReply({ embeds: [embed] });
  } catch (e: unknown) {
    await interaction.editReply(`Analysis failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function handleVideo(interaction: ChatInputCommandInteraction) {
  const prompt = interaction.options.getString("prompt", true);
  const duration = interaction.options.getInteger("duration") ?? 5;
  const aspect = interaction.options.getString("aspect") ?? "16:9";
  await interaction.deferReply();
  try {
    await interaction.editReply(`🎬 Generating video (\`${duration}s\`, \`${aspect}\`)... This takes 1-3 minutes, hang tight.`);
    const url = await generateVideo(prompt, duration, aspect);
    await interaction.editReply(`🎬 **Video ready!**\n> ${prompt}\n\n${url}`);
  } catch (e: unknown) {
    await interaction.editReply(`Video generation failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function handleImg2Video(interaction: ChatInputCommandInteraction) {
  const imageUrl = interaction.options.getString("image_url", true);
  const prompt = interaction.options.getString("prompt", true);
  const duration = interaction.options.getInteger("duration") ?? 5;
  await interaction.deferReply();
  try {
    await interaction.editReply(`🎞️ Animating image (\`${duration}s\`)... Hang tight ~1-3 min.`);
    const url = await imageToVideo(imageUrl, prompt, duration);
    await interaction.editReply(`🎞️ **Image animated!**\n> ${prompt}\n\n${url}`);
  } catch (e: unknown) {
    await interaction.editReply(`Image-to-video failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function handleVideoEdit(interaction: ChatInputCommandInteraction) {
  const videoUrl = interaction.options.getString("video_url", true);
  const prompt = interaction.options.getString("prompt", true);
  await interaction.deferReply();
  try {
    await interaction.editReply(`✂️ Editing video... Hang tight ~1-3 min.`);
    const url = await editVideo(videoUrl, prompt);
    await interaction.editReply(`✂️ **Video edited!**\n> ${prompt}\n\n${url}`);
  } catch (e: unknown) {
    await interaction.editReply(`Video edit failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function handleVideoExtend(interaction: ChatInputCommandInteraction) {
  const videoUrl = interaction.options.getString("video_url", true);
  const prompt = interaction.options.getString("prompt", true);
  const duration = interaction.options.getInteger("duration") ?? 5;
  await interaction.deferReply();
  try {
    await interaction.editReply(`⏩ Extending video by \`${duration}s\`... Hang tight ~1-3 min.`);
    const url = await extendVideo(videoUrl, prompt, duration);
    await interaction.editReply(`⏩ **Video extended!**\n> ${prompt}\n\n${url}`);
  } catch (e: unknown) {
    await interaction.editReply(`Video extension failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function fmtPrice(p: number): string {
  return p < 0.001 ? `$${p.toExponential(4)}` : `$${p.toFixed(6)}`;
}

function fmtUsd(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

async function handlePrice(interaction: ChatInputCommandInteraction) {
  const mint = interaction.options.getString("token") ?? CLAWD_MINT;
  await interaction.deferReply();
  try {
    const d = await fetchBirdEyePrice(mint);
    const up = d.priceChange24h >= 0;
    const embed = new EmbedBuilder()
      .setTitle(`${mint === CLAWD_MINT ? "😸 $CLAWD" : `🪙 ${d.symbol}`} · Live Price`)
      .setColor(up ? 0x22c55e : 0xef4444)
      .addFields(
        { name: "💰 Price", value: fmtPrice(d.price), inline: true },
        { name: `${up ? "📈" : "📉"} 24h`, value: `${up ? "+" : ""}${d.priceChange24h.toFixed(2)}%`, inline: true },
        { name: "📊 Mkt Cap", value: d.marketCap > 0 ? fmtUsd(d.marketCap) : "—", inline: true },
        { name: "💧 Liquidity", value: d.liquidity > 0 ? fmtUsd(d.liquidity) : "—", inline: true },
        { name: "📈 24h Vol", value: d.volume24h > 0 ? fmtUsd(d.volume24h) : "—", inline: true },
      )
      .setFooter({ text: `${mint.slice(0, 8)}...${mint.slice(-4)} · BirdEye` });
    if (mint === CLAWD_MINT) {
      embed.addFields({ name: "🛒 Buy", value: `[Jupiter](${CLAWD_BUY_URL}) · [Solscan](${CLAWD_SOLSCAN})`, inline: false });
    }
    await interaction.editReply({ embeds: [embed] });
  } catch (e: unknown) {
    await interaction.editReply(`Price fetch failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function handleClawd(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  try {
    const d = await fetchBirdEyePrice(CLAWD_MINT);
    const up = d.priceChange24h >= 0;
    const embed = new EmbedBuilder()
      .setTitle("😸 $CLAWD — The Cheshire Cat Token")
      .setDescription(
        `The memecoin powering **Cheshire Terminal** — your Solana-native AI trading and NFT platform.\n\n` +
        `Hold **${CLAWD_MIN_BALANCE.toLocaleString()}+ $CLAWD** to unlock exclusive perks, ` +
        `token-gated channels, and the Cheshire inner circle. Now you see me, now you don't — but the gains are real. 😸`,
      )
      .setColor(0x9b59b6)
      .addFields(
        { name: "💰 Price", value: fmtPrice(d.price), inline: true },
        { name: `${up ? "📈" : "📉"} 24h`, value: `${up ? "+" : ""}${d.priceChange24h.toFixed(2)}%`, inline: true },
        { name: "📊 Mkt Cap", value: d.marketCap > 0 ? fmtUsd(d.marketCap) : "—", inline: true },
        { name: "🛒 Buy $CLAWD", value: `[Jupiter Swap](${CLAWD_BUY_URL})`, inline: true },
        { name: "🔍 Solscan", value: `[View Token](${CLAWD_SOLSCAN})`, inline: true },
        { name: "✅ Verify Holdings", value: `Run \`/verify wallet:<your_address>\``, inline: false },
        { name: "📋 Contract", value: `\`${CLAWD_MINT}\``, inline: false },
      )
      .setFooter({ text: "BirdEye · live data" });
    await interaction.editReply({ embeds: [embed] });
  } catch {
    const embed = new EmbedBuilder()
      .setTitle("😸 $CLAWD — The Cheshire Cat Token")
      .setDescription(
        `The memecoin powering **Cheshire Terminal**.\n\n` +
        `Hold **${CLAWD_MIN_BALANCE.toLocaleString()}+ $CLAWD** to unlock holder perks and token-gated channels.`,
      )
      .setColor(0x9b59b6)
      .addFields(
        { name: "🛒 Buy $CLAWD", value: `[Jupiter Swap](${CLAWD_BUY_URL})`, inline: true },
        { name: "🔍 Solscan", value: `[View Token](${CLAWD_SOLSCAN})`, inline: true },
        { name: "📋 Contract", value: `\`${CLAWD_MINT}\``, inline: false },
      )
      .setFooter({ text: "Live price temporarily unavailable" });
    await interaction.editReply({ embeds: [embed] });
  }
}

async function handleVerify(interaction: ChatInputCommandInteraction) {
  const wallet = interaction.options.getString("wallet", true).trim();
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
    await interaction.editReply("❌ Invalid Solana wallet address. Double-check and try again.");
    return;
  }

  try {
    await interaction.editReply(`🔍 Checking \`${wallet.slice(0, 8)}...\` for $CLAWD holdings...`);
    const balance = await verifyCLAWDHolding(wallet);

    if (balance < CLAWD_MIN_BALANCE) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Insufficient $CLAWD")
        .setDescription(
          `Wallet \`${wallet.slice(0, 8)}...\` holds **${balance.toLocaleString()} $CLAWD**.\n\n` +
          `You need **${CLAWD_MIN_BALANCE.toLocaleString()}+** to unlock holder perks.`,
        )
        .setColor(0xef4444)
        .addFields({ name: "🛒 Get $CLAWD", value: `[Buy on Jupiter](${CLAWD_BUY_URL})`, inline: true });
      await interaction.editReply({ content: "", embeds: [embed] });
      return;
    }

    let roleAssigned = false;
    const roleId = process.env.CLAWD_HOLDER_ROLE_ID;
    if (roleId && interaction.guild) {
      try {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        await member.roles.add(roleId);
        roleAssigned = true;
      } catch (e) {
        console.error("[discord] role assignment failed:", e);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("✅ CLAWD Holder Verified!")
      .setDescription(
        `Wallet \`${wallet.slice(0, 8)}...\` holds **${balance.toLocaleString()} $CLAWD**. 😸\n\n` +
        (roleAssigned ? "🎉 Your **CLAWD Holder** role has been assigned!" : "Welcome to the Cheshire inner circle!"),
      )
      .setColor(0x22c55e)
      .setFooter({ text: `Verified via Helius · min ${CLAWD_MIN_BALANCE.toLocaleString()} $CLAWD` });
    await interaction.editReply({ content: "", embeds: [embed] });
  } catch (e: unknown) {
    await interaction.editReply(`Verification failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ── Main DiscordBot class ────────────────────────────────────────────────────

class DiscordBot extends EventEmitter {
  private client: Client | null = null;
  private ready = false;
  private starting = false;
  private startError: string | null = null;
  private guildId: string;

  constructor() {
    super();
    this.guildId = process.env.GUILD_ID ?? process.env.DISCORD_SERVER_ID ?? "";
  }

  isConfigured(): boolean { return !!process.env.DISCORD_BOT_TOKEN; }
  isReady(): boolean { return this.ready; }

  status() {
    return {
      configured: this.isConfigured(),
      ready: this.ready,
      starting: this.starting,
      error: this.startError,
      guildId: this.guildId || null,
      botUser: this.client?.user
        ? { id: this.client.user.id, tag: this.client.user.tag, avatar: this.client.user.displayAvatarURL() }
        : null,
    };
  }

  private async registerSlashCommands() {
    const token = process.env.DISCORD_BOT_TOKEN;
    const appId = process.env.DISCORD_APPLICATION_ID;
    if (!token || !appId) {
      console.warn("[discord] skipping slash command registration — DISCORD_APPLICATION_ID not set");
      return;
    }
    const rest = new REST({ version: "10" }).setToken(token);
    try {
      if (this.guildId) {
        await rest.put(Routes.applicationGuildCommands(appId, this.guildId), { body: commands });
        console.log(`[discord] slash commands registered for guild ${this.guildId}`);
      } else {
        await rest.put(Routes.applicationCommands(appId), { body: commands });
        console.log("[discord] slash commands registered globally");
      }
    } catch (e) {
      console.error("[discord] slash command registration failed:", e);
    }
  }

  async start(): Promise<void> {
    if (this.ready || this.starting) return;
    if (!this.isConfigured()) { this.startError = "DISCORD_BOT_TOKEN not set"; return; }
    this.starting = true;
    this.startError = null;

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
      partials: [Partials.Channel, Partials.Message],
    });

    client.once(Events.ClientReady, async (c) => {
      this.ready = true;
      this.starting = false;
      console.log(`[discord] logged in as ${c.user.tag}`);
      await this.registerSlashCommands();
    });

    client.on(Events.InteractionCreate, async (interaction: Interaction) => {
      if (!interaction.isChatInputCommand()) return;
      // Drop interactions older than 2.5 s — they're past Discord's 3 s ACK window
      // and attempting deferReply would produce a 10062 Unknown Interaction error.
      if (Date.now() - interaction.createdTimestamp > 2500) return;
      try {
        switch (interaction.commandName) {
          case "ping": await handlePing(interaction); break;
          case "nfts": await handleNFTs(interaction); break;
          case "toly": await handleTolyCmd(interaction); break;
          case "imagine": await handleImagine(interaction); break;
          case "imagine-edit": await handleImagineEdit(interaction); break;
          case "analyze": await handleAnalyze(interaction); break;
          case "video": await handleVideo(interaction); break;
          case "img2video": await handleImg2Video(interaction); break;
          case "video-edit": await handleVideoEdit(interaction); break;
          case "video-extend": await handleVideoExtend(interaction); break;
          case "price": await handlePrice(interaction); break;
          case "clawd": await handleClawd(interaction); break;
          case "verify": await handleVerify(interaction); break;
        }
      } catch (e) {
        console.error("[discord] slash command error:", e);
        const msg = "Something went wrong.";
        if (interaction.deferred || interaction.replied) await interaction.editReply(msg).catch(() => {});
        else await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    });

    client.on(Events.MessageCreate, async (msg: Message) => {
      try {
        if (!msg.guildId) return;
        if (this.guildId && msg.guildId !== this.guildId) return;
        if (msg.author.bot) return;

        this.emit("message", this.formatMessage(msg));

        const botId = client.user?.id;
        if (!botId || !msg.mentions.has(botId)) return;

        const text = msg.content.replace(/<@!?\d+>/g, "").trim();
        const attachmentImage = msg.attachments.find((a) => a.contentType?.startsWith("image/"));

        // If user attached an image, analyze it
        if (attachmentImage) {
          if ("sendTyping" in msg.channel) await (msg.channel as TextChannel).sendTyping();
          const question = text || "Describe this image. If it's a chart, analyze the data, trends, and key levels.";
          const analysis = await analyzeImage(attachmentImage.url, question);
          await msg.reply(analysis);
          return;
        }

        if (!text) {
          await msg.reply("What's up? Ask me anything, or try `/toly`, `/imagine`, `/nfts`, `/analyze`, or `/video`.");
          return;
        }

        // Intent detection — auto-trigger NFT or image analysis without slash command
        const intent = detectIntent(text);
        if (intent?.type === "nfts") {
          if ("sendTyping" in msg.channel) await (msg.channel as TextChannel).sendTyping();
          try {
            const nfts = await fetchNFTs(intent.address);
            await msg.reply(nfts.length === 0
              ? "No NFTs found for that wallet."
              : `Found **${nfts.length} NFT(s)** for \`${intent.address.slice(0, 8)}...\`. Use \`/nfts ${intent.address}\` for the full paginated view.`
            );
          } catch (e: unknown) {
            await msg.reply(`Error: ${e instanceof Error ? e.message : String(e)}`);
          }
          return;
        }

        if (intent?.type === "analyze") {
          if ("sendTyping" in msg.channel) await (msg.channel as TextChannel).sendTyping();
          const analysis = await analyzeImage(intent.imageUrl, text);
          await msg.reply(analysis);
          return;
        }

        if ("sendTyping" in msg.channel) await (msg.channel as TextChannel).sendTyping();
        const answer = await askToly(msg.author.id, text);
        await msg.reply(answer);
      } catch (e) {
        console.error("[discord] messageCreate handler error:", e);
      }
    });

    client.on(Events.Error, (e) => console.error("[discord] client error:", e));
    client.on(Events.Warn, (w) => console.warn("[discord] warn:", w));

    this.client = client;

    try {
      const token = process.env.DISCORD_BOT_TOKEN ?? "";
      await client.login(token);
    } catch (e: unknown) {
      this.startError = e instanceof Error ? e.message : String(e);
      this.starting = false;
      console.error("[discord] login failed:", this.startError);
    }
  }

  private formatMessage(msg: Message): DiscordMessageEvent {
    const channelName = msg.channel.type === ChannelType.GuildText ? (msg.channel as TextChannel).name : "unknown";
    return {
      id: msg.id,
      channelId: msg.channelId,
      channelName,
      guildId: msg.guildId,
      authorId: msg.author.id,
      authorName: msg.author.username,
      authorAvatar: msg.author.displayAvatarURL(),
      content: msg.content,
      attachments: Array.from(msg.attachments.values()).map((a) => ({
        url: a.url,
        name: a.name ?? "file",
        contentType: a.contentType,
      })),
      isBot: msg.author.bot,
      isFromBridge: msg.author.id === this.client?.user?.id,
      createdAt: new Date(msg.createdTimestamp).toISOString(),
    };
  }

  async listChannels(): Promise<DiscordChannelInfo[]> {
    if (!this.ready || !this.client) throw new Error("Discord bot not ready");
    const guild = this.guildId ? await this.client.guilds.fetch(this.guildId) : this.client.guilds.cache.first();
    if (!guild) throw new Error("Bot is not in any guild");
    const channels = await guild.channels.fetch();
    const out: DiscordChannelInfo[] = [];
    channels.forEach((ch) => {
      if (ch && ch.type === ChannelType.GuildText) {
        out.push({ id: ch.id, name: ch.name, topic: (ch as TextChannel).topic, parentName: ch.parent?.name ?? null, position: ch.position ?? 0 });
      }
    });
    out.sort((a, b) => (a.parentName ?? "").localeCompare(b.parentName ?? "") || a.position - b.position);
    return out;
  }

  async getMessages(channelId: string, limit = 50): Promise<DiscordMessageEvent[]> {
    if (!this.ready || !this.client) throw new Error("Discord bot not ready");
    const ch = await this.client.channels.fetch(channelId);
    if (!ch || ch.type !== ChannelType.GuildText) throw new Error("Channel not found or not text");
    const fetched = await (ch as TextChannel).messages.fetch({ limit: Math.min(Math.max(limit, 1), 100) });
    return Array.from(fetched.values()).reverse().map((m) => this.formatMessage(m));
  }

  async sendMessage(channelId: string, content: string, authorTag?: string): Promise<DiscordMessageEvent> {
    if (!this.ready || !this.client) throw new Error("Discord bot not ready");
    const ch = await this.client.channels.fetch(channelId);
    if (!ch || ch.type !== ChannelType.GuildText) throw new Error("Channel not found or not text");
    const prefixed = authorTag ? `**[${authorTag}]** ${content}` : content;
    const sent = await (ch as TextChannel).send(prefixed);
    return this.formatMessage(sent);
  }

  async findChannelByName(name: string): Promise<DiscordChannelInfo | null> {
    const channels = await this.listChannels();
    const lc = name.toLowerCase().replace(/^#/, "");
    return channels.find((c) => c.name.toLowerCase() === lc) ?? channels[0] ?? null;
  }
}

export const discordBot = new DiscordBot();
