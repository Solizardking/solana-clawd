// Genesis Bonding Curve Integration — launch agent tokens from the agent's
// Asset Signer PDA via the Metaplex Genesis API.
//
// Reference: https://developers.metaplex.com/agents/create-an-agent-token

export const GENESIS_API_BASE = "https://api.metaplex.com";

/** Input parameters for creating and registering a Genesis launch. */
export interface GenesisLaunchInput {
  /** The payer wallet public key (base58) */
  wallet: string;
  /** Agent identity binding */
  agent: {
    /** The agent's MPL Core asset public key */
    mint: string;
    /** Permanently bind this token to the agent. One-shot and irreversible. */
    setToken: boolean;
  };
  /** Launch type — currently only bondingCurve is supported for agent tokens */
  launchType: "bondingCurve";
  /** Network — mainnet-beta or solana-devnet */
  network?: "solana-mainnet" | "solana-devnet";
  /** Token metadata */
  token: {
    /** Token name (1-32 characters) */
    name: string;
    /** Token symbol (1-10 characters) */
    symbol: string;
    /** Irys gateway URL for the token image (required) */
    image: string;
    /** Optional description (max 250 chars) */
    description?: string;
    /** Optional external links */
    externalLinks?: {
      website?: string;
      twitter?: string;
      telegram?: string;
    };
  };
  /** Launch configuration */
  launch: {
    /** SOL amount for fee-free first buy by agent PDA */
    firstBuyAmount?: number;
    /** Override creator fee wallet (defaults to agent PDA) */
    creatorFeeWallet?: string;
  };
}

/** Result from a successful Genesis createAndRegisterLaunch call. */
export interface GenesisLaunchResult {
  /** The token mint address (base58) */
  mintAddress: string;
  /** Response from the registerLaunch step */
  launch: {
    /** Link to view the launch on metaplex.com */
    link?: string;
    /** Launch ID */
    id?: string;
  };
  /** Transaction signatures */
  signatures?: string[];
}

/**
 * Build a Genesis launch input payload from agent identity parameters.
 *
 * This produces the input for the Metaplex Genesis API's
 * createAndRegisterLaunch endpoint. The actual API call is made via
 * `@metaplex-foundation/genesis/api` or the Metaplex CLI.
 *
 * @param params.agentAsset - The agent's MPL Core asset public key
 * @param params.setToken - Permanently bind this token to the agent (default: true)
 * @param params.payer - The wallet paying for transaction fees
 * @param params.tokenName - Token name (1-32 chars)
 * @param params.tokenSymbol - Token symbol (1-10 chars)
 * @param params.tokenImage - Irys gateway URL for the token image
 * @param params.tokenDescription - Optional description
 * @param params.firstBuyAmount - SOL amount for fee-free first buy
 * @param params.network - mainnet-beta or devnet
 * @param params.creatorFeeWallet - Override creator fee wallet
 */
export function buildGenesisLaunchInput(params: {
  agentAsset: string;
  setToken?: boolean;
  payer: string;
  tokenName: string;
  tokenSymbol: string;
  tokenImage: string;
  tokenDescription?: string;
  firstBuyAmount?: number;
  network?: "solana-mainnet" | "solana-devnet";
  creatorFeeWallet?: string;
}): GenesisLaunchInput {
  const launchInput: GenesisLaunchInput = {
    wallet: params.payer,
    agent: {
      mint: params.agentAsset,
      setToken: params.setToken ?? true,
    },
    launchType: "bondingCurve",
    network: params.network,
    token: {
      name: params.tokenName,
      symbol: params.tokenSymbol,
      image: params.tokenImage,
    },
    launch: {},
  };

  if (params.tokenDescription) {
    launchInput.token.description = params.tokenDescription;
  }

  if (params.firstBuyAmount !== undefined) {
    launchInput.launch.firstBuyAmount = params.firstBuyAmount;
  }

  if (params.creatorFeeWallet) {
    launchInput.launch.creatorFeeWallet = params.creatorFeeWallet;
  }

  return launchInput;
}

/**
 * Validate a Genesis launch input before submitting.
 *
 * @returns Array of validation error messages, or empty array if valid.
 */
export function validateGenesisLaunchInput(
  input: GenesisLaunchInput,
): string[] {
  const errors: string[] = [];

  // Token name: 1-32 characters
  if (!input.token.name || input.token.name.length === 0) {
    errors.push("token.name is required");
  } else if (input.token.name.length > 32) {
    errors.push("token.name must be 1-32 characters");
  }

  // Token symbol: 1-10 characters
  if (!input.token.symbol || input.token.symbol.length === 0) {
    errors.push("token.symbol is required");
  } else if (input.token.symbol.length > 10) {
    errors.push("token.symbol must be 1-10 characters");
  }

  // Token image: must be Irys gateway URL
  if (
    !input.token.image ||
    !input.token.image.startsWith("https://gateway.irys.xyz/")
  ) {
    errors.push(
      'token.image must be an Irys gateway URL (https://gateway.irys.xyz/...)',
    );
  }

  // Token description: max 250 chars
  if (input.token.description && input.token.description.length > 250) {
    errors.push("token.description must be 250 characters or fewer");
  }

  // Agent mint
  if (!input.agent.mint) {
    errors.push("agent.mint (agent MPL Core asset public key) is required");
  }

  // Wallet
  if (!input.wallet) {
    errors.push("wallet (payer public key) is required");
  }

  // Launch type
  if (input.launchType !== "bondingCurve") {
    errors.push('launchType must be "bondingCurve"');
  }

  return errors;
}