import Together from "together-ai";

interface TokenomicsParams {
  initialSupply: number;
  buyTax: number;
  sellTax: number;
  maxWallet: number;
  maxTransaction: number;
}

interface TokenGenResponse {
  name: string;
  symbol: string;
  description: string;
  tokenomics: TokenomicsParams;
  artPrompt: string;
}

export async function generateTokenomics(concept: string): Promise<TokenGenResponse> {
  const systemPrompt = `You are a tokenomics expert. Generate appropriate token parameters for a meme token based on the concept.
Follow these rules:
- Symbol should be 3-5 characters, all caps
- Initial supply should be between 100M and 1B
- Tax rates should be between 1-5%
- Include a description that's catchy and meme-worthy
- Generate an art prompt that captures the token's essence
Format as JSON with: name, symbol, description, tokenomics (supply, buyTax, sellTax, maxWallet, maxTransaction), artPrompt`;

  const userPrompt = `Create a meme token based on this concept: ${concept}`;

  if (!process.env.TOGETHER_API_KEY) {
    throw new Error('TOGETHER_API_KEY is required');
  }

  const together = new Together({ apiKey: process.env.TOGETHER_API_KEY });

  const response = await together.chat.completions.create({
    model: "grok-3",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: { type: "json_object" }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Tokenomics generation returned an empty response");
  }

  const result = JSON.parse(content);

  // Validate and normalize the response
  return {
    name: result.name,
    symbol: result.symbol.toUpperCase(),
    description: result.description,
    tokenomics: {
      initialSupply: Math.min(1_000_000_000, Math.max(100_000_000, result.tokenomics.supply)),
      buyTax: Math.min(5, Math.max(1, result.tokenomics.buyTax)),
      sellTax: Math.min(5, Math.max(1, result.tokenomics.sellTax)),
      maxWallet: Math.floor(result.tokenomics.supply * 0.02), // 2% max wallet
      maxTransaction: Math.floor(result.tokenomics.supply * 0.01) // 1% max tx
    },
    artPrompt: result.artPrompt
  };
}

export type { TokenomicsParams, TokenGenResponse };
